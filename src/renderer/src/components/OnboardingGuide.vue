<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isElectron } from '../platform'

/**
 * 新手指引：第一次打开 App 时展示引导，看完不再打扰（可在设置里重看）。
 * 手机和电脑各显示各的操作方式，不混着讲。
 */

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ finished: [] }>()

const step = ref(0)

const STEPS = computed(() =>
  isElectron
    ? [
        {
          icon: '🏠',
          title: '首页看事件',
          desc: '所有重要的日子都在这里，倒计时一眼可见。完成的事情可以「归档」收起来。'
        },
        {
          icon: '➕',
          title: '添加事件',
          desc: '点右上角「＋ 添加事件」。只需填日期——过去的自动正计时，未来的自动倒计时。'
        },
        {
          icon: '🖥',
          title: '桌面小组件',
          desc: '点顶部「🖥 小组件」按钮，勾选想放上桌面的事件，悬浮面板随时可见。'
        },
        {
          icon: '⚙️',
          title: '个性化设置',
          desc: '右上角「⚙ 设置」里：深色模式、字体大小、开机自启、备份导出导入。'
        }
      ]
    : [
        {
          icon: '🏠',
          title: '首页看事件',
          desc: '所有重要的日子都在这里，倒计时一眼可见。完成的事情可以「归档」收起来。'
        },
        {
          icon: '➕',
          title: '添加事件',
          desc: '点底部中间的 ＋ 号。只需填日期——过去的自动正计时，未来的自动倒计时。'
        },
        {
          icon: '🧩',
          title: '桌面小组件',
          desc: '长按手机桌面空白处 → 选「小组件」→ 找到「银豆豆小组件」添加，倒计时放桌面。'
        },
        {
          icon: '⚙️',
          title: '个性化设置',
          desc: '底部「设置」里：深色模式、字体大小、备份导出导入，按习惯调。'
        }
      ]
)

const current = computed(() => STEPS.value[step.value])
const isLast = computed(() => step.value === STEPS.value.length - 1)

watch(
  () => props.show,
  (v) => {
    if (v) step.value = 0
  }
)

function next(): void {
  if (isLast.value) {
    emit('finished')
  } else {
    step.value += 1
  }
}
</script>

<template>
  <transition name="fade">
    <div v-if="show" class="guide-mask">
      <div class="guide-card">
        <div class="guide-icon">{{ current.icon }}</div>
        <h2 class="guide-title">{{ current.title }}</h2>
        <p class="guide-desc">{{ current.desc }}</p>

        <div class="guide-dots">
          <span
            v-for="(s, i) in STEPS"
            :key="i"
            class="dot"
            :class="{ active: i === step }"
          ></span>
        </div>

        <div class="guide-btns">
          <el-button text @click="emit('finished')">跳过</el-button>
          <el-button type="primary" round @click="next">
            {{ isLast ? '开始使用' : '下一步' }}
          </el-button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.guide-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(24, 29, 37, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.guide-card {
  width: 100%;
  max-width: 360px;
  background: #ffffff;
  border-radius: 26px;
  padding: 30px 26px 22px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

html.dark .guide-card {
  background: #262b33;
}

.guide-icon {
  width: 84px;
  height: 84px;
  margin: 0 auto 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  border-radius: 50%;
  background: linear-gradient(145deg, #f0f4f9, #dfe6ee);
}

html.dark .guide-icon {
  background: linear-gradient(145deg, #323943, #22262d);
}

.guide-title {
  font-size: 19px;
  font-weight: 700;
  color: #39424e;
  margin-bottom: 10px;
}

html.dark .guide-title {
  color: #e5eaf1;
}

.guide-desc {
  font-size: 14px;
  line-height: 1.8;
  color: #6b7684;
  min-height: 76px;
  white-space: pre-line;
}

html.dark .guide-desc {
  color: #aab3bf;
}

.guide-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 14px 0 18px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #cfd7e0;
  transition: all 0.2s;
}

html.dark .dot {
  background: #46505d;
}

.dot.active {
  width: 22px;
  background: #6aa6d8;
}

.guide-btns {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
