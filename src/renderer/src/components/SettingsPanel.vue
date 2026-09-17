<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { isElectron, platformApi } from '../platform'

/**
 * 设置面板：电脑版放在「⚙ 设置」弹窗里，手机版是底部导航的「设置」页。
 */

const emit = defineEmits<{ replayGuide: []; openWidgetPicker: [] }>()

const dark = ref(false)
const fontScale = ref(1)
const autoLaunch = ref(false)
let unsubTheme: (() => void) | undefined
let unsubFont: (() => void) | undefined

// 字体大小四档
const FONT_STEPS = [
  { label: '小', value: 0.9 },
  { label: '标准', value: 1 },
  { label: '大', value: 1.15 },
  { label: '特大', value: 1.3 }
]

onMounted(async () => {
  const s = await platformApi.settings.get()
  dark.value = s.theme === 'dark'
  fontScale.value = s.fontScale
  autoLaunch.value = s.autoLaunch
  unsubTheme = platformApi.onThemeChanged((t) => {
    dark.value = t === 'dark'
  })
  unsubFont = platformApi.onFontChanged((v) => {
    fontScale.value = v
  })
})

onUnmounted(() => {
  unsubTheme?.()
  unsubFont?.()
})

async function toggleTheme(val: boolean): Promise<void> {
  await platformApi.settings.setTheme(val ? 'dark' : 'light') // 广播回来后自动应用
}

async function pickFont(value: number): Promise<void> {
  await platformApi.settings.setFontScale(value)
}

async function toggleAutoLaunch(val: boolean): Promise<void> {
  await platformApi.settings.setAutoLaunch(val)
  autoLaunch.value = val
  ElMessage.success(val ? '已开启开机自启（装成正式软件后生效）' : '已关闭开机自启')
}

async function doExport(): Promise<void> {
  const r = await platformApi.backup.export()
  if (r.ok && r.path) {
    ElMessage.success(`备份已保存到：${r.path}`)
  } else if (r.error) {
    ElMessage.error('导出失败：' + r.error)
  }
}

async function doImport(): Promise<void> {
  const r = await platformApi.backup.import()
  if (r.ok) {
    ElMessage.success(`导入成功，共 ${r.imported} 条事件`)
  } else if (r.error) {
    ElMessage.error('导入失败：' + r.error)
  }
}
</script>

<template>
  <div class="settings-panel">
    <div class="row">
      <span>深色模式</span>
      <el-switch :model-value="dark" @change="(v: string | number | boolean) => toggleTheme(Boolean(v))" />
    </div>

    <div class="row col">
      <span>字体大小</span>
      <el-radio-group
        :model-value="fontScale"
        size="small"
        @change="(v: string | number | boolean) => pickFont(Number(v))"
      >
        <el-radio-button v-for="step in FONT_STEPS" :key="step.value" :value="step.value" :label="step.label" />
      </el-radio-group>
    </div>

    <div v-if="isElectron" class="row">
      <span>开机自启</span>
      <el-switch
        :model-value="autoLaunch"
        @change="(v: string | number | boolean) => toggleAutoLaunch(Boolean(v))"
      />
    </div>

    <div class="row">
      <span>备份</span>
      <span>
        <el-button size="small" @click="doExport">导出</el-button>
        <el-button size="small" @click="doImport">导入</el-button>
      </span>
    </div>
    <div class="tip">
      导出：全部事件和图片存成一个文件<br />
      导入：可选「合并」或「替换」
    </div>

    <div v-if="!isElectron" class="row">
      <span>桌面小组件</span>
      <el-button size="small" @click="emit('openWidgetPicker')">选择事件</el-button>
    </div>

    <div class="row">
      <span>新手指引</span>
      <el-button size="small" @click="emit('replayGuide')">重新查看</el-button>
    </div>

    <div v-if="isElectron" class="tip">退出软件请用右下角托盘图标的「退出」</div>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: #39424e;
}

.row.col {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

html.dark .row {
  color: #d7dce3;
}

.settings-panel :deep(.el-radio-button__inner) {
  padding: 5px 10px;
}

.tip {
  font-size: 11px;
  color: #b0b9c4;
  text-align: center;
  line-height: 1.7;
}
</style>
