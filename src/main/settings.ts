import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 软件自身的设置（和事件数据分开存），目前主要是桌面小组件的外观记忆：
 * 位置、宽度档位、透明度。存在用户数据目录的 settings.json。
 */

export interface WidgetSettings {
  /** 上次的位置（屏幕坐标）；null = 还没有记忆，用默认位置 */
  x: number | null
  y: number | null
  /** 宽度档位：0=窄 1=中 2=宽 */
  sizeLevel: number
  /** 窗口透明度 0.3 ~ 1 */
  opacity: number
  /** 上次是否开着（软件启动时自动恢复小组件） */
  open: boolean
}

const DEFAULTS: WidgetSettings = { x: null, y: null, sizeLevel: 1, opacity: 1, open: false }

const FILE = (): string => join(app.getPath('userData'), 'settings.json')

export function getWidgetSettings(): WidgetSettings {
  try {
    if (!existsSync(FILE())) return { ...DEFAULTS }
    const parsed = JSON.parse(readFileSync(FILE(), 'utf-8')) as { widget?: Partial<WidgetSettings> }
    const w = parsed?.widget ?? {}
    return {
      x: typeof w.x === 'number' ? w.x : null,
      y: typeof w.y === 'number' ? w.y : null,
      sizeLevel: [0, 1, 2].includes(Number(w.sizeLevel)) ? Number(w.sizeLevel) : 1,
      opacity:
        typeof w.opacity === 'number' && w.opacity >= 0.3 && w.opacity <= 1 ? w.opacity : 1,
      open: Boolean(w.open)
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveWidgetSettings(patch: Partial<WidgetSettings>): WidgetSettings {
  const next: WidgetSettings = { ...getWidgetSettings(), ...patch }
  const file = FILE()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify({ widget: next }, null, 2), 'utf-8')
  renameSync(tmp, file)
  return next
}

// ---- 通用设置（主题、字体大小、开机自启） ----

export type Theme = 'light' | 'dark'

export interface AppSettings {
  theme: Theme
  /** 界面字体大小倍数（0.85 ~ 1.4） */
  fontScale: number
  autoLaunch: boolean
  /** 是否已看过新手指引（看完不再自动弹出） */
  guideShown: boolean
}

const APP_DEFAULTS: AppSettings = {
  theme: 'light',
  fontScale: 1,
  autoLaunch: false,
  guideShown: false
}

export function getAppSettings(): AppSettings {
  try {
    if (!existsSync(FILE())) return { ...APP_DEFAULTS }
    const parsed = JSON.parse(readFileSync(FILE(), 'utf-8')) as Partial<AppSettings>
    const fs = Number(parsed?.fontScale)
    return {
      theme: parsed?.theme === 'dark' ? 'dark' : 'light',
      fontScale: Number.isFinite(fs) && fs >= 0.85 && fs <= 1.4 ? fs : 1,
      autoLaunch: Boolean(parsed?.autoLaunch),
      guideShown: Boolean(parsed?.guideShown)
    }
  } catch {
    return { ...APP_DEFAULTS }
  }
}

export function saveAppSettings(patch: Partial<AppSettings>): AppSettings {
  const widget = getWidgetSettings()
  const appNext: AppSettings = { ...getAppSettings(), ...patch }
  const file = FILE()
  const tmp = `${file}.tmp`
  writeFileSync(
    tmp,
    JSON.stringify({ widget, ...appNext }, null, 2),
    'utf-8'
  )
  renameSync(tmp, file)
  return appNext
}
