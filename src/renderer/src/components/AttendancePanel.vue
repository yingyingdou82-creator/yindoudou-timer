<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { AttendanceStatus } from '@shared/types'
import { useAttendance } from '../composables/useAttendance'
import { todayStr } from '../utils/calc'

const { attendanceRecords, saveAttendance, removeAttendance } = useAttendance()

const today = todayStr()
const now = new Date()
const visibleMonth = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const selectedDate = ref(today)
const note = ref('')

const STATUS_META: Record<AttendanceStatus, { label: string; short: string }> = {
  worked: { label: '上班', short: '上班' },
  leave: { label: '请假', short: '请假' },
  rest: { label: '休息', short: '休息' }
}

function dateText(year: number, monthIndex: number, day: number): string {
  return [year, String(monthIndex + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}

function addDays(date: string, amount: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  target.setDate(target.getDate() + amount)
  return dateText(target.getFullYear(), target.getMonth(), target.getDate())
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}

const recordByDate = computed(() => new Map(attendanceRecords.value.map((item) => [item.date, item])))
const selectedRecord = computed(() => recordByDate.value.get(selectedDate.value))

watch(
  selectedRecord,
  (record) => {
    note.value = record?.note ?? ''
  },
  { immediate: true }
)

const monthKey = computed(() =>
  dateText(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth(), 1).slice(0, 7)
)
const monthLabel = computed(() =>
  visibleMonth.value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
)

const calendarCells = computed(() => {
  const year = visibleMonth.value.getFullYear()
  const month = visibleMonth.value.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const leadingBlankCount = (firstDay + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<string | null> = Array.from({ length: leadingBlankCount }, () => null)
  for (let day = 1; day <= days; day++) {
    cells.push(dateText(year, month, day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
})

const monthStats = computed(() => {
  const rows = attendanceRecords.value.filter((item) => item.date.startsWith(monthKey.value))
  return {
    worked: rows.filter((item) => item.status === 'worked').length,
    leave: rows.filter((item) => item.status === 'leave').length,
    rest: rows.filter((item) => item.status === 'rest').length
  }
})

const totalWorked = computed(
  () => attendanceRecords.value.filter((item) => item.status === 'worked').length
)

const currentStreak = computed(() => {
  let cursor = today
  let count = 0
  while (recordByDate.value.get(cursor)?.status === 'worked') {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
})

function moveMonth(delta: number): void {
  visibleMonth.value = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() + delta,
    1
  )
}

function selectDay(date: string): void {
  selectedDate.value = date
}

async function setStatus(status: AttendanceStatus): Promise<void> {
  try {
    await saveAttendance({ date: selectedDate.value, status, note: note.value })
    ElMessage.success(formatDate(selectedDate.value) + '已记为' + STATUS_META[status].label)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存打卡失败，请重试')
  }
}

async function saveNote(): Promise<void> {
  const status = selectedRecord.value?.status
  if (!status) {
    ElMessage.info('请先选择上班、请假或休息')
    return
  }
  await setStatus(status)
}

async function clearRecord(): Promise<void> {
  if (!selectedRecord.value) return
  try {
    await removeAttendance(selectedDate.value)
    note.value = ''
    ElMessage.success('已清除这一天的打卡记录')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '清除失败，请重试')
  }
}

async function markTodayWorked(): Promise<void> {
  selectedDate.value = today
  if (!today.startsWith(monthKey.value)) {
    const [year, month] = today.split('-').map(Number)
    visibleMonth.value = new Date(year, month - 1, 1)
  }
  await setStatus('worked')
}
</script>

<template>
  <section class="attendance-page">
    <div class="attendance-hero">
      <div>
        <p class="kicker">ACTUAL ATTENDANCE</p>
        <h2>出勤打卡</h2>
        <p>只统计你亲自标记为上班的日期，周末加班、工作日请假都能如实记录。</p>
      </div>
      <el-button type="primary" class="today-checkin" @click="markTodayWorked">今日上班</el-button>
    </div>

    <div class="attendance-metrics" aria-label="出勤汇总">
      <div class="metric">
        <span class="metric-label">本月上班</span>
        <strong>{{ monthStats.worked }}</strong>
        <span>天</span>
      </div>
      <div class="metric">
        <span class="metric-label">本月请假</span>
        <strong>{{ monthStats.leave }}</strong>
        <span>天</span>
      </div>
      <div class="metric">
        <span class="metric-label">累计上班</span>
        <strong>{{ totalWorked }}</strong>
        <span>天</span>
      </div>
      <div class="metric">
        <span class="metric-label">连续打卡</span>
        <strong>{{ currentStreak }}</strong>
        <span>天</span>
      </div>
    </div>

    <section class="calendar-surface">
      <header class="month-bar">
        <div>
          <p class="surface-label">出勤日历</p>
          <h3>{{ monthLabel }}</h3>
        </div>
        <div class="month-actions">
          <el-button circle plain title="上一个月" @click="moveMonth(-1)">‹</el-button>
          <el-button circle plain title="下一个月" @click="moveMonth(1)">›</el-button>
        </div>
      </header>
      <div class="weekday-row">
        <span v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday">
          {{ weekday }}
        </span>
      </div>
      <div class="calendar-grid">
        <div v-for="(date, index) in calendarCells" :key="date ?? 'blank-' + index" class="day-slot">
          <button
            v-if="date"
            class="calendar-day"
            :class="{
              selected: selectedDate === date,
              today: date === today,
              worked: recordByDate.get(date)?.status === 'worked',
              leave: recordByDate.get(date)?.status === 'leave',
              rest: recordByDate.get(date)?.status === 'rest'
            }"
            @click="selectDay(date)"
          >
            <span>{{ Number(date.slice(-2)) }}</span>
            <small v-if="recordByDate.get(date)">
              {{ STATUS_META[recordByDate.get(date)!.status].short }}
            </small>
          </button>
        </div>
      </div>
    </section>

    <section class="record-surface">
      <div class="record-heading">
        <div>
          <p class="surface-label">当天记录</p>
          <h3>{{ formatDate(selectedDate) }}</h3>
        </div>
        <span v-if="selectedRecord" class="status-caption" :class="selectedRecord.status">
          {{ STATUS_META[selectedRecord.status].label }}
        </span>
      </div>

      <el-radio-group
        class="status-picker"
        :model-value="selectedRecord?.status"
        @change="(value: string | number | boolean) => setStatus(value as AttendanceStatus)"
      >
        <el-radio-button value="worked">上班</el-radio-button>
        <el-radio-button value="leave">请假</el-radio-button>
        <el-radio-button value="rest">休息</el-radio-button>
      </el-radio-group>

      <div class="note-row">
        <el-input
          v-model="note"
          maxlength="80"
          placeholder="可记一下请假原因、加班说明或当天安排"
          @keyup.enter="saveNote"
        />
        <el-button :disabled="!selectedRecord" @click="saveNote">保存说明</el-button>
        <el-button
          :disabled="!selectedRecord"
          type="danger"
          plain
          title="清除当天记录"
          @click="clearRecord"
        >
          清除
        </el-button>
      </div>
      <p class="record-hint">“实际打卡”工作日只会计算标记为「上班」的日期。</p>
    </section>
  </section>
</template>

<style scoped>
.attendance-page {
  flex: 1;
  overflow-y: auto;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 28px 30px 44px;
  box-sizing: border-box;
}

.attendance-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 0 2px 24px;
  border-bottom: 1px solid rgba(111, 123, 139, 0.18);
}

.kicker,
.surface-label {
  margin: 0 0 6px;
  color: #7b8491;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.attendance-hero h2,
.month-bar h3,
.record-heading h3 {
  margin: 0;
  color: #242b36;
  font-size: 24px;
  line-height: 1.2;
}

.attendance-hero p:not(.kicker) {
  max-width: 590px;
  margin: 8px 0 0;
  color: #77818e;
  font-size: 13px;
  line-height: 1.7;
}

.today-checkin {
  min-width: 104px;
}

.attendance-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 20px 0;
  overflow: hidden;
  border: 1px solid #e1e5ea;
  border-radius: 8px;
  background: #e1e5ea;
}

.metric {
  min-height: 94px;
  padding: 17px 16px 12px;
  background: rgba(255, 255, 255, 0.78);
}

.metric-label {
  display: block;
  color: #7a8490;
  font-size: 12px;
}

.metric strong {
  display: inline-block;
  margin: 8px 4px 0 0;
  color: #303947;
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.metric span:last-child {
  color: #8a94a0;
  font-size: 12px;
}

.calendar-surface,
.record-surface {
  border: 1px solid #e1e5ea;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
}

.calendar-surface {
  padding: 20px;
}

.month-bar,
.record-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.month-bar h3,
.record-heading h3 {
  font-size: 17px;
}

.month-actions {
  display: flex;
  gap: 8px;
}

.weekday-row,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekday-row {
  margin-top: 18px;
  border-bottom: 1px solid #edf0f3;
}

.weekday-row span {
  padding: 0 0 9px;
  color: #9aa3ae;
  font-size: 11px;
  text-align: center;
}

.calendar-grid {
  gap: 4px;
  margin-top: 8px;
}

.day-slot {
  min-height: 58px;
}

.calendar-day {
  width: 100%;
  height: 100%;
  min-height: 58px;
  padding: 6px 3px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #434c59;
  cursor: pointer;
  transition: background 0.16s, border-color 0.16s, color 0.16s;
}

.calendar-day:hover {
  background: #f0f4f8;
}

.calendar-day > span {
  display: block;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.calendar-day small {
  display: block;
  margin-top: 4px;
  color: #7f8995;
  font-size: 10px;
}

.calendar-day.today > span {
  color: #4d7da8;
  font-weight: 800;
}

.calendar-day.selected {
  border-color: #7d9fbc;
  background: #edf4fa;
}

.calendar-day.worked small {
  color: #3b8569;
}

.calendar-day.leave small {
  color: #c26773;
}

.calendar-day.rest small {
  color: #8d98a4;
}

.record-surface {
  margin-top: 14px;
  padding: 20px;
}

.status-caption {
  padding: 4px 8px;
  border-radius: 5px;
  background: #edf1f5;
  color: #6f7986;
  font-size: 12px;
}

.status-caption.worked {
  background: #e8f4ed;
  color: #3b8569;
}

.status-caption.leave {
  background: #faecee;
  color: #c26773;
}

.status-picker {
  display: flex;
  margin: 18px 0 12px;
}

.status-picker :deep(.el-radio-button) {
  flex: 1;
}

.status-picker :deep(.el-radio-button__inner) {
  width: 100%;
}

.note-row {
  display: flex;
  gap: 8px;
}

.record-hint {
  margin: 10px 0 0;
  color: #929ba6;
  font-size: 11px;
  line-height: 1.6;
}

html.dark .attendance-hero {
  border-color: rgba(167, 177, 190, 0.18);
}

html.dark .attendance-hero h2,
html.dark .month-bar h3,
html.dark .record-heading h3,
html.dark .metric strong {
  color: #edf1f6;
}

html.dark .attendance-hero p:not(.kicker),
html.dark .metric-label {
  color: #a6b0bd;
}

html.dark .attendance-metrics,
html.dark .calendar-surface,
html.dark .record-surface {
  border-color: #3e4652;
}

html.dark .attendance-metrics {
  background: #3e4652;
}

html.dark .metric,
html.dark .calendar-surface,
html.dark .record-surface {
  background: rgba(39, 45, 54, 0.88);
}

html.dark .weekday-row {
  border-color: #3b444f;
}

html.dark .calendar-day {
  color: #d7dde6;
}

html.dark .calendar-day:hover,
html.dark .calendar-day.selected {
  background: #343e4b;
}

@media (max-width: 640px) {
  .attendance-page {
    padding: 20px 14px 94px;
  }

  .attendance-hero {
    align-items: flex-start;
    padding-bottom: 18px;
  }

  .attendance-hero h2 {
    font-size: 22px;
  }

  .today-checkin {
    min-width: 82px;
  }

  .attendance-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric {
    min-height: 82px;
    padding: 14px 13px 10px;
  }

  .calendar-surface,
  .record-surface {
    padding: 14px;
  }

  .day-slot,
  .calendar-day {
    min-height: 48px;
  }

  .note-row {
    flex-wrap: wrap;
  }

  .note-row :deep(.el-input) {
    width: 100%;
  }
}
</style>
