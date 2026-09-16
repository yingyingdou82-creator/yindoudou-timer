import type { CountType } from '@shared/types'

// 颜色盘（银豆豆风格的柔和配色）：main=主色，soft=卡片底色
export interface ColorOption {
  key: string
  label: string
  main: string
  soft: string
}

export const COLOR_PALETTE: ColorOption[] = [
  { key: 'silver', label: '银灰', main: '#8a97a8', soft: '#eef1f5' },
  { key: 'coral', label: '珊瑚红', main: '#e07a6b', soft: '#fbedea' },
  { key: 'peach', label: '蜜桃橙', main: '#e8a06a', soft: '#fcf1e6' },
  { key: 'lemon', label: '柠檬黄', main: '#cfae3e', soft: '#f9f3db' },
  { key: 'mint', label: '薄荷绿', main: '#66b891', soft: '#e6f4ed' },
  { key: 'sky', label: '天空蓝', main: '#6aa6d8', soft: '#e7f1fa' },
  { key: 'lilac', label: '丁香紫', main: '#9a8cc9', soft: '#f0ebf9' },
  { key: 'rose', label: '玫瑰粉', main: '#d98ba0', soft: '#fbecf1' }
]

export function colorOf(key: string): ColorOption {
  return COLOR_PALETTE.find((c) => c.key === key) ?? COLOR_PALETTE[0]
}

// 可选小图标
export const ICON_CHOICES = [
  '🎂', '📚', '✈️', '🎓', '💍', '🏠', '💼', '💪',
  '❤️', '🎉', '🎯', '🍼', '🍀', '⏰', '🏁', '🏆',
  '🎄', '🧧', '🚗', '💰', '📌', '🎮', '🐶', '🌈'
]

export const DEFAULT_COLOR = 'sky'
export const DEFAULT_ICON = '🎉'

// 显示用的文字标签
export const COUNT_TYPE_LABELS: Record<CountType, string> = {
  natural: '自然日',
  workday: '工作日',
  week: '按周',
  year: '按年'
}

// 提前提醒的可选项（分钟数；0 = 不提醒）
export const REMIND_OPTIONS = [0, 5, 10, 15, 30, 60, 720, 1440]

/** 提前提醒选项的文字，如 30 → 「提前 30 分钟」 */
export function remindOptionLabel(mins: number): string {
  if (mins === 0) return '不提醒'
  return `提前 ${remindLabel(mins)}`
}

export function remindLabel(mins: number): string {
  if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440} 天`
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} 小时`
  return `${mins} 分钟`
}
