import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { EventItem } from '../shared/types'
import { appendEvents, listEvents, replaceEvents } from './store'
import { sanitizeDraft } from '../shared/sanitize'
import { getImage, imgDir, restoreImage } from './images'

/**
 * 备份导出/导入：
 * 备份文件是一个 JSON，里面装着全部事件 + 全部图片（转成文本），
 * 一个文件带走所有数据，换电脑、重装系统都不怕。
 */

interface BackupFile {
  app: 'yin-dou-dou-timer'
  version: 1
  exportedAt: string
  events: EventItem[]
  /** 文件名 -> 图片内容（dataURL） */
  images: Record<string, string>
}

export interface ExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
}

export interface ImportResult {
  ok: boolean
  imported?: number
  canceled?: boolean
  error?: string
}

export async function exportBackup(parent: BrowserWindow | null): Promise<ExportResult> {
  try {
    // 收集全部事件和图片
    const images: Record<string, string> = {}
    for (const file of readdirSync(imgDir())) {
      const dataUrl = getImage(file)
      if (dataUrl) images[file] = dataUrl
    }
    const backup: BackupFile = {
      app: 'yin-dou-dou-timer',
      version: 1,
      exportedAt: new Date().toISOString(),
      events: listEvents(),
      images
    }

    const today = new Date().toISOString().slice(0, 10)
    const options = {
      title: '导出备份',
      defaultPath: `银豆豆计时备份-${today}.json`,
      filters: [{ name: '银豆豆备份文件', extensions: ['json'] }]
    }
    const picked = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)

    if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
    writeFileSync(picked.filePath, JSON.stringify(backup), 'utf-8')
    return { ok: true, path: picked.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 逐条校验备份里的事件，坏数据跳过，好数据补齐 id/创建时间 */
function cleanBackupEvents(raw: unknown): EventItem[] {
  const list = Array.isArray(raw) ? raw : []
  const cleaned: EventItem[] = []
  for (const item of list) {
    try {
      const draft = sanitizeDraft(item)
      const r = (item ?? {}) as Partial<EventItem>
      cleaned.push({
        ...draft,
        id: typeof r.id === 'string' && r.id ? r.id : randomUUID(),
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now()
      })
    } catch {
      // 跳过不合格的条目，不影响其余导入
    }
  }
  return cleaned
}

export async function importBackup(parent: BrowserWindow | null): Promise<ImportResult> {
  try {
    const options = {
      title: '导入备份',
      filters: [{ name: '银豆豆备份文件', extensions: ['json'] }],
      properties: ['openFile' as const]
    }
    const picked = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true }

    const raw = readFileSync(picked.filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw) as Partial<BackupFile>
    if (parsed?.app !== 'yin-dou-dou-timer' || !Array.isArray(parsed?.events)) {
      return { ok: false, error: '这不是银豆豆计时的备份文件' }
    }

    const events = cleanBackupEvents(parsed.events)
    if (events.length === 0) {
      return { ok: false, error: '备份里没有可用的事件' }
    }

    // 问用户怎么导：合并 or 替换
    const choice = parent
      ? await dialog.showMessageBox(parent, {
          type: 'question',
          title: '导入备份',
          message: `备份里有 ${events.length} 条事件，怎么导入？`,
          detail:
            '合并导入：加到现有事件后面，已有的不动（推荐换电脑用）\n替换导入：清空现在全部事件和设置，完全变成备份内容',
          buttons: ['合并导入', '替换导入', '取消'],
          defaultId: 0,
          cancelId: 2
        })
      : { response: 0 }
    if (choice.response === 2) return { ok: false, canceled: true }

    // 先还原图片（失败的单张跳过）
    for (const [filename, dataUrl] of Object.entries(parsed.images ?? {})) {
      try {
        restoreImage(filename, dataUrl)
      } catch {
        // 单张坏了不影响其他
      }
    }

    const imported =
      choice.response === 1 ? replaceEvents(events) : appendEvents(events)
    return { ok: true, imported }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
