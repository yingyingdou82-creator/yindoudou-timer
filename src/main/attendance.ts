import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AttendanceRecord, AttendanceRecordDraft } from '../shared/types'
import { sanitizeAttendanceDraft, sanitizeAttendanceRecords } from '../shared/sanitize'

interface AttendanceFile {
  version: 1
  records: AttendanceRecord[]
}

const DATA_FILE = (): string => join(app.getPath('userData'), 'attendance.json')

function readAll(): AttendanceFile {
  const file = DATA_FILE()
  if (!existsSync(file)) return { version: 1, records: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<AttendanceFile>
    return { version: 1, records: sanitizeAttendanceRecords(parsed.records) }
  } catch (err) {
    // 打卡数据损坏时保留原文件，避免下一次写入覆盖掉仍可恢复的数据。
    console.error('打卡数据读取失败，已备份并重置为空', err)
    try {
      renameSync(file, file + '.broken-' + Date.now())
    } catch {
      // 备份失败仍让主程序可以继续打开
    }
    return { version: 1, records: [] }
  }
}

function writeAll(data: AttendanceFile): void {
  const file = DATA_FILE()
  const temp = file + '.tmp'
  writeFileSync(temp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(temp, file)
}

export function listAttendance(): AttendanceRecord[] {
  return readAll().records
}

export function upsertAttendance(input: unknown): AttendanceRecord {
  const draft = sanitizeAttendanceDraft(input)
  const data = readAll()
  const item: AttendanceRecord = { ...draft, updatedAt: Date.now() }
  const index = data.records.findIndex((record) => record.date === item.date)
  if (index >= 0) {
    data.records[index] = item
  } else {
    data.records.push(item)
  }
  data.records.sort((a, b) => a.date.localeCompare(b.date))
  writeAll(data)
  return item
}

export function removeAttendance(date: string): void {
  const data = readAll()
  const next = data.records.filter((record) => record.date !== date)
  if (next.length === data.records.length) return
  writeAll({ version: 1, records: next })
}

export function replaceAttendance(records: AttendanceRecord[]): number {
  const clean = sanitizeAttendanceRecords(records)
  writeAll({ version: 1, records: clean })
  return clean.length
}

export function mergeAttendance(records: AttendanceRecord[]): number {
  const data = readAll()
  const byDate = new Map(data.records.map((record) => [record.date, record]))
  let changed = 0
  for (const record of sanitizeAttendanceRecords(records)) {
    const current = byDate.get(record.date)
    if (!current || record.updatedAt >= current.updatedAt) {
      byDate.set(record.date, record)
      changed++
    }
  }
  writeAll({
    version: 1,
    records: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  })
  return changed
}
