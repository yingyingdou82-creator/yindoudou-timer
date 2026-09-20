<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, House, Plus, Search, Setting } from '@element-plus/icons-vue'
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { EventItem } from '@shared/types'
import { useEvents } from './composables/useEvents'
import { useAttendance } from './composables/useAttendance'
import { useImages } from './composables/useImages'
import { isElectron, platformApi } from './platform'
import { scheduleMobileReminders } from './platform/mobileReminders'
import { computeDisplay } from './utils/calc'
import EventCard from './components/EventCard.vue'
import EventEditDialog from './components/EventEditDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import OnboardingGuide from './components/OnboardingGuide.vue'
import AttendancePanel from './components/AttendancePanel.vue'
import appIconUrl from './assets/app-icon.png'

const { events, load, remove, update } = useEvents()
const { attendanceRecords, loadAttendance } = useAttendance()
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

// 手机端底部导航：首页 / 出勤打卡 / 设置；添加事件放在顶部品牌行右侧
const activeTab = ref<'home' | 'attendance' | 'settings'>('home')

// 新手指引（第一次打开时展示）
const showGuide = ref(false)

function finishGuide(): void {
  showGuide.value = false
  void platformApi.settings.setGuideShown(true)
}

// 「桌面小组件 · 选择事件」底部弹层（安卓端：点桌面小组件进来自动弹出）
const showWidgetPicker = ref(false)

onMounted(() => {
  void Promise.all([load(), loadAttendance()])
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
    void Promise.all([load(), loadAttendance()]).then(() => {
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

  // 安卓：点桌面小组件启动（冷启动或从后台回来）都检查一次
  checkWidgetLaunch()
  document.addEventListener('visibilitychange', onVisibilityForWidget)
})

function checkWidgetLaunch(): void {
  if (!hasNativeAndroidWidgetBridge()) return
  void nativeWidgetBridge
    .getLaunchReason()
    .then((r) => {
      if (r.reason === 'widget') showWidgetPicker.value = true
    })
    .catch(() => {
      // 小组件桥接暂不可用时不影响主流程
    })
}

function onVisibilityForWidget(): void {
  if (!document.hidden) {
    checkWidgetLaunch()
  }
}

onUnmounted(() => {
  unsubChanged?.()
  unsubTheme?.()
  unsubFont?.()
  document.removeEventListener('visibilitychange', onVisibilityForWidget)
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
interface WidgetBridgePlugin {
  sync(opts: { data: string; attendance: string }): Promise<{ ok: boolean }>
  getLaunchReason(): Promise<{ reason: string }>
  requestPin(): Promise<{ ok: boolean }>
  getStatus(): Promise<{ count: number; canPin: boolean }>
}

// 按 Capacitor 官方方式注册代理，避免依赖 window.Capacitor.Plugins 的实现细节。
const nativeWidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

function hasNativeAndroidWidgetBridge(): boolean {
  return !isElectron && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** 请求把小组件"钉"到桌面（系统弹"添加到主屏幕"确认框，安卓专用） */
async function requestPinWidget(): Promise<void> {
  if (!hasNativeAndroidWidgetBridge()) return
  try {
    const status = await nativeWidgetBridge.getStatus()
    if (status && status.count > 0) {
      syncAndroidWidget()
      ElMessage.success('已同步到桌面上的 ' + status.count + ' 个小组件')
      return
    }
    await nativeWidgetBridge.requestPin()
    ElMessage.info('请在系统弹窗中确认添加；添加后已选事件会自动显示')
  } catch (err) {
    ElMessage.info(
      err instanceof Error
        ? err.message
        : '这款桌面不支持一键添加，请长按桌面空白处 → 小组件 → 手动添加'
    )
  }
}

function syncAndroidWidget(): void {
  if (!hasNativeAndroidWidgetBridge()) return
  const rows = events.value
    .filter((ev) => ev.onDesktop && !ev.archived)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return Math.abs(computeDisplay(a).rawDays) - Math.abs(computeDisplay(b).rawDays)
    })
    .slice(0, 9)
    .map((ev) => ({
      id: ev.id,
      n: ev.name,
      d: ev.date,
      e: ev.endDate ?? '',
      t: ev.time ?? '',
      ct: ev.countType,
      wh: ev.workdayHoliday,
      wm: ev.workdayMode,
      inc: ev.includeStartDay,
      i: ev.icon
    }))
  const attendance = attendanceRecords.value.map((record) => ({
    d: record.date,
    s: record.status
  }))
  void nativeWidgetBridge
    .sync({ data: JSON.stringify(rows), attendance: JSON.stringify(attendance) })
    .catch(() => {
      // 主页面照常使用；设置页仍可通过手动添加引导用户处理桌面兼容性。
    })
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
    syncAndroidWidget()
  } catch (err) {
    ElMessage.error('设置失败：' + (err instanceof Error ? err.message : String(err)))
    return
  }
  // 安卓：第一次勾上桌面事件时，请求把小组件钉到桌面（系统弹确认框）
  if (!isElectron && val) {
    void requestPinWidget()
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
  <div class="page" :class="{ 'is-mac': isMac, 'is-mobile': !isElectron }">
    <header class="topbar" @dblclick="onTopbarDblclick">
      <div class="brand">
        <span class="brand-main">
          <img class="logo" :src="appIconUrl" alt="银豆豆计时" />
          <span class="brand-name">银豆豆计时</span>
        </span>
        <button class="mobile-create" title="添加事件" @click="openAddFromNav">
          <el-icon><Plus /></el-icon>
        </button>
      </div>
      <el-input
        v-show="activeTab === 'home'"
        v-model="search"
        class="search-input"
        placeholder="搜索事件名称或备注"
        clearable
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="actions">
        <el-button
          v-if="isElectron"
          :type="activeTab === 'home' ? 'primary' : 'default'"
          plain
          @click="activeTab = 'home'"
        >
          <el-icon><House /></el-icon>
          <span>事件</span>
        </el-button>
        <el-button
          v-if="isElectron"
          :type="activeTab === 'attendance' ? 'primary' : 'default'"
          plain
          @click="activeTab = 'attendance'"
        >
          <el-icon><Calendar /></el-icon>
          <span>出勤打卡</span>
        </el-button>
        <el-popover v-if="isElectron" placement="bottom-end" :width="330" trigger="click">
          <template #reference>
            <el-button :type="widgetOn ? 'primary' : 'default'" plain>
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
            <el-button>⚙ 设置</el-button>
          </template>
          <SettingsPanel @replay-guide="showGuide = true" />
        </el-popover>
        <el-button type="primary" @click="openAddFromNav">
          <el-icon><Plus /></el-icon>
          <span>添加事件</span>
        </el-button>
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
      <div class="list-heading">
        <div>
          <p>YOUR IMPORTANT DAYS</p>
          <h1>重要日子</h1>
        </div>
        <span>{{ shown.length }} 个事件</span>
      </div>
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
        <div class="empty-bean">
          <img :src="appIconUrl" alt="" />
        </div>
        <p class="empty-title">{{ search ? '没有找到匹配的事件' : '还没有倒计时事件' }}</p>
        <p class="empty-sub">
          {{ search ? '换个关键词试试' : '点右上角添加事件，开始记录重要日子' }}
        </p>
        <el-button v-if="!search" type="primary" @click="openCreate">添加第一个事件</el-button>
      </div>
    </main>

    <AttendancePanel v-if="activeTab === 'attendance'" />

    <!-- 手机端：设置页（由底部导航切换） -->
    <section v-if="activeTab === 'settings'" class="settings-page">
      <h2 class="settings-title">⚙ 设置</h2>
      <div class="settings-card">
        <SettingsPanel
          @replay-guide="showGuide = true"
          @open-widget-picker="showWidgetPicker = true"
        />
      </div>
    </section>

    <!-- 桌面小组件 · 选择事件（圆圈打勾，点桌面小组件进入时自动弹出） -->
    <transition name="sheet">
      <div v-if="showWidgetPicker" class="wp-sheet-mask" @click.self="showWidgetPicker = false">
        <div class="wp-sheet">
          <div class="wp-sheet-bar"></div>
          <h3 class="wp-sheet-title">桌面小组件</h3>
          <p class="wp-sheet-sub">勾选要显示在桌面的事件，改动即时生效</p>
          <el-button
            v-if="!isElectron"
            class="wp-pin-btn"
            text
            size="small"
            @click="requestPinWidget"
          >
            ＋ 桌面上还没有小组件？点这里一键添加
          </el-button>
          <div class="wp-sheet-list">
            <label
              v-for="ev in pickerRows"
              :key="ev.id"
              class="wp-sheet-row"
              @click="setOnDesktop(ev, !ev.onDesktop)"
            >
              <span class="circle-check" :class="{ checked: ev.onDesktop }">✓</span>
              <span class="wp-icon">{{ ev.icon }}</span>
              <span class="wp-name">{{ ev.name }}</span>
              <span class="wp-count">{{ computeDisplay(ev).text }}</span>
            </label>
            <div v-if="pickerRows.length === 0" class="wp-sheet-empty">
              还没有事件，先添加一个吧
            </div>
          </div>
          <el-button type="primary" class="wp-sheet-done" @click="showWidgetPicker = false">
            完成
          </el-button>
        </div>
      </div>
    </transition>

    <!-- 手机端：底部导航（首页 / 打卡 / 设置），电脑端自动隐藏 -->
    <nav class="bottom-nav">
      <button
        class="nav-item"
        :class="{ active: activeTab === 'home' }"
        @click="activeTab = 'home'"
      >
        <el-icon class="nav-icon"><House /></el-icon>
        <span class="nav-label">首页</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'attendance' }"
        @click="activeTab = 'attendance'"
      >
        <el-icon class="nav-icon"><Calendar /></el-icon>
        <span class="nav-label">打卡</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'settings' }"
        @click="activeTab = 'settings'"
      >
        <el-icon class="nav-icon"><Setting /></el-icon>
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
  background: #f6f7f9;
}

.topbar {
  -webkit-app-region: drag; /* 按住顶部即可拖动窗口 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 66px;
  padding: 13px 18px 13px 26px;
  background: rgba(248, 249, 251, 0.9);
  border-bottom: 1px solid rgba(94, 105, 120, 0.12);
  backdrop-filter: blur(18px);
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
  border-radius: 6px;
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
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.brand-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  object-fit: cover;
  background: #ffffff;
  box-shadow:
    inset 0 -3px 8px rgba(120, 134, 156, 0.18),
    0 2px 8px rgba(96, 112, 138, 0.12);
  flex-shrink: 0;
}

.brand-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0;
  color: #39424e;
  white-space: nowrap;
}

.mobile-create {
  -webkit-app-region: no-drag;
  display: none;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(76, 88, 104, 0.14);
  border-radius: 50%;
  background: #ffffff;
  color: #2f3a46;
  box-shadow: 0 7px 18px rgba(47, 58, 70, 0.1);
  cursor: pointer;
}

.mobile-create:active {
  transform: scale(0.96);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.actions :deep(.el-button) {
  gap: 6px;
  border-radius: 6px;
}

/* 顶部搜索框（手机端也显示） */
.search-input {
  width: 280px;
}

.search-input :deep(.el-input__wrapper) {
  -webkit-app-region: no-drag;
  min-height: 36px;
  border: 1px solid rgba(97, 110, 128, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 1px 2px rgba(41, 51, 63, 0.03);
}

/* 事件卡片：自动多列排布，每张接近方形，图片卡片比例更好看 */
.list {
  flex: 1;
  overflow-y: auto;
  padding: 30px 32px 36px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 14px;
  align-content: start;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  box-sizing: border-box;
}

.list-heading {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 2px 6px;
}

.list-heading p {
  margin: 0 0 5px;
  color: #7c8794;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.list-heading h1 {
  margin: 0;
  color: #222b36;
  font-size: 25px;
  line-height: 1.2;
}

.list-heading > span {
  color: #89939f;
  font-size: 12px;
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
  border-radius: 6px;
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
  padding: 9px 14px;
  border: 1.5px dashed #c3ccd8;
  border-radius: 6px;
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
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #dfe5eb;
  box-shadow:
    inset 0 -5px 12px rgba(120, 134, 156, 0.25),
    0 10px 24px rgba(96, 112, 138, 0.15);
  overflow: hidden;
}

.empty-bean img {
  width: 92px;
  height: 92px;
  display: block;
  border-radius: 7px;
  object-fit: cover;
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
/* 基础样式常驻；显示与否由 .is-mobile（手机/安卓环境）或窄屏决定 */
.bottom-nav {
  display: none;
  position: fixed;
  left: 50%;
  right: auto;
  bottom: 0;
  z-index: 100;
  width: min(100%, 560px);
  height: calc(66px + env(safe-area-inset-bottom));
  padding: 6px 14px calc(6px + env(safe-area-inset-bottom));
  align-items: center;
  justify-content: center;
  gap: 6px;
  transform: translateX(-50%);
  background: rgba(248, 249, 251, 0.92);
  backdrop-filter: blur(18px);
  border-top: 1px solid rgba(94, 105, 120, 0.12);
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -12px 30px rgba(37, 47, 59, 0.08);
}

html.dark .bottom-nav {
  background: rgba(30, 34, 41, 0.94);
}

html.dark .mobile-create {
  background: #2b323c;
  border-color: #3d4854;
  color: #e5eaf1;
  box-shadow: 0 7px 18px rgba(0, 0, 0, 0.24);
}

.nav-item {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: 8px;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #8a94a2;
  cursor: pointer;
  transition:
    background 0.16s,
    color 0.16s,
    box-shadow 0.16s;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.86);
  color: #24303c;
  box-shadow:
    0 1px 2px rgba(35, 46, 58, 0.05),
    0 7px 18px rgba(35, 46, 58, 0.08);
}

html.dark .nav-item.active {
  background: rgba(48, 56, 67, 0.9);
  color: #edf1f6;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.18),
    0 7px 18px rgba(0, 0, 0, 0.24);
}

.nav-icon {
  font-size: 20px;
  line-height: 1;
}

.nav-label {
  font-size: 11px;
}

/* —— 手机/安卓环境（不管屏幕多宽都用手机版式：底部导航常驻） —— */
.page.is-mobile .actions {
  display: none;
}

.page.is-mobile .topbar {
  flex-direction: column;
  flex-wrap: nowrap;
  gap: 12px;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px;
  align-items: stretch;
  justify-content: center;
}

.page.is-mobile .brand {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  justify-content: space-between;
}

.page.is-mobile .brand-name {
  display: inline;
  font-size: 17px;
}

.page.is-mobile .mobile-create {
  display: inline-flex;
}

.page.is-mobile .search-input {
  order: 3;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  flex: 0 0 auto;
}

.page.is-mobile .list {
  grid-template-columns: minmax(0, 1fr);
  padding: 16px;
  gap: 12px;
  max-width: 560px;
  padding-bottom: 96px;
}

.page.is-mobile .bottom-nav {
  display: flex;
}

.page.is-mobile .settings-page {
  padding-bottom: 96px;
}

/* —— 桌面小组件选择弹层（圆圈打勾） —— */
.wp-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(24, 29, 37, 0.45);
  display: flex;
  align-items: flex-end;
}

.wp-sheet {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 14px 14px 0 0;
  padding: 10px 20px calc(20px + env(safe-area-inset-bottom));
}

html.dark .wp-sheet {
  background: #262b33;
}

.wp-sheet-bar {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: #d5dce5;
  margin: 6px auto 10px;
}

html.dark .wp-sheet-bar {
  background: #46505d;
}

.wp-sheet-title {
  font-size: 17px;
  font-weight: 700;
  color: #39424e;
}

html.dark .wp-sheet-title {
  color: #e5eaf1;
}

.wp-sheet-sub {
  font-size: 12px;
  color: #8a94a2;
  margin: 4px 0 4px;
}

.wp-pin-btn {
  margin: 0 0 8px;
  padding: 0;
  font-size: 12px;
}

.wp-sheet-list {
  max-height: 52vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
}

.wp-sheet-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 8px;
  border-radius: 7px;
  cursor: pointer;
}

.wp-sheet-row:active {
  background: #f2f5f9;
}

html.dark .wp-sheet-row:active {
  background: #323943;
}

/* 圆圈对勾 */
.circle-check {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #c3ccd8;
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  transition: all 0.15s;
}

.circle-check.checked {
  border-color: #5d90c4;
  background: #5d90c4;
  color: #ffffff;
}

html.dark .circle-check {
  border-color: #4a5462;
}

.wp-sheet-row .wp-name {
  font-size: 14px;
  font-weight: 600;
  color: #39424e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html.dark .wp-sheet-row .wp-name {
  color: #d7dce3;
}

.wp-sheet-row .wp-count {
  margin-left: auto;
  font-size: 11px;
  color: #9aa4b1;
  white-space: nowrap;
}

.wp-sheet-empty {
  padding: 26px 0;
  text-align: center;
  font-size: 13px;
  color: #9aa4b1;
}

.wp-sheet-done {
  width: 100%;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s;
}

.sheet-enter-active .wp-sheet,
.sheet-leave-active .wp-sheet {
  transition: transform 0.25s;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .wp-sheet,
.sheet-leave-to .wp-sheet {
  transform: translateY(40px);
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
  border: 1px solid #e1e5ea;
  border-radius: 8px;
  padding: 18px 18px 12px;
  box-shadow: 0 2px 8px rgba(72, 86, 103, 0.05);
}

html.dark .settings-card {
  background: rgba(38, 43, 51, 0.8);
}

/* —— 窄屏适配：顶部品牌 + 添加，搜索独占一行，底部导航出现 —— */
@media (max-width: 640px) {
  .topbar {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 12px;
    padding: 12px 16px;
    align-items: stretch;
  }

  .brand {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    justify-content: space-between;
  }

  .brand-name {
    display: inline;
    font-size: 17px;
  }

  .mobile-create {
    display: inline-flex;
  }

  .search-input {
    order: 3;
    flex: 0 0 auto;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
  }

  /* 电脑端按钮组在窄窗口也收进底部导航（桌面窄窗口场景） */
  .actions {
    display: none;
  }

  .bottom-nav {
    display: flex;
  }

  .page {
    padding-bottom: 72px;
  }

  .list {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
    gap: 12px;
    padding-bottom: 96px;
  }
}
</style>
