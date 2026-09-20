<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { isElectron, platformApi } from '../platform'
import appIconUrl from '../assets/app-icon.png'

/**
 * 设置面板：电脑版放在「⚙ 设置」弹窗里，手机版是底部导航的「设置」页。
 */

const emit = defineEmits<{ replayGuide: []; openWidgetPicker: [] }>()

const dark = ref(false)
const fontScale = ref(1)
const autoLaunch = ref(false)
const showVersionDetails = ref(false)
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

    <div class="row">
      <span>版本与功能</span>
      <el-button size="small" @click="showVersionDetails = true">查看详情</el-button>
    </div>

    <div v-if="isElectron" class="tip">退出软件请用右下角托盘图标的「退出」</div>

    <el-dialog
      v-model="showVersionDetails"
      title="版本与功能"
      width="520px"
      append-to-body
      class="feature-dialog"
    >
      <div class="feature-brand">
        <img :src="appIconUrl" alt="银豆豆计时" />
        <div>
          <strong>银豆豆计时</strong>
          <span>v1.1.0 · 全部数据仅保存在本机</span>
        </div>
      </div>

      <div class="feature-list">
        <section>
          <strong>重要日期</strong>
          <p>倒数日、正数日、时间段、具体时间、提醒，以及自然日、工作日、按周和按年四种算法。</p>
        </section>
        <section>
          <strong>出勤打卡</strong>
          <p>按真实上班日期记录。周末加班可标上班，工作日请假可留下说明；事件的工作日也能切换为实际打卡统计。</p>
        </section>
        <section>
          <strong>桌面小组件</strong>
          <p>Windows 悬浮面板和安卓系统小组件都可选择具体事件显示，修改后会自动同步。</p>
        </section>
        <section>
          <strong>备份与隐私</strong>
          <p>事件、图片和出勤记录可导出为一个备份文件；应用不上传你的数据。</p>
        </section>
      </div>
    </el-dialog>
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

.feature-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e9edf1;
}

.feature-brand img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}

.feature-brand strong,
.feature-brand span {
  display: block;
}

.feature-brand strong {
  color: #2f3845;
  font-size: 16px;
}

.feature-brand span {
  margin-top: 4px;
  color: #8a94a1;
  font-size: 12px;
}

.feature-list {
  display: flex;
  flex-direction: column;
}

.feature-list section {
  padding: 14px 0;
  border-bottom: 1px solid #edf0f3;
}

.feature-list section:last-child {
  border-bottom: none;
}

.feature-list strong {
  color: #3a4552;
  font-size: 14px;
}

.feature-list p {
  margin: 6px 0 0;
  color: #7d8793;
  font-size: 13px;
  line-height: 1.7;
}

html.dark .feature-brand {
  border-color: #414a56;
}

html.dark .feature-brand strong,
html.dark .feature-list strong {
  color: #e7ebf0;
}

html.dark .feature-list section {
  border-color: #414a56;
}
</style>
