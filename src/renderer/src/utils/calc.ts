import type { EventItem } from '@shared/types'
import { isWorkdayDate } from '@shared/holidays'

/**
 * 天数计算与展示文案生成。
 * 全部用"天序号"（把日期换算成从公元元年起的天数）做加减，避免时区/夏令时干扰。
 */

const MS_DAY = 86_400_000

/** 今天（本地时间）的 YYYY-MM-DD */
export function todayStr(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** YYYY-MM-DD → 天序号 */
function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY)
}

/** 天序号 → Date（统一用 UTC 方法读取） */
function dateOf(dayNo: number): Date {
  return new Date(dayNo * MS_DAY)
}

/** 日历上加 n 个月，月末自动对齐（如 1 月 31 日 + 1 个月 = 2 月 28/29 日） */
function addMonths(base: Date, n: number): Date {
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  const d = base.getUTCDate()
  const first = new Date(Date.UTC(y, m + n, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, lastDay))
  return first
}

/** 把 N 个单位拼成「1 年 2 个月 3 周」，为 0 的单位自动省略 */
function joinParts(parts: Array<[number, string]>): string {
  return parts
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n} ${unit}`)
    .join(' ')
}

/** 按年拆解：从 from 到 to 经过了几年几个月几周几天（from <= to） */
function decompose(from: Date, to: Date): Array<[number, string]> {
  let years = 0
  while (addMonths(from, (years + 1) * 12) <= to) years++
  const afterYears = addMonths(from, years * 12)

  let months = 0
  while (addMonths(afterYears, months + 1) <= to) months++
  const afterMonths = addMonths(afterYears, months)

  const restDays = Math.round((to.getTime() - afterMonths.getTime()) / MS_DAY)
  const weeks = Math.floor(restDays / 7)
  const days = restDays % 7
  return [
    [years, '年'],
    [months, '个月'],
    [weeks, '周'],
    [days, '天']
  ]
}

/**
 * 生成一段时长的展示文案。
 * fromNo/toNo 为天序号，区间为 (fromNo, toNo]，即差值 = toNo - fromNo 天。
 */
/** 天序号 → YYYY-MM-DD */
function strOfDayNo(dayNo: number): string {
  const dt = dateOf(dayNo)
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${m}-${d}`
}

/** 普通规则：周一至周五算工作日 */
function isWeekday(dayNo: number): boolean {
  const w = dateOf(dayNo).getUTCDay()
  return w >= 1 && w <= 5
}

function buildParts(ev: EventItem, fromNo: number, toNo: number): string {
  switch (ev.countType) {
    case 'natural':
      return `${toNo - fromNo} 天`
    case 'week': {
      const total = toNo - fromNo
      return joinParts([
        [Math.floor(total / 7), '周'],
        [total % 7, '天']
      ])
    }
    case 'year':
      return joinParts(decompose(dateOf(fromNo), dateOf(toNo)))
    case 'workday': {
      // 打开"叠加法定节假日"后：放假日扣掉、补班日加回（见 shared/holidays.ts）
      let n = 0
      for (let d = fromNo + 1; d <= toNo; d++) {
        const ok = ev.workdayHoliday ? isWorkdayDate(strOfDayNo(d)) : isWeekday(d)
        if (ok) n++
      }
      return `${n} 个工作日`
    }
  }
}

export interface DisplayResult {
  /** 完整文案，如「还有 1 周 2 天」「已经 3 年 2 个月」 */
  text: string
  /** 是否正好是当天 */
  isToday: boolean
  /** 自然日差（正数=未来日期，负数=过去日期），用于排序 */
  rawDays: number
}

/** HH:mm → 当天第几分钟，如 14:30 → 870 */
function parseHm(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 分钟数 → 「2 小时 15 分钟」这样的文字 */
function fmtMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return joinParts([
    [h, '小时'],
    [m, '分钟']
  ])
}

/** 计算一条事件现在的展示结果（方向由日期自动判断） */
export function computeDisplay(ev: EventItem, now: Date = new Date()): DisplayResult {
  const todayNo = dayNumber(todayStr(now))
  const eventNo = dayNumber(ev.date)
  const rawDays = eventNo - todayNo
  // 包含起始日 = 起算那头多算 1 天，等价于把起算日往前挪一天（时间段事件不适用）
  const includeOffset = ev.includeStartDay && !ev.endDate ? -1 : 0
  const time = (ev.time ?? '').trim()

  // —— 时间段事件（有截止日期）：未开始 → 进行中 → 已结束，自动切换 ——
  if (ev.endDate) {
    const endNo = dayNumber(ev.endDate)
    if (todayNo < eventNo) {
      return {
        text: `距离开始还有 ${buildParts(ev, todayNo, eventNo)}`,
        isToday: false,
        rawDays
      }
    }
    // 开始当天且填了时间：还没到点就继续按小时/分钟显示
    if (todayNo === eventNo && time) {
      const diff = parseHm(time) - (now.getHours() * 60 + now.getMinutes())
      if (diff > 0) {
        return { text: `距离开始还有 ${fmtMinutes(diff)}`, isToday: false, rawDays }
      }
    }
    if (todayNo < endNo) {
      return {
        text: `距离截止还有 ${buildParts(ev, todayNo, endNo)}`,
        isToday: false,
        rawDays: endNo - todayNo
      }
    }
    if (todayNo === endNo) {
      return { text: '今天截止！', isToday: true, rawDays: 0 }
    }
    return {
      text: `已结束 ${buildParts(ev, endNo, todayNo)}`,
      isToday: false,
      rawDays: endNo - todayNo
    }
  }

  // —— 单日事件 ——
  if (rawDays === 0) {
    // 就在今天：填了时间的按小时/分钟精确显示
    if (time) {
      const diff = parseHm(time) - (now.getHours() * 60 + now.getMinutes())
      if (diff === 0) return { text: '就是现在！', isToday: true, rawDays: 0 }
      if (diff > 0) return { text: `还有 ${fmtMinutes(diff)}`, isToday: false, rawDays: 0 }
      return { text: `已经 ${fmtMinutes(-diff)}`, isToday: false, rawDays: 0 }
    }
    return { text: '就是今天！', isToday: true, rawDays: 0 }
  }
  if (rawDays > 0) {
    // 未来日期：倒计时（从今天数到目标日）
    const from = todayNo + includeOffset
    return { text: `还有 ${buildParts(ev, from, eventNo)}`, isToday: false, rawDays }
  }
  // 过去日期：正计时（从开始日数到今天）
  const from = eventNo + includeOffset
  return { text: `已经 ${buildParts(ev, from, todayNo)}`, isToday: false, rawDays }
}
