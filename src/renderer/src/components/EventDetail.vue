<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { EventItem } from '@shared/types'
import { computeDisplay } from '../utils/calc'
import { colorOf, COUNT_TYPE_LABELS, remindLabel } from '../constants/ui'
import { useImages } from '../composables/useImages'
import { useEvents } from '../composables/useEvents'
import { useAttendance } from '../composables/useAttendance'

/**
 * 事件详情面板：点击卡片后弹出，分三层——
 * 1. 展示区（大号倒计时 + 事件信息）
 * 2. 快捷开关（圆圈对勾：置顶 / 桌面 / 归档）
 * 3. 操作按钮（编辑 / 删除）
 */

const props = defineProps<{ show: boolean; event: EventItem | null }>()
const emit = defineEmits<{ 'update:show': [value: boolean]; edit: [ev: EventItem] }>()

const { update, remove } = useEvents()

const now = ref(new Date())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => { now.value = new Date() }, 30_000)
})
onUnmounted(() => { if (timer) window.clearInterval(timer) })

const { attendanceRecords } = useAttendance()
const display = computed(() =>
  props.event ? computeDisplay(props.event, now.value, attendanceRecords.value) : null
)
const color = computed(() => (props.event ? colorOf(props.event.color) : colorOf('sky')))

const { loadImage } = useImages()
const imgUrl = ref('')
watch(
  () => props.event?.image,
  (name) => { void (async () => { imgUrl.value = name ? await loadImage(name) : '' })() },
  { immediate: true }
)

async function toggle(key: 'pinned' | 'onDesktop' | 'archived'): Promise<void> {
  if (!props.event) return
  const patch: Partial<EventItem> = { [key]: !props.event[key] }
  // 归档时同时从桌面移除
  if (key === 'archived' && patch.archived) patch.onDesktop = false
  try {
    await update(props.event.id, { ...props.event, ...patch })
  } catch { /* 静默 */ }
}

async function onDelete(): Promise<void> {
  if (!props.event) return
  try {
    await ElMessageBox.confirm(`删除后无法恢复，确定删除「${props.event.name}」吗？`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
  } catch { return }
  try {
    await remove(props.event.id)
    emit('update:show', false)
  } catch { /* 静默 */ }
}

function onEdit(): void {
  if (!props.event) return
  emit('update:show', false)
  emit('edit', props.event)
}
</script>

<template>
  <transition name="sheet">
    <div v-if="show && event" class="detail-mask" @click.self="emit('update:show', false)">
      <div class="detail-sheet">
        <div class="sheet-bar"></div>

        <!-- 第一层·展示区 -->
        <div class="hero" :style="{ '--c-main': color.main, '--c-soft': color.soft }">
          <div class="hero-icon">{{ event.icon }}</div>
          <div class="hero-body">
            <h3 class="hero-name">{{ event.name }}</h3>
            <span class="hero-date">
              📅 {{ event.date }}{{ event.time ? ` ${event.time}` : '' }}{{ event.endDate ? ` ~ ${event.endDate}` : '' }}
            </span>
          </div>
          <div v-if="imgUrl" class="hero-bg" :style="{ backgroundImage: `url(${imgUrl})` }"></div>
        </div>

        <div class="big-count" :class="{ hot: display?.isToday }" :style="{ color: color.main }">
          {{ display?.text }}
        </div>

        <div class="tags">
          <el-tag size="small" effect="plain" round>{{ COUNT_TYPE_LABELS[event.countType] }}</el-tag>
          <el-tag v-if="event.countType === 'workday' && event.workdayMode === 'attendance'" size="small" effect="plain" round>实际出勤</el-tag>
          <el-tag v-if="event.endDate" size="small" effect="plain" round>时间段</el-tag>
          <el-tag v-if="event.includeStartDay" size="small" effect="plain" round>含起始日</el-tag>
          <el-tag v-if="event.time && event.remindMinutes" size="small" type="warning" effect="plain" round>
            🔔 提前 {{ remindLabel(event.remindMinutes) }}
          </el-tag>
        </div>
        <p v-if="event.note" class="note">📝 {{ event.note }}</p>

        <!-- 第二层·快捷开关（圆圈对勾） -->
        <div class="toggles">
          <button class="toggle-item" @click="toggle('pinned')">
            <span class="circle-check" :class="{ checked: event.pinned }">✓</span>
            <span class="toggle-label">置顶</span>
          </button>
          <button class="toggle-item" @click="toggle('onDesktop')">
            <span class="circle-check" :class="{ checked: event.onDesktop }">✓</span>
            <span class="toggle-label">桌面</span>
          </button>
          <button class="toggle-item" @click="toggle('archived')">
            <span class="circle-check" :class="{ checked: event.archived }">✓</span>
            <span class="toggle-label">归档</span>
          </button>
        </div>

        <!-- 第三层·操作按钮 -->
        <div class="actions">
          <el-button round @click="onEdit">编辑</el-button>
          <el-button round type="danger" @click="onDelete">删除</el-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(24, 29, 37, 0.45);
  display: flex;
  align-items: flex-end;
}

.detail-sheet {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  padding: 8px 24px calc(20px + env(safe-area-inset-bottom));
  max-height: 80vh;
  overflow-y: auto;
}

html.dark .detail-sheet {
  background: #262b33;
}

.sheet-bar {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: #d5dce5;
  margin: 6px auto 14px;
}

html.dark .sheet-bar {
  background: #46505d;
}

/* 展示区 */
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--c-soft, #f0f4f8);
  position: relative;
  overflow: hidden;
}

html.dark .hero {
  opacity: 0.9;
}

.hero-icon {
  font-size: 32px;
  flex-shrink: 0;
  z-index: 1;
}

.hero-body {
  flex: 1;
  min-width: 0;
  z-index: 1;
}

.hero-name {
  font-size: 17px;
  font-weight: 700;
  color: #39424e;
  margin: 0 0 4px;
}

html.dark .hero-name {
  color: #e5eaf1;
}

.hero-date {
  font-size: 12px;
  color: #8a94a2;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

.hero-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0.85), rgba(255,255,255,0.3));
}

html.dark .hero-bg::after {
  background: linear-gradient(90deg, rgba(38,43,51,0.85), rgba(38,43,51,0.3));
}

/* 大号倒计时 */
.big-count {
  font-size: 36px;
  font-weight: 800;
  text-align: center;
  padding: 18px 0 10px;
  line-height: 1.2;
}

.big-count.hot {
  color: #e07a6b !important;
}

/* 标签 */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 8px;
}

.note {
  font-size: 13px;
  color: #8a94a2;
  text-align: center;
  margin: 4px 0 8px;
}

/* 快捷开关 */
.toggles {
  display: flex;
  justify-content: space-around;
  padding: 14px 0;
  border-top: 1px solid #eef1f5;
  border-bottom: 1px solid #eef1f5;
  margin: 8px 0 14px;
}

html.dark .toggles {
  border-color: #2c323b;
}

.toggle-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 12px;
}

.toggle-label {
  font-size: 12px;
  color: #8a94a2;
}

.circle-check {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #c3ccd8;
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
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

/* 操作按钮 */
.actions {
  display: flex;
  gap: 12px;
}

.actions .el-button {
  flex: 1;
}

/* 弹出动画 */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s;
}

.sheet-enter-active .detail-sheet,
.sheet-leave-active .detail-sheet {
  transition: transform 0.25s;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .detail-sheet,
.sheet-leave-to .detail-sheet {
  transform: translateY(40px);
}
</style>
