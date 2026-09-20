<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import type { EventDraft, EventItem } from '@shared/types'
import { useEvents } from '../composables/useEvents'
import { useImages } from '../composables/useImages'
import { isElectron, platformApi } from '../platform'
import { fileToResizedDataUrl } from '../utils/image'
import { computeDisplay } from '../utils/calc'
import {
  COLOR_PALETTE,
  COUNT_TYPE_LABELS,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  ICON_CHOICES,
  REMIND_OPTIONS,
  remindOptionLabel
} from '../constants/ui'

const props = defineProps<{ show: boolean; event: EventItem | null }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const { create, update } = useEvents()
const { loadImage } = useImages()
const saving = ref(false)
const formRef = ref<FormInstance>()

// —— 背景图片（支持：按钮选择 / 拖拽文件 / Ctrl+V 粘贴截图 / 从网页拖图片） ——
const fileInput = ref<HTMLInputElement | null>(null)
/** 新选的、还没保存的图片（dataURL） */
const pendingImage = ref<string | null>(null)
/** 预览图（新选的或已有的） */
const imagePreview = ref('')
/** 是否正有图片拖在放置区上方 */
const dragging = ref(false)

function openPicker(): void {
  fileInput.value?.click()
}

/** 手机端拍照（调用系统相机） */
async function takePhoto(): Promise<void> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      width: 1200,
      height: 1200
    })
    if (photo.dataUrl) {
      setPicked(photo.dataUrl)
    }
  } catch {
    // 用户取消或权限被拒
  }
}

function setPicked(dataUrl: string): void {
  pendingImage.value = dataUrl
  imagePreview.value = dataUrl
}

/** 统一入口：接收一个图片文件（选择 / 拖拽 / 粘贴都走这里） */
async function acceptFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    ElMessage.error('这不是图片文件，请换一张')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('图片文件太大了（超过 20MB），请换一张')
    return
  }
  try {
    setPicked(await fileToResizedDataUrl(file))
  } catch {
    ElMessage.error('这张图片读取失败，请换一张试试')
  }
}

async function onPickFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await acceptFile(file)
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    void acceptFile(file)
    return
  }
  // 从网页拖来的是图片链接：请外壳下载（外壳下载不受网页跨域限制）
  const uri = e.dataTransfer
    ?.getData('text/uri-list')
    ?.split('\n')
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith('#'))
  if (uri) {
    void (async () => {
      try {
        setPicked(await platformApi.images.fetchUrl(uri))
      } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '图片获取失败，请换一张')
      }
    })()
  }
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  dragging.value = true
}

function onDragLeave(): void {
  dragging.value = false
}

/** Ctrl+V 粘贴截图 */
async function onPaste(e: ClipboardEvent): Promise<void> {
  if (!props.show) return
  const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
  if (file) {
    e.preventDefault()
    await acceptFile(file)
  }
}

onMounted(() => window.addEventListener('paste', onPaste))
onUnmounted(() => window.removeEventListener('paste', onPaste))

function onRemoveImage(): void {
  pendingImage.value = null
  imagePreview.value = ''
  draft.image = ''
}

function blankDraft(): EventDraft {
  return {
    name: '',
    date: '',
    time: '',
    endDate: '',
    remindMinutes: 0,
    countType: 'natural',
    workdayHoliday: false,
    workdayMode: 'calendar',
    includeStartDay: false,
    color: DEFAULT_COLOR,
    icon: DEFAULT_ICON,
    image: '',
    note: '',
    pinned: false,
    archived: false,
    onDesktop: false
  }
}

const draft = reactive<EventDraft>(blankDraft())

// 时间段：默认只显示一个日期框；点"+ 设为时间段"才出现截止日期框
function enableRange(): void {
  if (!draft.endDate) {
    draft.endDate = draft.date // 先默认和开始日期同一天，用户可再改
  }
  draft.includeStartDay = false // 时间段事件不支持"包含起始日"
}

function disableRange(): void {
  draft.endDate = ''
}

// 每次打开时，用已有事件填充（编辑）或重置为空白（新建）
watch(
  () => props.show,
  (open) => {
    if (!open) return
    Object.assign(draft, blankDraft(), props.event ? { ...props.event } : null)
    // 重置图片状态：预览已有图片，或清空
    pendingImage.value = null
    imagePreview.value = ''
    if (props.event?.image) {
      void loadImage(props.event.image).then((url) => {
        if (url && props.show) imagePreview.value = url
      })
    }
  }
)

const rules = {
  name: [{ required: true, message: '请填写事件名称', trigger: 'blur' }],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }]
}

// 实时预览：填的时候立刻看到保存后的显示效果
const preview = computed(() =>
  computeDisplay({ ...draft, id: 'preview', createdAt: 0 } satisfies EventItem)
)

function cleanDraft(): EventDraft {
  return {
    name: draft.name.trim(),
    date: draft.date,
    time: (draft.time ?? '').trim(),
    endDate: draft.endDate,
    remindMinutes: (draft.time ?? '').trim() ? draft.remindMinutes : 0,
    countType: draft.countType,
    workdayHoliday: draft.workdayHoliday,
    workdayMode: draft.workdayMode,
    includeStartDay: draft.includeStartDay,
    color: draft.color,
    icon: draft.icon,
    image: draft.image,
    note: draft.note.trim(),
    pinned: draft.pinned,
    archived: draft.archived,
    onDesktop: draft.onDesktop
  }
}

async function onSave(): Promise<void> {
  try {
    await formRef.value?.validate()
  } catch {
    return // 校验不过，表单里已经标红了
  }
  if (draft.endDate && draft.endDate < draft.date) {
    ElMessage.warning('截止日期不能早于开始日期')
    return
  }
  saving.value = true
  try {
    // 有新选的图片先存成文件，事件里只记文件名
    let image = draft.image
    if (pendingImage.value) {
      try {
        image = await platformApi.images.save(pendingImage.value)
      } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '图片保存失败，请重试')
        saving.value = false
        return
      }
    }
    const payload = { ...cleanDraft(), image }
    if (props.event) {
      await update(props.event.id, payload)
      ElMessage.success('修改已保存')
    } else {
      await create(payload)
      ElMessage.success('已添加')
    }
    emit('update:show', false)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="show"
    :title="event ? '编辑事件' : '添加事件'"
    width="560px"
    top="7vh"
    :close-on-click-modal="false"
    @update:model-value="(v: boolean) => emit('update:show', v)"
  >
    <el-form ref="formRef" :model="draft" :rules="rules" label-position="top">
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="draft.name"
          maxlength="30"
          show-word-limit
          placeholder="比如：距离春节 / 宝宝出生 / 在一起"
        />
      </el-form-item>

      <el-form-item label="日期（过去＝正计时；未来＝倒计时，自动判断）" prop="date">
        <el-date-picker
          v-model="draft.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item v-if="draft.endDate" label="截止日期" prop="endDate">
        <el-date-picker
          v-model="draft.endDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择截止日期"
          style="width: 100%"
        />
        <el-button class="range-off" link type="danger" size="small" @click="disableRange">
          取消时间段
        </el-button>
      </el-form-item>
      <el-form-item v-else>
        <el-button link size="small" @click="enableRange">
          ＋ 设为时间段（有开始和截止日期，比如比赛期、报名期）
        </el-button>
      </el-form-item>

      <el-form-item label="具体时间（可选，比赛、报名等准时开始的事情填）">
        <div class="time-row">
          <el-time-picker
            v-model="draft.time"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="不填则只按日期计"
            clearable
            style="width: 180px"
          />
          <el-select
            v-if="draft.time"
            v-model="draft.remindMinutes"
            style="width: 200px"
          >
            <el-option
              v-for="opt in REMIND_OPTIONS"
              :key="opt"
              :value="opt"
              :label="remindOptionLabel(opt)"
            />
          </el-select>
        </div>
        <div v-if="draft.time" class="form-tip">提前提醒：到点前用系统通知提醒您</div>
      </el-form-item>

      <el-form-item label="计数方式">
        <el-radio-group v-model="draft.countType">
          <el-radio-button v-for="(label, key) in COUNT_TYPE_LABELS" :key="key" :value="key">
            {{ label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="draft.countType === 'workday'" label="工作日来源">
        <el-radio-group v-model="draft.workdayMode">
          <el-radio-button value="calendar">系统工作日</el-radio-button>
          <el-radio-button value="attendance">实际打卡</el-radio-button>
        </el-radio-group>
        <div class="form-tip">
          实际打卡只统计您在「出勤打卡」里标为上班的日期，周末上班和工作日请假都能准确反映。
        </div>
      </el-form-item>

      <el-form-item v-if="draft.countType === 'workday' && draft.workdayMode === 'calendar'">
        <span class="inline-option">
          <el-switch v-model="draft.workdayHoliday" />
          <span class="form-tip">叠加法定节假日：已内置 2025–2026 年国家安排（每年 11 月公布次年安排后更新）</span>
        </span>
      </el-form-item>

      <el-form-item v-if="!draft.endDate">
        <span class="inline-option">
          <el-switch v-model="draft.includeStartDay" />
          <span class="form-tip">包含起始日：起算的第一天也算进计时（整体多算 1 天）</span>
        </span>
      </el-form-item>

      <el-form-item label="颜色">
        <div class="swatches">
          <span
            v-for="c in COLOR_PALETTE"
            :key="c.key"
            class="swatch"
            :class="{ active: draft.color === c.key }"
            :style="{ background: c.main }"
            :title="c.label"
            @click="draft.color = c.key"
          ></span>
        </div>
      </el-form-item>

      <el-form-item label="图标">
        <div class="icons">
          <span
            v-for="i in ICON_CHOICES"
            :key="i"
            class="icon-btn"
            :class="{ active: draft.icon === i }"
            @click="draft.icon = i"
          >
            {{ i }}
          </span>
        </div>
      </el-form-item>

      <el-form-item label="背景图片（可选，作为卡片背景显示）">
        <div
          class="img-picker"
          :class="{ dragging }"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <div
            v-if="imagePreview"
            class="img-preview"
            :style="{ backgroundImage: `url(${imagePreview})` }"
          >
            <el-button class="img-remove" size="small" type="danger" circle @click="onRemoveImage">
              ✕
            </el-button>
          </div>
          <el-button v-if="imagePreview" link size="small" @click="openPicker">换一张</el-button>
          <el-button v-else size="small" @click="openPicker">＋ 选择图片</el-button>
          <el-button v-if="!isElectron" size="small" @click="takePhoto">📷 拍照</el-button>
          <span class="img-hint">也可以：把图片直接拖到这里 · Ctrl+V 粘贴截图 · 从网页拖图片进来</span>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="onPickFile"
          />
        </div>
      </el-form-item>

      <el-form-item label="备注（可选）">
        <el-input
          v-model="draft.note"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="补充说明，比如：记得买蛋糕"
        />
      </el-form-item>

      <el-form-item>
        <span class="inline-option">
          <el-switch v-model="draft.pinned" />
          <span class="form-tip">置顶：排在列表最上面</span>
        </span>
      </el-form-item>

      <el-form-item>
        <span class="inline-option">
          <el-switch v-model="draft.onDesktop" />
          <span class="form-tip">显示在桌面小组件：把这个事件放到桌面的悬浮面板上</span>
        </span>
      </el-form-item>

      <div class="preview">今天会显示：{{ preview.text }}</div>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:show', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.inline-option {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.form-tip {
  font-size: 13px;
  color: #6b7684;
}

.time-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.range-off {
  margin-top: 4px;
}

.img-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  margin: -8px -10px;
  border-radius: 8px;
  border: 1.5px dashed transparent;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.img-picker.dragging {
  border-color: #6aa6d8;
  background: rgba(106, 166, 216, 0.08);
}

.img-hint {
  width: 100%;
  font-size: 12px;
  color: #9aa4b1;
}

.img-preview {
  position: relative;
  width: 132px;
  height: 74px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  box-shadow: 0 2px 8px rgba(96, 112, 138, 0.2);
}

.img-remove {
  position: absolute;
  top: -8px;
  right: -8px;
}

.swatches {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  box-shadow: inset 0 -3px 6px rgba(0, 0, 0, 0.12);
  transition:
    transform 0.15s,
    border-color 0.15s;
}

.swatch:hover {
  transform: scale(1.15);
}

.swatch.active {
  border-color: #39424e;
  transform: scale(1.15);
}

.icons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border-radius: 6px;
  background: #f2f4f8;
  cursor: pointer;
  border: 2px solid transparent;
  transition:
    transform 0.15s,
    border-color 0.15s;
}

.icon-btn:hover {
  transform: scale(1.12);
}

.icon-btn.active {
  border-color: #6aa6d8;
  background: #e7f1fa;
}

.preview {
  margin-top: 4px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #eff3f6;
  font-size: 14px;
  font-weight: 600;
  color: #3d4653;
}
</style>
