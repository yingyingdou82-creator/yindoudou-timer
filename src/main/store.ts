import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EventDraft, EventItem } from '../shared/types'
import { sanitizeDraft } from '../shared/sanitize'
import { removeImageFile } from './images'

// 数据文件位置：系统标准的用户数据目录下的 events.json
// （Windows 在 C:\Users\用户名\AppData\Roaming\ 里，Mac 在 资源库/Application Support 里）
const DATA_FILE = (): string => join(app.getPath('userData'), 'events.json')

interface DataFile {
  version: 1
  events: EventItem[]
}

function readAll(): DataFile {
  const file = DATA_FILE()
  if (!existsSync(file)) {
    return { version: 1, events: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<DataFile>
    return { version: 1, events: Array.isArray(parsed?.events) ? parsed.events : [] }
  } catch (err) {
    // 文件损坏时先备份原文件再重置，避免用户的旧数据被直接覆盖
    console.error('数据文件读取失败，已备份并重置为空', err)
    try {
      renameSync(file, `${file}.broken-${Date.now()}`)
    } catch {
      // 备份失败也只能继续用空数据启动
    }
    return { version: 1, events: [] }
  }
}

function writeAll(data: DataFile): void {
  // 先写临时文件再改名，防止写一半时断电/崩溃导致数据文件损坏
  const file = DATA_FILE()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, file)
}

export function listEvents(): EventItem[] {
  return readAll().events
}

export function createEvent(input: unknown): EventItem {
  const draft = sanitizeDraft(input)
  const item: EventItem = { ...draft, id: randomUUID(), createdAt: Date.now() }
  const data = readAll()
  data.events.push(item)
  writeAll(data)
  return item
}

export function updateEvent(id: string, input: unknown): EventItem {
  const draft = sanitizeDraft(input)
  const data = readAll()
  const idx = data.events.findIndex((ev) => ev.id === id)
  if (idx < 0) throw new Error('没有找到这条事件，可能刚刚被删除了')
  const old = data.events[idx]
  const item: EventItem = { ...old, ...draft }
  data.events[idx] = item
  writeAll(data)
  // 换图或删图后，清理不再使用的旧图片文件
  if (old.image && old.image !== item.image) {
    removeImageFile(old.image)
  }
  return item
}

export function removeEvent(id: string): void {
  const data = readAll()
  const target = data.events.find((ev) => ev.id === id)
  data.events = data.events.filter((ev) => ev.id !== id)
  writeAll(data)
  if (target?.image) {
    removeImageFile(target.image)
  }
}

/** 导入备份（替换模式）：全部事件换成给定列表 */
export function replaceEvents(items: EventItem[]): number {
  writeAll({ version: 1, events: items })
  return items.length
}

/** 导入备份（合并模式）：追加没有的事件（按 id 去重），返回新增条数 */
export function appendEvents(items: EventItem[]): number {
  const data = readAll()
  const existing = new Set(data.events.map((ev) => ev.id))
  let added = 0
  for (const item of items) {
    if (!existing.has(item.id)) {
      data.events.push(item)
      existing.add(item.id)
      added++
    }
  }
  writeAll(data)
  return added
}
