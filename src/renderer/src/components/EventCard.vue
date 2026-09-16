<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { EventItem } from '@shared/types'
import { computeDisplay } from '../utils/calc'
import { colorOf, COUNT_TYPE_LABELS, remindLabel } from '../constants/ui'
import { useImages } from '../composables/useImages'

const props = defineProps<{ event: EventItem }>()
defineEmits<{ edit: []; archive: []; remove: [] }>()

const color = computed(() => colorOf(props.event.color))

// 每 30 秒刷新一次"现在"（跨天、跨小时后文案自动更新）
const now = ref(new Date())
let nowTimer: number | undefined
onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
})
onUnmounted(() => {
  if (nowTimer) window.clearInterval(nowTimer)
})

const display = computed(() => computeDisplay(props.event, now.value))

// 倒计时文案太长时自动缩小字号
const countClass = computed(() => (display.value.text.length > 14 ? 'count small' : 'count'))

// 背景图片（有图片的卡片以图片为背景，盖暗色渐变保证文字可读）
const { loadImage } = useImages()
const imgUrl = ref('')
watch(
  () => props.event.image,
  (name) => {
    void (async () => {
      imgUrl.value = name ? await loadImage(name) : ''
    })()
  },
  { immediate: true }
)
</script>

<template>
  <div
    class="card"
    :class="{ today: display.isToday, hasImg: !!imgUrl }"
    :style="{
      '--c-main': color.main,
      '--c-soft': color.soft,
      ...(imgUrl ? { backgroundImage: `url(${imgUrl})` } : {}),
      ...(!imgUrl && !display.isToday ? { color: color.main } : {})
    }"
  >
    <div class="top">
      <div class="icon">{{ event.icon }}</div>
      <div class="title-wrap">
        <div class="name-row">
          <span class="name">{{ event.name }}</span>
          <span v-if="event.pinned" class="pin" title="已置顶">📌</span>
        </div>
        <span class="date-chip">
          📅 {{ event.date }}{{ event.time ? ` ${event.time}` : '' }}{{ event.endDate ? ` ~ ${event.endDate}` : '' }}
        </span>
      </div>
      <div class="ops">
        <el-button link size="small" @click="$emit('edit')">编辑</el-button>
        <el-button link size="small" @click="$emit('archive')">归档</el-button>
        <el-button link size="small" type="danger" @click="$emit('remove')">删除</el-button>
      </div>
    </div>

    <div :class="countClass">{{ display.text }}</div>

    <div class="meta">
      <el-tag size="small" effect="plain" round>{{ COUNT_TYPE_LABELS[event.countType] }}</el-tag>
      <el-tag v-if="event.endDate" size="small" effect="plain" round>时间段</el-tag>
      <el-tag v-if="event.onDesktop" size="small" effect="plain" round>🖥 桌面</el-tag>
      <el-tag v-if="event.includeStartDay" size="small" effect="plain" round>含起始日</el-tag>
      <el-tag
        v-if="event.time && event.remindMinutes"
        size="small"
        type="warning"
        effect="plain"
        round
      >
        🔔 提前 {{ remindLabel(event.remindMinutes) }}
      </el-tag>
    </div>
    <div v-if="event.note" class="note" :title="event.note">📝 {{ event.note }}</div>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 168px;
  padding: 16px 18px;
  background: var(--c-soft);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  box-shadow: 0 3px 10px rgba(96, 112, 138, 0.08);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(96, 112, 138, 0.16);
}

.card.today {
  outline: 2px dashed var(--c-main);
  outline-offset: 2px;
}

/* 有背景图时：图片铺满卡片，上浅下深的暗色渐变保证文字可读 */
.card.hasImg {
  background-size: cover;
  background-position: center;
}

.card.hasImg::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    rgba(28, 33, 42, 0.55) 0%,
    rgba(28, 33, 42, 0.22) 42%,
    rgba(28, 33, 42, 0.62) 100%
  );
}

.card > * {
  position: relative;
  z-index: 1;
}

.top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.icon {
  width: 40px;
  height: 40px;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: inset 0 -2px 6px rgba(120, 134, 156, 0.15);
  flex-shrink: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name {
  font-size: 15px;
  font-weight: 700;
  color: #39424e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin {
  font-size: 12px;
}

.date-chip {
  font-size: 11px;
  color: #8a94a2;
  font-variant-numeric: tabular-nums;
}

.ops {
  display: flex;
  flex-shrink: 0;
}

/* 倒计时大字：卡片的主角 */
.count {
  margin-top: auto;
  font-size: 26px;
  font-weight: 800;
  color: #3d4653;
  line-height: 1.25;
}

.count.small {
  font-size: 19px;
}

.card.today .count {
  color: #e07a6b;
}

.hasImg .name {
  color: #ffffff;
}

.hasImg .count {
  color: #ffffff;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
}

.hasImg .date-chip {
  color: rgba(255, 255, 255, 0.85);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.note {
  font-size: 12px;
  color: #8a94a2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hasImg .note {
  color: rgba(255, 255, 255, 0.85);
}

.hasImg :deep(.el-tag) {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.4);
  color: #ffffff;
}

.hasImg :deep(.el-button) {
  color: rgba(255, 255, 255, 0.85);
}

.hasImg :deep(.el-button--danger) {
  color: #ffb3a8;
}
</style>
