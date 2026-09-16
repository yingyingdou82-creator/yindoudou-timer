import { app, BrowserWindow, screen } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'path'
import { getWidgetSettings, saveWidgetSettings, type WidgetSettings } from './settings'

/**
 * 桌面小组件窗口（悬浮面板）：
 * 无边框、透明、置顶、不占任务栏；位置/宽度/透明度有记忆。
 */

export const WIDGET_WIDTHS = [230, 300, 380]

let widgetWin: BrowserWindow | null = null
const widgetWindowSet = new WeakSet<BrowserWindow>()

export function isWidgetWindow(win: BrowserWindow): boolean {
  return widgetWindowSet.has(win)
}

export function isWidgetVisible(): boolean {
  return widgetWin !== null && widgetWin.isVisible()
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 截图模式：等渲染稳定后截取页面内容（不沾任何桌面背景），存盘并退出 */
export async function screenshotAndQuit(win: BrowserWindow, out: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const image = await win.webContents.capturePage()
  writeFileSync(out, image.toPNG())
  app.quit()
}

function createWidget(): void {
  const s = getWidgetSettings()
  const wa = screen.getPrimaryDisplay().workArea
  const width = WIDGET_WIDTHS[s.sizeLevel] ?? 300

  // 有记忆位置就用记忆的（并保证还在屏幕内），否则默认放屏幕右侧
  let x = s.x ?? wa.x + wa.width - width - 24
  let y = s.y ?? wa.y + 60
  x = clamp(x, wa.x, wa.x + wa.width - width)
  y = clamp(y, wa.y, wa.y + wa.height - 140)

  widgetWin = new BrowserWindow({
    width,
    height: 200,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  widgetWindowSet.add(widgetWin)

  // 固定在桌面：不置顶（会被其他窗口盖住，点桌面时露出来）
  // 被"显示桌面"(Win+D) 最小化时，立刻弹回来，保持钉在桌面
  widgetWin.on('minimize', () => {
    setTimeout(() => widgetWin?.restore(), 30)
  })

  // 拖动后记住位置（防抖：停止拖动 0.4 秒后才保存）
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  widgetWin.on('moved', () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!widgetWin) return
      const [px, py] = widgetWin.getPosition()
      saveWidgetSettings({ x: px, y: py })
    }, 400)
  })

  widgetWin.on('closed', () => {
    widgetWin = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void widgetWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/widget.html`)
  } else {
    void widgetWin.loadFile(join(__dirname, '../renderer/widget.html'))
  }

  widgetWin.once('ready-to-show', () => {
    widgetWin?.show()
    const shotOut = process.env['YDD_SHOT_OUT']
    if (process.env['YDD_SHOT_WIDGET'] === '1' && shotOut && widgetWin) {
      void screenshotAndQuit(widgetWin, shotOut)
    }
  })
}

/** 显示/隐藏小组件，返回现在的显示状态（并记住开关状态，下次启动自动恢复） */
export function toggleWidget(): boolean {
  if (!widgetWin) {
    createWidget()
    saveWidgetSettings({ open: true })
    return true
  }
  if (widgetWin.isVisible()) {
    widgetWin.hide()
    saveWidgetSettings({ open: false })
    return false
  }
  widgetWin.show()
  saveWidgetSettings({ open: true })
  return true
}

/** 软件启动时调用：上次开着小组件的话，自动恢复 */
export function restoreWidgetIfOpen(): void {
  if (!widgetWin && getWidgetSettings().open) {
    createWidget()
  }
}

/** 界面量好自己的内容高度后上报，窗口随之伸缩（限制在屏幕 80% 内） */
export function widgetSetHeight(px: number): void {
  if (!widgetWin) return
  const wa = screen.getPrimaryDisplay().workArea
  const bounds = widgetWin.getBounds()
  const height = clamp(Math.round(px), 120, Math.round(wa.height * 0.8))
  widgetWin.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height })
}

/** 应用并记住外观设置（宽度档位 / 透明度） */
export function widgetApply(patch: Partial<WidgetSettings>): void {
  if (!widgetWin) return
  const next = saveWidgetSettings(patch)
  if (typeof patch.sizeLevel === 'number') {
    const b = widgetWin.getBounds()
    widgetWin.setBounds({ x: b.x, y: b.y, width: WIDGET_WIDTHS[next.sizeLevel], height: b.height })
  }
  if (typeof patch.opacity === 'number') {
    widgetWin.setOpacity(next.opacity)
  }
}

export function getWidgetState(): { sizeLevel: number; opacity: number; visible: boolean } {
  const s = getWidgetSettings()
  return { sizeLevel: s.sizeLevel, opacity: s.opacity, visible: isWidgetVisible() }
}

/**
 * 隐藏小组件——绝不因此退出软件。
 * 如果主窗口此前被藏起来了（因为关主窗口时小组件还开着），就把主窗口请回来，
 * 保证软件永远有可见入口。
 */
export function hideWidget(): void {
  if (!widgetWin) return
  widgetWin.hide()
  saveWidgetSettings({ open: false })
  const main = BrowserWindow.getAllWindows().find((w) => !isWidgetWindow(w))
  if (main && (!main.isVisible() || main.isMinimized())) {
    main.show()
    main.focus()
  }
}
