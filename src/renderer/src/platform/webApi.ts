import { ElMessageBox } from 'element-plus'
import type {
  AttendanceRecord,
  AttendanceRecordDraft,
  EventDraft,
  EventItem
} from '@shared/types'
import {
  sanitizeAttendanceDraft,
  sanitizeAttendanceRecords,
  sanitizeDraft
} from '@shared/sanitize'
import { kvDelete, kvGet, kvKeys, kvSet } from './webStorage'

/**
 * 手机/网页版的"数据引擎"：实现和电脑版（Electron 传话接口）同样的功能，
 * 但数据存在浏览器内置的 IndexedDB 里。界面代码完全不用改。
 */

type WebApi = Window['api']

interface WebSettings {
  theme: 'light' | 'dark'
  fontScale: number
  autoLaunch: boolean
  guideShown: boolean
}

const IMG_PREFIX = 'img:'

// —— 页面内广播（网页版没有多窗口，同页面通知即可） ——
const changedListeners = new Set<() => void>()
const themeListeners = new Set<(t: 'light' | 'dark') => void>()
const fontListeners = new Set<(s: number) => void>()

function emitChanged(): void {
  changedListeners.forEach((cb) => cb())
}

async function readEvents(): Promise<EventItem[]> {
  return (await kvGet<EventItem[]>('events')) ?? []
}

async function writeEvents(list: EventItem[]): Promise<void> {
  await kvSet('events', list)
}

async function readAttendance(): Promise<AttendanceRecord[]> {
  return sanitizeAttendanceRecords(await kvGet<AttendanceRecord[]>('attendance'))
}

async function writeAttendance(list: AttendanceRecord[]): Promise<void> {
  await kvSet('attendance', list)
}

async function readSettings(): Promise<WebSettings> {
  const s = (await kvGet<WebSettings>('settings')) ?? {
    theme: 'light' as const,
    fontScale: 1,
    autoLaunch: false,
    guideShown: false
  }
  const fs = Number(s.fontScale)
  return {
    ...s,
    fontScale: Number.isFinite(fs) && fs >= 0.85 && fs <= 1.4 ? fs : 1,
    guideShown: Boolean(s.guideShown)
  }
}

async function writeSettings(s: WebSettings): Promise<void> {
  await kvSet('settings', s)
}

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 生成图片文件名（从 dataURL 里认出扩展名） */
function imageExtOf(dataUrl: string): string {
  const m = /^data:image\/(jpeg|png|webp);/.exec(dataUrl)
  if (!m) throw new Error('图片格式不支持，请换一张')
  return m[1] === 'jpeg' ? 'jpg' : m[1]
}

function dataUrlByteSize(dataUrl: string): number {
  const b64 = dataUrl.split(',')[1] ?? ''
  return Math.floor((b64.length * 3) / 4)
}

/** 让浏览器下载一个文件（网页版备份导出用） */
function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

/** 弹出文件选择框让用户挑备份文件 */
function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // 用户取消时不触发 onchange，弹窗关掉即可；这里给个兜底
    window.setTimeout(() => resolve(input.files?.[0] ?? null), 10 * 60 * 1000)
    input.click()
  })
}

export function createWebApi(): WebApi {
  return {
    events: {
      list: () => readEvents(),
      create: async (draft: EventDraft) => {
        const item: EventItem = { ...sanitizeDraft(draft), id: uuid(), createdAt: Date.now() }
        const list = await readEvents()
        list.push(item)
        await writeEvents(list)
        emitChanged()
        return item
      },
      update: async (id: string, draft: EventDraft) => {
        const clean = sanitizeDraft(draft)
        const list = await readEvents()
        const idx = list.findIndex((ev) => ev.id === id)
        if (idx < 0) throw new Error('没有找到这条事件，可能刚刚被删除了')
        const old = list[idx]
        const item: EventItem = { ...old, ...clean }
        list[idx] = item
        await writeEvents(list)
        if (old.image && old.image !== item.image) {
          await kvDelete(IMG_PREFIX + old.image)
        }
        emitChanged()
        return item
      },
      remove: async (id: string) => {
        const list = await readEvents()
        const target = list.find((ev) => ev.id === id)
        await writeEvents(list.filter((ev) => ev.id !== id))
        if (target?.image) {
          await kvDelete(IMG_PREFIX + target.image)
        }
        emitChanged()
      }
    },
    attendance: {
      list: () => readAttendance(),
      upsert: async (draft: AttendanceRecordDraft) => {
        const clean = sanitizeAttendanceDraft(draft)
        const item: AttendanceRecord = { ...clean, updatedAt: Date.now() }
        const records = await readAttendance()
        const index = records.findIndex((record) => record.date === item.date)
        if (index >= 0) {
          records[index] = item
        } else {
          records.push(item)
        }
        records.sort((a, b) => a.date.localeCompare(b.date))
        await writeAttendance(records)
        emitChanged()
        return item
      },
      remove: async (date: string) => {
        const records = await readAttendance()
        await writeAttendance(records.filter((record) => record.date !== date))
        emitChanged()
      }
    },
    images: {
      save: async (dataUrl: string) => {
        const ext = imageExtOf(dataUrl)
        if (dataUrlByteSize(dataUrl) > 5 * 1024 * 1024) {
          throw new Error('图片太大了（压缩后仍超过 5MB），请换一张')
        }
        const filename = `img_${Date.now()}_${uuid().slice(0, 8)}.${ext}`
        await kvSet(IMG_PREFIX + filename, dataUrl)
        return filename
      },
      get: async (filename: string) => (await kvGet<string>(IMG_PREFIX + filename)) ?? null,
      remove: async (filename: string) => {
        await kvDelete(IMG_PREFIX + filename)
      },
      fetchUrl: async (url: string) => {
        // 网页里下载别的网站的图片会受跨域限制，能下就下，不能下提示
        const res = await fetch(url)
        if (!res.ok) throw new Error(`图片下载失败（${res.status}）`)
        const type = (res.headers.get('content-type') ?? '').split(';')[0]
        if (!type.startsWith('image/')) throw new Error('这个链接不是图片')
        const blob = await res.blob()
        return await new Promise<string>((resolve, reject) => {
          const fr = new FileReader()
          fr.onload = () => resolve(String(fr.result))
          fr.onerror = () => reject(new Error('图片读取失败'))
          fr.readAsDataURL(blob)
        })
      }
    },
    onChanged: (cb: () => void) => {
      changedListeners.add(cb)
      return () => {
        changedListeners.delete(cb)
      }
    },
    widget: {
      // 网页/手机版没有桌面小组件，全部空操作
      toggle: async () => false,
      getState: async () => ({ sizeLevel: 1, opacity: 1, visible: false }),
      setHeight: async () => {},
      apply: async () => {},
      hide: async () => {}
    },
    window: {
      // 网页/手机版没有窗口控制
      focusMain: async () => {},
      minimize: async () => {},
      maximizeToggle: async () => {},
      close: async () => {}
    },
    settings: {
      get: () => readSettings(),
      setTheme: async (theme: 'light' | 'dark') => {
        const s = await readSettings()
        await writeSettings({ ...s, theme })
        themeListeners.forEach((cb) => cb(theme))
        return theme
      },
      setFontScale: async (value: number) => {
        const fs = Number(value)
        const safe = Number.isFinite(fs) ? Math.min(1.4, Math.max(0.85, fs)) : 1
        const s = await readSettings()
        await writeSettings({ ...s, fontScale: safe })
        fontListeners.forEach((cb) => cb(safe))
        return safe
      },
      setAutoLaunch: async () => {
        // 手机上没有"开机自启"，静默忽略
      },
      setGuideShown: async (value: boolean) => {
        const s = await readSettings()
        await writeSettings({ ...s, guideShown: value })
      }
    },
    onThemeChanged: (cb: (theme: 'light' | 'dark') => void) => {
      themeListeners.add(cb)
      return () => {
        themeListeners.delete(cb)
      }
    },
    onFontChanged: (cb: (scale: number) => void) => {
      fontListeners.add(cb)
      return () => {
        fontListeners.delete(cb)
      }
    },
    onMaximized: () => () => {},
    backup: {
      export: async () => {
        try {
          const events = await readEvents()
          const images: Record<string, string> = {}
          for (const key of await kvKeys(IMG_PREFIX)) {
            const data = await kvGet<string>(key)
            if (data) images[key.slice(IMG_PREFIX.length)] = data
          }
          const today = new Date().toISOString().slice(0, 10)
          const content = JSON.stringify({
            app: 'yin-dou-dou-timer',
            version: 2,
            exportedAt: new Date().toISOString(),
            events,
            attendance: await readAttendance(),
            images
          })
          downloadFile(`银豆豆计时备份-${today}.json`, content)
          return { ok: true, path: `下载/银豆豆计时备份-${today}.json` }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
      import: async () => {
        try {
          const file = await pickBackupFile()
          if (!file) return { ok: false, canceled: true }
          const parsed = JSON.parse(await file.text()) as {
            app?: string
            events?: unknown[]
            attendance?: unknown[]
            images?: Record<string, string>
          }
          if (parsed?.app !== 'yin-dou-dou-timer' || !Array.isArray(parsed?.events)) {
            return { ok: false, error: '这不是银豆豆计时的备份文件' }
          }

          const cleaned: EventItem[] = []
          for (const item of parsed.events) {
            try {
              const draft = sanitizeDraft(item)
              const r = (item ?? {}) as Partial<EventItem>
              cleaned.push({
                ...draft,
                id: typeof r.id === 'string' && r.id ? r.id : uuid(),
                createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now()
              })
            } catch {
              // 跳过坏数据
            }
          }
          if (cleaned.length === 0) return { ok: false, error: '备份里没有可用的事件' }
          const attendance = sanitizeAttendanceRecords(parsed.attendance)

          // 问合并还是替换（关闭弹窗 = 取消）
          let mode: 'merge' | 'replace' | 'cancel' = 'cancel'
          try {
            await ElMessageBox.confirm(
              '合并导入：加到现有事件后面\n替换导入：清空现在全部事件，完全变成备份内容',
              `怎么导入这 ${cleaned.length} 条事件？`,
              {
                confirmButtonText: '合并导入',
                cancelButtonText: '替换导入',
                type: 'info'
              }
            )
            mode = 'merge'
          } catch (action) {
            // 点"替换导入"按钮走的是 reject
            mode = action === 'cancel' ? 'replace' : 'cancel'
          }
          if (mode === 'cancel') return { ok: false, canceled: true }

          // 还原图片
          for (const [filename, dataUrl] of Object.entries(parsed.images ?? {})) {
            if (
              /^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(filename) &&
              /^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) &&
              dataUrlByteSize(dataUrl) <= 10 * 1024 * 1024
            ) {
              await kvSet(IMG_PREFIX + filename, dataUrl)
            }
          }

          let imported: number
          if (mode === 'replace') {
            await writeEvents(cleaned)
            await writeAttendance(attendance)
            imported = cleaned.length
          } else {
            const list = await readEvents()
            const existing = new Set(list.map((ev) => ev.id))
            let added = 0
            for (const ev of cleaned) {
              if (!existing.has(ev.id)) {
                list.push(ev)
                existing.add(ev.id)
                added++
              }
            }
            await writeEvents(list)
            const existingAttendance = new Map(
              (await readAttendance()).map((record) => [record.date, record])
            )
            for (const record of attendance) {
              const current = existingAttendance.get(record.date)
              if (!current || record.updatedAt >= current.updatedAt) {
                existingAttendance.set(record.date, record)
              }
            }
            await writeAttendance([...existingAttendance.values()])
            imported = added
          }
          emitChanged()
          return { ok: true, imported }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
    }
  }
}
