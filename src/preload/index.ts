import { contextBridge, ipcRenderer } from 'electron'
import type {
  AttendanceRecord,
  AttendanceRecordDraft,
  EventDraft,
  EventItem
} from '../shared/types'

// 把"传话接口"安全地暴露给界面使用
contextBridge.exposeInMainWorld('api', {
  events: {
    list: (): Promise<EventItem[]> => ipcRenderer.invoke('events:list'),
    create: (draft: EventDraft): Promise<EventItem> => ipcRenderer.invoke('events:create', draft),
    update: (id: string, draft: EventDraft): Promise<EventItem> =>
      ipcRenderer.invoke('events:update', id, draft),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('events:remove', id)
  },
  attendance: {
    list: (): Promise<AttendanceRecord[]> => ipcRenderer.invoke('attendance:list'),
    upsert: (draft: AttendanceRecordDraft): Promise<AttendanceRecord> =>
      ipcRenderer.invoke('attendance:upsert', draft),
    remove: (date: string): Promise<void> => ipcRenderer.invoke('attendance:remove', date)
  },
  images: {
    /** 保存一张图片（dataURL），返回文件名 */
    save: (dataUrl: string): Promise<string> => ipcRenderer.invoke('images:save', dataUrl),
    /** 按文件名读取图片（返回 dataURL，没有则 null） */
    get: (filename: string): Promise<string | null> => ipcRenderer.invoke('images:get', filename),
    /** 删除图片文件 */
    remove: (filename: string): Promise<void> => ipcRenderer.invoke('images:remove', filename),
    /** 从网址下载图片（网页拖图用），返回 dataURL */
    fetchUrl: (url: string): Promise<string> => ipcRenderer.invoke('images:fetchUrl', url)
  },
  /** 订阅"数据变了"通知（主窗口和小组件都会收到），返回取消订阅函数 */
  onChanged: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('events:changed', listener)
    return () => {
      ipcRenderer.removeListener('events:changed', listener)
    }
  },
  widget: {
    /** 显示/隐藏小组件，返回当前是否显示 */
    toggle: (): Promise<boolean> => ipcRenderer.invoke('widget:toggle'),
    /** 读取小组件状态（宽度档位、透明度、是否显示） */
    getState: (): Promise<{ sizeLevel: number; opacity: number; visible: boolean }> =>
      ipcRenderer.invoke('widget:state'),
    /** 界面量好内容高度后上报，窗口自动伸缩 */
    setHeight: (px: number): Promise<void> => ipcRenderer.invoke('widget:setHeight', px),
    /** 应用并记住外观（宽度档位 / 透明度） */
    apply: (patch: { sizeLevel?: number; opacity?: number }): Promise<void> =>
      ipcRenderer.invoke('widget:apply', patch),
    /** 隐藏小组件 */
    hide: (): Promise<void> => ipcRenderer.invoke('widget:hide')
  },
  window: {
    /** 呼出主窗口 */
    focusMain: (): Promise<void> => ipcRenderer.invoke('window:focusMain'),
    /** 最小化 */
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    /** 最大化 / 还原 */
    maximizeToggle: (): Promise<void> => ipcRenderer.invoke('window:maximizeToggle'),
    /** 关闭（会被"隐藏到托盘"接住） */
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  },
  /** 订阅"是否最大化"状态变化 */
  onMaximized: (cb: (v: boolean) => void): (() => void) => {
    const listener = (_e: unknown, v: boolean): void => cb(v)
    ipcRenderer.on('window:maximized', listener)
    return () => {
      ipcRenderer.removeListener('window:maximized', listener)
    }
  },
  settings: {
    /** 读取通用设置（主题、字体大小、开机自启、新手指引） */
    get: (): Promise<{
      theme: 'light' | 'dark'
      fontScale: number
      autoLaunch: boolean
      guideShown: boolean
    }> => ipcRenderer.invoke('settings:get'),
    /** 切换主题，所有窗口即时生效 */
    setTheme: (theme: 'light' | 'dark'): Promise<'light' | 'dark'> =>
      ipcRenderer.invoke('settings:setTheme', theme),
    /** 设置字体大小倍数（0.85~1.4），所有窗口即时生效 */
    setFontScale: (value: number): Promise<number> =>
      ipcRenderer.invoke('settings:setFontScale', value),
    /** 设置开机自启（正式安装包里生效） */
    setAutoLaunch: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('settings:setAutoLaunch', value),
    /** 标记新手指引已看过 */
    setGuideShown: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('settings:setGuideShown', value)
  },
  /** 订阅"主题变了"通知（主窗口和小组件都会收到） */
  onThemeChanged: (cb: (theme: 'light' | 'dark') => void): (() => void) => {
    const listener = (_e: unknown, theme: 'light' | 'dark'): void => cb(theme)
    ipcRenderer.on('theme:changed', listener)
    return () => {
      ipcRenderer.removeListener('theme:changed', listener)
    }
  },
  /** 订阅"字体大小变了"通知 */
  onFontChanged: (cb: (scale: number) => void): (() => void) => {
    const listener = (_e: unknown, scale: number): void => cb(scale)
    ipcRenderer.on('font:changed', listener)
    return () => {
      ipcRenderer.removeListener('font:changed', listener)
    }
  },
  backup: {
    /** 导出备份（全部事件+图片存成一个文件），弹出保存窗口 */
    export: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('backup:export'),
    /** 导入备份，可选合并或替换 */
    import: (): Promise<{ ok: boolean; imported?: number; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke('backup:import')
  }
})
