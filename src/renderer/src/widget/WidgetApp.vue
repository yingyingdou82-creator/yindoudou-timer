<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { EventItem } from '@shared/types'
import { computeDisplay } from '../utils/calc'
import { colorOf } from '../constants/ui'
import { useImages } from '../composables/useImages'
import { platformApi } from '../platform'

/**
 * 桌面小组件（悬浮面板）：
 * - 顶部标题栏可拖动（拖动位置会被记住）
 * - 每条事件一行，按事件颜色显示
 * - 高度随条数自动伸缩，超出屏幕 80% 后内部滚动
 */

const SIZE_LABELS = ['窄', '中', '宽']
const OPACITIES = [1, 0.85, 0.7]

const events = ref<EventItem[]>([])
const now = ref(new Date())
const sizeLevel = ref(1)
const opacityIndex = ref(0)
// 字体大小倍数（跟随主窗口设置，影响行高计算）
const fontScale = ref(1)

const { clearAll: clearImageCache } = useImages()

let nowTimer: number | undefined
let unsubChanged: (() => void) | undefined
let unsubTheme: (() => void) | undefined
let unsubFont: (() => void) | undefined

async function load(): Promise<void> {
  const all = await platformApi.events.list()
  events.value = all.filter((ev) => ev.onDesktop && !ev.archived)
}

/** 排序：置顶最前，离今天越近越靠前（和主窗口一致） */
const rows = computed(() => {
  return [...events.value].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return (
      Math.abs(computeDisplay(a, now.value).rawDays) -
      Math.abs(computeDisplay(b, now.value).rawDays)
    )
  })
})

function applyFont(scale: number): void {
  fontScale.value = scale
  document.documentElement.style.zoom = String(scale)
}

/** 按事件条数计算面板高度并上报（外壳会限制在屏幕 80% 内，超出部分面板内滚动） */
async function reportHeight(): Promise<void> {
  const HEAD = 46 // 标题栏
  const PAD = 12
  const ROW = 58 // 每条事件约 58 像素
  const EMPTY = 96 // 空状态提示
  const base = rows.value.length === 0 ? EMPTY : HEAD + PAD + rows.value.length * ROW
  await platformApi.widget.setHeight(Math.round(base * fontScale.value))
}

onMounted(async () => {
  const state = await platformApi.widget.getState()
  sizeLevel.value = state.sizeLevel
  const idx = OPACITIES.indexOf(state.opacity)
  opacityIndex.value = idx >= 0 ? idx : 0

  await load()
  void reportHeight()

  unsubChanged = platformApi.onChanged(() => {
    clearImageCache()
    void load()
  })

  // 跟随主题（深浅色）和字体大小，并监听变化
  void platformApi.settings.get().then((s) => {
    document.documentElement.classList.toggle('dark', s.theme === 'dark')
    applyFont(s.fontScale)
  })
  unsubTheme = platformApi.onThemeChanged((theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  })
  unsubFont = platformApi.onFontChanged((scale) => {
    applyFont(scale)
    void reportHeight()
  })

  // 每 30 秒刷新一次"现在"，倒计时文案随之更新（含小时/分钟精确显示）
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
})

onUnmounted(() => {
  unsubChanged?.()
  unsubTheme?.()
  unsubFont?.()
  if (nowTimer) window.clearInterval(nowTimer)
})

watch(rows, () => {
  void reportHeight()
})

async function cycleSize(): Promise<void> {
  sizeLevel.value = (sizeLevel.value + 1) % 3
  await platformApi.widget.apply({ sizeLevel: sizeLevel.value })
  void reportHeight() // 宽度变了，文字换行可能变化，重新量高
}

async function cycleOpacity(): Promise<void> {
  opacityIndex.value = (opacityIndex.value + 1) % OPACITIES.length
  await platformApi.widget.apply({ opacity: OPACITIES[opacityIndex.value] })
}

function hide(): void {
  void platformApi.widget.hide()
}

function openMain(): void {
  void platformApi.window.focusMain()
}

async function removeRow(ev: EventItem): Promise<void> {
  await platformApi.events.update(ev.id, { ...ev, onDesktop: false })
}
</script>

<template>
  <div id="widget-body" class="widget">
    <div class="head">
      <span class="brand">🫘 银豆豆</span>
      <span class="tools">
        <button class="tool" :title="`宽度：${SIZE_LABELS[sizeLevel]}`" @click="cycleSize">
          {{ SIZE_LABELS[sizeLevel] }}
        </button>
        <button class="tool" title="透明度" @click="cycleOpacity">◐</button>
        <button class="tool" title="隐藏小组件" @click="hide">✕</button>
      </span>
    </div>

    <div class="rows">
      <div
        v-for="ev in rows"
        :key="ev.id"
        class="row"
        :style="{ background: colorOf(ev.color).soft }"
        @click="openMain"
      >
        <span class="ricon">{{ ev.icon }}</span>
        <span class="rmain">
          <span class="rname">{{ ev.name }}</span>
          <span class="rcount" :class="{ hot: computeDisplay(ev, now).isToday }">
            {{ computeDisplay(ev, now).text }}
          </span>
        </span>
        <button class="rx" title="从桌面移除" @click.stop="removeRow(ev)">✕</button>
      </div>

      <div v-if="rows.length === 0" class="empty">
        还没有事件上桌面<br />
        在主窗口点「🖥 小组件」，勾选要显示的事件
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget {
  width: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.93);
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(60, 74, 96, 0.25);
  overflow: hidden;
}

/* 标题栏：拖动区（按住这里拖动整个小组件） */
.head {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 8px;
}

.brand {
  font-size: 13px;
  font-weight: 700;
  color: #4a5462;
  letter-spacing: 0.5px;
}

.tools {
  -webkit-app-region: no-drag;
  display: flex;
  gap: 4px;
}

.tool {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7684;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.tool:hover {
  background: #e6ebf2;
  color: #3a4149;
}

/* 事件行：窗口被限制高度时（事件很多），在面板内部滚动 */
.rows {
  flex: 1;
  overflow-y: auto;
  max-height: calc(100vh - 50px);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 2px 4px;
}

.row {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.15s;
}

.row:hover {
  transform: translateX(2px);
}

.ricon {
  font-size: 18px;
  flex-shrink: 0;
}

.rmain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rname {
  font-size: 12px;
  font-weight: 600;
  color: #4a5462;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rcount {
  font-size: 13px;
  font-weight: 800;
  color: #3d4653;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rcount.hot {
  color: #e07a6b;
}

.rx {
  -webkit-app-region: no-drag;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9aa4b1;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.row:hover .rx {
  opacity: 1;
}

.rx:hover {
  background: rgba(224, 122, 107, 0.15);
  color: #e07a6b;
}

.empty {
  padding: 18px 10px;
  text-align: center;
  font-size: 12px;
  line-height: 1.7;
  color: #9aa4b1;
}

/* 滚动条细细的，不抢空间 */
.rows::-webkit-scrollbar {
  width: 4px;
}

.rows::-webkit-scrollbar-thumb {
  background: #c6cfda;
  border-radius: 2px;
}
</style>
