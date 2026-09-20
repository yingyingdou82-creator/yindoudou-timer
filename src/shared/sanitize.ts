import type {
  AttendanceRecord,
  AttendanceRecordDraft,
  AttendanceStatus,
  CountType,
  EventDraft
} from './types'

/**
 * 事件数据校验与清洗（电脑版外壳和手机版网页引擎共用同一套规则）。
 * 不合法时抛出带中文提示的错误。
 */

const TYPES: CountType[] = ['natural', 'workday', 'week', 'year']
const ATTENDANCE_STATUSES: AttendanceStatus[] = ['worked', 'leave', 'rest']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const IMAGE_NAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/

export function sanitizeDraft(input: unknown): EventDraft {
  const d = (input ?? {}) as Partial<EventDraft>
  const name = String(d.name ?? '').trim()
  if (!name) throw new Error('请填写事件名称')
  if (name.length > 30) throw new Error('名称太长了，最多 30 个字')

  const date = String(d.date ?? '')
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    throw new Error('日期不正确，请重新选择')
  }
  if (!d.countType || !TYPES.includes(d.countType)) throw new Error('计数方式不正确')

  const time = String(d.time ?? '')
  if (time && !TIME_RE.test(time)) throw new Error('时间格式不正确，请重新选择')

  const endDate = String(d.endDate ?? '')
  if (endDate) {
    if (!DATE_RE.test(endDate) || Number.isNaN(new Date(`${endDate}T00:00:00`).getTime())) {
      throw new Error('截止日期不正确，请重新选择')
    }
    if (endDate < date) throw new Error('截止日期不能早于开始日期')
  }

  const remindMinutes = Number(d.remindMinutes ?? 0)
  if (!Number.isInteger(remindMinutes) || remindMinutes < 0 || remindMinutes > 1440 * 7) {
    throw new Error('提前提醒的时间不正确')
  }
  if (remindMinutes > 0 && !time) {
    throw new Error('设置提前提醒前，请先填写具体时间')
  }

  const image = String(d.image ?? '')
  if (image && !IMAGE_NAME_RE.test(image)) {
    throw new Error('图片信息不正确')
  }

  return {
    name,
    date,
    time,
    endDate,
    remindMinutes,
    countType: d.countType,
    workdayHoliday: Boolean(d.workdayHoliday),
    workdayMode: d.workdayMode === 'attendance' ? 'attendance' : 'calendar',
    includeStartDay: Boolean(d.includeStartDay),
    color: String(d.color ?? 'sky'),
    icon: String(d.icon ?? '🎉'),
    image,
    note: String(d.note ?? '').trim().slice(0, 200),
    pinned: Boolean(d.pinned),
    archived: Boolean(d.archived),
    onDesktop: Boolean(d.onDesktop)
  }
}

/** 清洗一条手动出勤记录；日期唯一性由存储层保证。 */
export function sanitizeAttendanceDraft(input: unknown): AttendanceRecordDraft {
  const d = (input ?? {}) as Partial<AttendanceRecordDraft>
  const date = String(d.date ?? '')
  if (!DATE_RE.test(date) || Number.isNaN(new Date(date + 'T00:00:00').getTime())) {
    throw new Error('打卡日期不正确，请重新选择')
  }
  const status = d.status as AttendanceStatus
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw new Error('打卡状态不正确')
  }
  return {
    date,
    status,
    note: String(d.note ?? '').trim().slice(0, 80)
  }
}

/** 兼容旧备份：坏记录跳过，同一天只保留最后更新的一条。 */
export function sanitizeAttendanceRecords(input: unknown): AttendanceRecord[] {
  const raw = Array.isArray(input) ? input : []
  const byDate = new Map<string, AttendanceRecord>()
  for (const item of raw) {
    try {
      const draft = sanitizeAttendanceDraft(item)
      const saved = (item ?? {}) as Partial<AttendanceRecord>
      const updatedAt =
        typeof saved.updatedAt === 'number' && Number.isFinite(saved.updatedAt)
          ? saved.updatedAt
          : 0
      const current = byDate.get(draft.date)
      if (!current || updatedAt >= current.updatedAt) {
        byDate.set(draft.date, { ...draft, updatedAt })
      }
    } catch {
      // 单条错误不影响其余的出勤记录
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
