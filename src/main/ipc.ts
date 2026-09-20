import { app, BrowserWindow, ipcMain } from 'electron'
import { createEvent, listEvents, removeEvent, updateEvent } from './store'
import { fetchImageAsDataUrl, getImage, removeImageFile, saveImage } from './images'
import {
  getWidgetState,
  hideWidget,
  isWidgetWindow,
  toggleWidget,
  widgetApply,
  widgetSetHeight
} from './widget'
import { getAppSettings, saveAppSettings, type WidgetSettings } from './settings'
import { exportBackup, importBackup } from './backup'
import type { BrowserWindow as MainWindowType } from 'electron'
import { listAttendance, removeAttendance, upsertAttendance } from './attendance'

/**
 * 注册"传话"接口。
 * 界面（渲染进程）不能直接碰文件和窗口，全部通过这里的接口请外壳（主进程）代劳。
 */

/** 数据有变化时，通知所有窗口（主窗口和小组件）刷新 */
function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('events:changed')
  }
}

function focusMainWindow(getMainWindow: () => MainWindowType | null): void {
  const main = getMainWindow() ?? BrowserWindow.getAllWindows().find((w) => !isWidgetWindow(w))
  if (main) {
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
  }
}

export function registerEventIpc(getMainWindow: () => MainWindowType | null): void {
  ipcMain.handle('events:list', () => listEvents())
  ipcMain.handle('events:create', (_event, draft: unknown) => {
    const item = createEvent(draft)
    broadcastChanged()
    return item
  })
  ipcMain.handle('events:update', (_event, id: string, draft: unknown) => {
    const item = updateEvent(id, draft)
    broadcastChanged()
    return item
  })
  ipcMain.handle('events:remove', (_event, id: string) => {
    removeEvent(id)
    broadcastChanged()
  })

  // 实际出勤打卡（日历中一天只保留一条状态）
  ipcMain.handle('attendance:list', () => listAttendance())
  ipcMain.handle('attendance:upsert', (_event, draft: unknown) => {
    const item = upsertAttendance(draft)
    broadcastChanged()
    return item
  })
  ipcMain.handle('attendance:remove', (_event, date: string) => {
    removeAttendance(date)
    broadcastChanged()
  })

  // 背景图片
  ipcMain.handle('images:save', (_event, dataUrl: string) => saveImage(dataUrl))
  ipcMain.handle('images:get', (_event, filename: string) => getImage(filename))
  ipcMain.handle('images:remove', (_event, filename: string) => removeImageFile(filename))
  ipcMain.handle('images:fetchUrl', (_event, url: string) => fetchImageAsDataUrl(url))

  // 桌面小组件
  ipcMain.handle('widget:toggle', () => toggleWidget())
  ipcMain.handle('widget:state', () => getWidgetState())
  ipcMain.handle('widget:setHeight', (_event, px: number) => widgetSetHeight(px))
  ipcMain.handle('widget:apply', (_event, patch: Partial<WidgetSettings>) => widgetApply(patch))
  ipcMain.handle('widget:hide', () => hideWidget())

  // 窗口操作
  ipcMain.handle('window:focusMain', () => focusMainWindow(getMainWindow))
  ipcMain.handle('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.handle('window:maximizeToggle', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })
  // 关闭 = 走窗口 close 流程（会被"隐藏到托盘"逻辑接住）
  ipcMain.handle('window:close', () => getMainWindow()?.close())

  // 通用设置（主题、字体大小、开机自启）
  ipcMain.handle('settings:get', () => getAppSettings())
  ipcMain.handle('settings:setTheme', (_event, theme: string) => {
    const next = saveAppSettings({ theme: theme === 'dark' ? 'dark' : 'light' })
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('theme:changed', next.theme)
    }
    return next.theme
  })
  ipcMain.handle('settings:setFontScale', (_event, value: number) => {
    const fs = Number(value)
    const safe = Number.isFinite(fs) ? Math.min(1.4, Math.max(0.85, fs)) : 1
    const next = saveAppSettings({ fontScale: safe })
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('font:changed', next.fontScale)
    }
    return next.fontScale
  })
  ipcMain.handle('settings:setAutoLaunch', (_event, value: boolean) => {
    saveAppSettings({ autoLaunch: Boolean(value) })
    // 开机自启只在正式安装包里真正生效（开发模式下注册的是开发程序，没有意义）
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: Boolean(value) })
    }
  })
  ipcMain.handle('settings:setGuideShown', (_event, value: boolean) => {
    saveAppSettings({ guideShown: Boolean(value) })
  })

  // 备份
  ipcMain.handle('backup:export', () => exportBackup(getMainWindow()))
  ipcMain.handle('backup:import', async () => {
    const result = await importBackup(getMainWindow())
    if (result.ok) broadcastChanged()
    return result
  })
}
