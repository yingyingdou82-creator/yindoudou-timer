/**
 * 中国法定节假日安排（"工作日"计数方式的可选叠加项）
 *
 * 数据来源：国务院办公厅每年发布的通知
 * - 2025 年：《国务院办公厅关于2025年部分节假日安排的通知》（2024-11 发布）
 * - 2026 年：《国务院办公厅关于2026年部分节假日安排的通知》（2025-11 发布）
 *
 * 维护说明：国家每年 11 月左右公布次年安排，公布后在下方的 RAW 里补一段新年度数据即可；
 * 没有数据的年份自动按"周一至周五"计算，不会出错。
 */

interface YearRanges {
  /** 放假日期段 [起, 止]（YYYY-MM-DD，含调休形成的休息日） */
  off: string[][]
  /** 周末补班日期段 [起, 止] */
  work: string[][]
}

const RAW: Record<string, YearRanges> = {
  '2025': {
    off: [
      ['2025-01-01', '2025-01-01'], // 元旦
      ['2025-01-28', '2025-02-04'], // 春节（除夕至正月初七）
      ['2025-04-04', '2025-04-06'], // 清明节
      ['2025-05-01', '2025-05-05'], // 劳动节
      ['2025-05-31', '2025-06-02'], // 端午节
      ['2025-10-01', '2025-10-08'] // 国庆节、中秋节
    ],
    work: [
      ['2025-01-26', '2025-01-26'], // 春节补班（周日）
      ['2025-02-08', '2025-02-08'], // 春节补班（周六）
      ['2025-04-27', '2025-04-27'], // 劳动节补班（周日）
      ['2025-09-28', '2025-09-28'], // 国庆补班（周日）
      ['2025-10-11', '2025-10-11'] // 国庆补班（周六）
    ]
  },
  '2026': {
    off: [
      ['2026-01-01', '2026-01-03'], // 元旦
      ['2026-02-15', '2026-02-23'], // 春节（腊月二十八至正月初七）
      ['2026-04-04', '2026-04-06'], // 清明节
      ['2026-05-01', '2026-05-05'], // 劳动节
      ['2026-06-19', '2026-06-21'], // 端午节
      ['2026-09-25', '2026-09-27'], // 中秋节
      ['2026-10-01', '2026-10-07'] // 国庆节
    ],
    work: [
      ['2026-01-04', '2026-01-04'], // 元旦补班（周日）
      ['2026-02-14', '2026-02-14'], // 春节补班（周六）
      ['2026-02-28', '2026-02-28'], // 春节补班（周六）
      ['2026-05-09', '2026-05-09'], // 劳动节补班（周六）
      ['2026-09-20', '2026-09-20'], // 国庆补班（周日）
      ['2026-10-10', '2026-10-10'] // 国庆补班（周六）
    ]
  }
}

const MS_DAY = 86_400_000

function dayNoOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY)
}

function strOfDayNo(dayNo: number): string {
  const dt = new Date(dayNo * MS_DAY)
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${m}-${d}`
}

function expand(ranges: string[][]): Set<string> {
  const set = new Set<string>()
  for (const [start, end] of ranges) {
    for (let n = dayNoOf(start); n <= dayNoOf(end); n++) {
      set.add(strOfDayNo(n))
    }
  }
  return set
}

const DATA: Record<string, { off: Set<string>; work: Set<string> }> = {}
for (const [year, ranges] of Object.entries(RAW)) {
  DATA[year] = { off: expand(ranges.off), work: expand(ranges.work) }
}

/** 已内置节假日数据的年份（界面提示用） */
export const HOLIDAY_YEARS: string[] = Object.keys(DATA).sort()

/**
 * 判断某天是不是工作日：
 * 有数据的年份 → 放假日不算，补班日算，其余按周一至周五；
 * 没有数据的年份 → 直接按周一至周五。
 */
export function isWorkdayDate(dateStr: string): boolean {
  const data = DATA[dateStr.slice(0, 4)]
  if (data) {
    if (data.off.has(dateStr)) return false
    if (data.work.has(dateStr)) return true
  }
  const weekday = new Date(dayNoOf(dateStr) * MS_DAY).getUTCDay()
  return weekday >= 1 && weekday <= 5
}
