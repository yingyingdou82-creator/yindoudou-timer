<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { EventItem } from '@shared/types'
import { useEvents } from './composables/useEvents'
import { useImages } from './composables/useImages'
import { isElectron, platformApi } from './platform'
import { scheduleMobileReminders } from './platform/mobileReminders'
import { computeDisplay } from './utils/calc'
import EventCard from './components/EventCard.vue'
import EventEditDialog from './components/EventEditDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import OnboardingGuide from './components/OnboardingGuide.vue'

const { events, load, remove, update } = useEvents()
const { clearAll: clearImageCache } = useImages()
const search = ref('')
const dialogShow = ref(false)
const editing = ref<EventItem | null>(null)

// 桌面小组件开关状态
const widgetOn = ref(false)
let unsubChanged: (() => void) | undefined

// 主题与字体（全局应用）
let unsubTheme: (() => void) | undefined
let unsubFont: (() => void) | undefined

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function applyFont(scale: number): void {
  // zoom 会把整个界面（含 px 尺寸）等比放大缩小，电脑和手机都支持
  document.documentElement.style.zoom = String(scale)
}

// 手机端底部导航：首页 / 添加 / 设置
const activeTab = ref<'home' | 'settings'>('home')

// 新手指引（第一次打开时展示）
const showGuide = ref(false)

function finishGuide(): void {
  showGuide.value = false
  void platformApi.settings.setGuideShown(true)
}

onMounted(() => {
  void load()
    .then(() => {
      syncAndroidWidget()
      void scheduleMobileReminders(events.value)
    })
    .catch((err) => {
      ElMessage.error('数据加载失败：' + (err instanceof Error ? err.message : String(err)))
    })
  // 数据在别处（比如小组件上）变化时，列表自动刷新
  unsubChanged = platformApi.onChanged(() => {
    clearImageCache() // 图片可能变了（如导入备份），重新读取
    void load().then(() => {
      syncAndroidWidget()
      void scheduleMobileReminders(events.value)
    })
  })
  void platformApi.widget.getState().then((s) => {
    widgetOn.value = s.visible
  })
  void platformApi.settings.get().then((s) => {
    applyTheme(s.theme)
    applyFont(s.fontScale)
    if (!s.guideShown) {
      showGuide.value = true
    }
  })
  unsubTheme = platformApi.onThemeChanged(applyTheme)
  unsubFont = platformApi.onFontChanged(applyFont)
})

onUnmounted(() => {
  unsubChanged?.()
  unsubTheme?.()
  unsubFont?.()
})

// —— 自绘标题栏的窗口控制 ——
const maximized = ref(false)
let unsubMax: (() => void) | undefined
const isMac = navigator.platform.toLowerCase().includes('mac')

onMounted(() => {
  unsubMax = platformApi.onMaximized((v) => {
    maximized.value = v
  })
})

onUnmounted(() => {
  unsubMax?.()
})

function winMin(): void {
  void platformApi.window.minimize()
}

function winMaxToggle(): void {
  void platformApi.window.maximizeToggle()
}

function winClose(): void {
  void platformApi.window.close()
}

// 双击顶部空白处 = 最大化/还原（Windows 惯例；点到按钮、输入框时不算）
function onTopbarDblclick(e: MouseEvent): void {
  const t = e.target as HTMLElement
  if (t.closest('button, input, .el-input, .el-popper, .el-dialog')) return
  winMaxToggle()
}

function openAddFromNav(): void {
  activeTab.value = 'home'
  openCreate()
}

// —— 安卓桌面小组件数据同步（只在安卓 App 里生效，网页/电脑版自动跳过） ——
interface WidgetCapacitor {
  Capacitor?: {
    isNativePlatform?: () => boolean
    Plugins?: {
      WidgetBridge?: { sync: (opts: { data: string }) => Promise<unknown> }
    }
  }
}

function syncAndroidWidget(): void {
  try {
    const cap = (window as unknown as WidgetCapacitor).Capacitor
    if (!cap?.isNativePlatform?.()) return
    const bridge = cap.Plugins?.WidgetBridge
    if (!bridge) return
    const rows = events.value
      .filter((ev) => ev.onDesktop && !ev.archived)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return Math.abs(computeDisplay(a).rawDays) - Math.abs(computeDisplay(b).rawDays)
      })
      .slice(0, 5)
      .map((ev) => ({ n: ev.name, d: ev.date, e: ev.endDate ?? '' }))
    void bridge.sync({ data: JSON.stringify(rows) })
  } catch {
    // 同步失败不影响主流程
  }
}

async function toggleWidgetWin(): Promise<void> {
  try {
    widgetOn.value = await platformApi.widget.toggle()
  } catch (err) {
    ElMessage.error('小组件操作失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

/** 「🖥 小组件」弹出清单：全部事件按主列表顺序排列，勾选=放上桌面（归档的不算） */
const pickerRows = computed(() => {
  return [...events.value.filter((ev) => !ev.archived)].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return Math.abs(computeDisplay(a).rawDays) - Math.abs(computeDisplay(b).rawDays)
  })
})

/** 勾选/取消某个事件上桌面（即时生效，主窗口和小组件同步更新） */
async function setOnDesktop(ev: EventItem, val: boolean): Promise<void> {
  try {
    await update(ev.id, { ...ev, onDesktop: val })
  } catch (err) {
    ElMessage.error('设置失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

// 搜索 + 排序：置顶最前 → 离今天越近的越靠前（不分过去/未来）；归档的不进主列表
const shown = computed(() => {
  const kw = search.value.trim()
  const list = kw
    ? events.value.filter(
        (ev) => !ev.archived && (ev.name.includes(kw) || ev.note.includes(kw))
      )
    : events.value.filter((ev) => !ev.archived)
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return Math.abs(computeDisplay(a).rawDays) - Math.abs(computeDisplay(b).rawDays)
  })
})

// —— 归档 ——
const showArchive = ref(false)
const archivedList = computed(() =>
  [...events.value.filter((ev) => ev.archived)].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return Math.abs(computeDisplay(a).rawDays) - Math.abs(computeDisplay(b).rawDays)
  })
)

async function onArchive(ev: EventItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `归档后「${ev.name}」不再显示在主界面和小组件里，随时可以在"归档"里找回。`,
      '归档确认',
      { type: 'info', confirmButtonText: '归档', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await update(ev.id, { ...ev, archived: true, onDesktop: false })
    ElMessage.success('已归档')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '归档失败，请重试')
  }
}

async function restoreEvent(ev: EventItem): Promise<void> {
  try {
    await update(ev.id, { ...ev, archived: false })
    ElMessage.success(`「${ev.name}」已恢复到主界面`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '恢复失败，请重试')
  }
}

function openCreate(): void {
  editing.value = null
  dialogShow.value = true
}

function openEdit(ev: EventItem): void {
  editing.value = ev
  dialogShow.value = true
}

async function onRemove(ev: EventItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除后无法恢复，确定删除「${ev.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return // 用户点了取消
  }
  try {
    await remove(ev.id)
    ElMessage.success('已删除')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '删除失败，请重试')
  }
}
</script>

<template>
  <div class="page" :class="{ 'is-mac': isMac }">
    <header class="topbar" @dblclick="onTopbarDblclick">
      <div class="brand">
        <span class="logo">🫘</span>
        <span class="brand-name">银豆豆计时</span>
      </div>
      <el-input
        v-model="search"
        class="search-input"
        placeholder="搜索事件名称或备注"
        clearable
      />
      <div class="actions">
        <el-popover v-if="isElectron" placement="bottom-end" :width="330" trigger="click">
          <template #reference>
            <el-button :type="widgetOn ? 'primary' : 'default'" plain round>
              🖥 小组件
            </el-button>
          </template>
          <div class="widget-pop">
            <div class="wp-head">
              <span class="wp-title">桌面小组件</span>
              <span class="wp-switch">
                <el-switch v-model="widgetOn" size="small" @change="toggleWidgetWin" />
                <span class="wp-state">{{ widgetOn ? '已显示' : '未显示' }}</span>
              </span>
            </div>
            <div class="wp-list">
              <label v-for="ev in pickerRows" :key="ev.id" class="wp-row">
                <el-checkbox
                  :model-value="ev.onDesktop"
                  @change="(v: string | number | boolean) => setOnDesktop(ev, Boolean(v))"
                />
                <span class="wp-icon">{{ ev.icon }}</span>
                <span class="wp-name">{{ ev.name }}</span>
                <span class="wp-count">{{ computeDisplay(ev).text }}</span>
              </label>
              <div v-if="pickerRows.length === 0" class="wp-empty">
                还没有事件，先点右上角「＋ 添加事件」
              </div>
            </div>
            <div class="wp-hint">勾选要放上桌面的事件，改动即时生效</div>
          </div>
        </el-popover>
        <el-popover v-if="isElectron" placement="bottom-end" :width="280" trigger="click">
          <template #reference>
            <el-button round>⚙ 设置</el-button>
          </template>
          <SettingsPanel @replay-guide="showGuide = true" />
        </el-popover>
        <el-button type="primary" round @click="openCreate">＋ 添加事件</el-button>
        <div v-if="isElectron" class="win-ctrls">
          <button class="wc" title="最小化" @click="winMin">–</button>
          <button class="wc" :title="maximized ? '还原' : '最大化'" @click="winMaxToggle">
            {{ maximized ? '❐' : '□' }}
          </button>
          <button class="wc wc-close" title="关闭（隐藏到托盘）" @click="winClose">✕</button>
        </div>
      </div>
    </header>

    <main v-show="activeTab === 'home'" class="list">
      <EventCard
        v-for="ev in shown"
        :key="ev.id"
        :event="ev"
        @edit="openEdit(ev)"
        @archive="onArchive(ev)"
        @remove="onRemove(ev)"
      />

      <div v-if="archivedList.length > 0" class="arch-entry" @click="showArchive = true">
        📦 归档的事件（{{ archivedList.length }}）
      </div>

      <div v-if="shown.length === 0" class="empty">
        <div class="empty-bean">🫘</div>
        <p class="empty-title">{{ search ? '没有找到匹配的事件' : '还没有倒计时事件' }}</p>
        <p class="empty-sub">
          {{ search ? '换个关键词试试' : '点底栏中间的 ＋ 添加事件，开始记录重要日子' }}
        </p>
        <el-button v-if="!search" type="primary" round @click="openCreate">添加第一个事件</el-button>
      </div>
    </main>

    <!-- 手机端：设置页（由底部导航切换） -->
    <section v-if="activeTab === 'settings'" class="settings-page">
      <h2 class="settings-title">⚙ 设置</h2>
      <div class="settings-card">
        <SettingsPanel @replay-guide="showGuide = true" />
      </div>
    </section>

    <!-- 手机端：底部导航（首页 / 添加 / 设置），电脑端自动隐藏 -->
    <nav class="bottom-nav">
      <button
        class="nav-item"
        :class="{ active: activeTab === 'home' }"
        @click="activeTab = 'home'"
      >
        <span class="nav-icon">🏠</span>
        <span class="nav-label">首页</span>
      </button>
      <button class="nav-add" title="添加事件" @click="openAddFromNav">＋</button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'settings' }"
        @click="activeTab = 'settings'"
      >
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">设置</span>
      </button>
    </nav>

    <OnboardingGuide :show="showGuide" @finished="finishGuide" />

    <EventEditDialog v-model:show="dialogShow" :event="editing" />

    <el-drawer v-model="showArchive" title="📦 归档的事件" size="400px">
      <div v-if="archivedList.length === 0" class="arch-empty">还没有归档的事件</div>
      <div v-for="ev in archivedList" :key="ev.id" class="arch-row">
        <span class="arch-icon">{{ ev.icon }}</span>
        <span class="arch-main">
          <span class="arch-name">{{ ev.name }}</span>
          <span class="arch-sub">{{ computeDisplay(ev).text }} · {{ ev.date }}</span>
        </span>
        <el-button link size="small" type="primary" @click="restoreEvent(ev)">恢复</el-button>
        <el-button link size="small" type="danger" @click="onRemove(ev)">删除</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, #eef1f6 0%, #e3e9f1 60%, #dae1eb 100%);
}

.topbar {
  -webkit-app-region: drag; /* 按住顶部即可拖动窗口 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 14px 26px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 10px rgba(96, 112, 138, 0.08);
}

/* 顶部的按钮和输入区不拖动，保证能点 */
.actions,
.win-ctrls {
  -webkit-app-region: no-drag;
}

/* Mac：左侧给系统红绿灯按钮留位置 */
.page.is-mac .topbar {
  padding-left: 90px;
}

/* 自绘的窗口控制按钮（– □ ✕） */
.win-ctrls {
  display: flex;
  gap: 2px;
  margin-left: 4px;
}

.wc {
  width: 38px;
  height: 30px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: #6b7684;
  font-size: 13px;
  cursor: pointer;
  line-height: 1;
  transition:
    background 0.15s,
    color 0.15s;
}

.wc:hover {
  background: #e6ebf2;
  color: #39424e;
}

.wc-close:hover {
  background: #e81123;
  color: #ffffff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  border-radius: 50%;
  background: linear-gradient(145deg, #ffffff, #d7dee8);
  box-shadow: inset 0 -3px 8px rgba(120, 134, 156, 0.25);
}

.brand-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #39424e;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 顶部搜索框（手机端也显示） */
.search-input {
  width: 230px;
}

.search-input :deep(.el-input__wrapper) {
  -webkit-app-region: no-drag;
}

/* 事件卡片：自动多列排布，每张接近方形，图片卡片比例更好看 */
.list {
  flex: 1;
  overflow-y: auto;
  padding: 26px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 14px;
  align-content: start;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  box-sizing: border-box;
}

/* 「🖥 小组件」弹出的选择清单 */
.widget-pop {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wp-title {
  font-size: 14px;
  font-weight: 700;
  color: #39424e;
}

.wp-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wp-state {
  font-size: 12px;
  color: #8a94a2;
}

.wp-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid #edf0f4;
  border-bottom: 1px solid #edf0f4;
  padding: 6px 0;
}

.wp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 10px;
  cursor: pointer;
}

.wp-row:hover {
  background: #f2f5f9;
}

.wp-icon {
  font-size: 16px;
}

.wp-name {
  font-size: 13px;
  color: #39424e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wp-count {
  margin-left: auto;
  font-size: 11px;
  color: #9aa4b1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 45%;
}

.wp-empty {
  padding: 14px 6px;
  text-align: center;
  font-size: 12px;
  color: #9aa4b1;
}

.wp-hint {
  font-size: 11px;
  color: #b0b9c4;
  text-align: center;
}

/* 归档入口与归档抽屉 */
.arch-entry {
  grid-column: 1 / -1;
  justify-self: center;
  padding: 10px 26px;
  border: 1.5px dashed #c3ccd8;
  border-radius: 999px;
  font-size: 13px;
  color: #8a94a2;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.arch-entry:hover {
  border-color: #6aa6d8;
  color: #5d8fbd;
}

html.dark .arch-entry {
  border-color: #4a5462;
  color: #9aa4b1;
}

.arch-empty {
  padding: 30px 10px;
  text-align: center;
  font-size: 13px;
  color: #9aa4b1;
}

.arch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px solid #eef1f5;
}

html.dark .arch-row {
  border-bottom-color: #2c323b;
}

.arch-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.arch-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.arch-name {
  font-size: 14px;
  font-weight: 600;
  color: #39424e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html.dark .arch-name {
  color: #d7dce3;
}

.arch-sub {
  font-size: 12px;
  color: #9aa4b1;
}

.empty {
  grid-column: 1 / -1;
  place-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px;
}

.empty-bean {
  width: 110px;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64px;
  border-radius: 50%;
  background: linear-gradient(145deg, #ffffff, #d7dee8);
  box-shadow:
    inset 0 -5px 12px rgba(120, 134, 156, 0.25),
    0 10px 24px rgba(96, 112, 138, 0.15);
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: #39424e;
}

.empty-sub {
  font-size: 13px;
  color: #8a94a2;
  margin-bottom: 8px;
}

/* —— 手机端底部导航 —— */
.bottom-nav {
  display: none; /* 电脑端不显示，窄屏时显示（见媒体查询） */
}

/* —— 手机端设置页 —— */
.settings-page {
  flex: 1;
  overflow-y: auto;
  padding: 22px 18px 90px;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.settings-title {
  font-size: 20px;
  font-weight: 700;
  color: #39424e;
  margin-bottom: 14px;
}

html.dark .settings-title {
  color: #e5eaf1;
}

.settings-card {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  padding: 18px 18px 12px;
  box-shadow: 0 4px 14px rgba(96, 112, 138, 0.1);
}

html.dark .settings-card {
  background: rgba(38, 43, 51, 0.8);
}

/* —— 窄屏（手机）适配：顶部只留搜索，底部导航出现 —— */
@media (max-width: 640px) {
  .topbar {
    gap: 10px;
    padding: 10px 14px;
    padding-left: 14px;
  }

  .brand-name {
    display: none; /* 手机上省空间，只留豆豆标志 */
  }

  .search-input {
    flex: 1;
    width: auto;
  }

  /* 电脑端按钮组（小组件/设置/添加/窗口控制）在手机上全部隐藏，功能移到底部导航 */
  .actions {
    display: none;
  }

  .page {
    padding-bottom: 64px;
  }

  .bottom-nav {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    height: calc(60px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    align-items: stretch;
    justify-content: space-around;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    box-shadow: 0 -4px 18px rgba(60, 74, 96, 0.12);
  }

  html.dark .bottom-nav {
    background: rgba(30, 34, 41, 0.95);
  }

  .nav-item {
    flex: 1;
    border: none;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: #8a94a2;
    cursor: pointer;
    font-size: 11px;
  }

  .nav-item.active {
    color: #5d8fbd;
  }

  .nav-icon {
    font-size: 21px;
    line-height: 1;
  }

  .nav-label {
    font-size: 11px;
  }

  /* 中间的 ＋ 按钮：凸起的圆 */
  .nav-add {
    width: 56px;
    height: 56px;
    margin-top: -22px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(145deg, #7db3e0, #5d90c4);
    color: #ffffff;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    align-self: flex-start;
    box-shadow:
      0 6px 16px rgba(93, 144, 196, 0.45),
      0 0 0 5px rgba(255, 255, 255, 0.9);
  }

  html.dark .nav-add {
    box-shadow:
      0 6px 16px rgba(0, 0, 0, 0.5),
      0 0 0 5px rgba(30, 34, 41, 0.95);
  }

  .nav-add:active {
    transform: scale(0.94);
  }
}
</style>
