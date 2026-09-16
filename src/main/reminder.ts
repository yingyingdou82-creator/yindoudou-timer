import { app, BrowserWindow, Notification } from 'electron'
import type { EventItem } from '../shared/types'
import { listEvents } from './store'

/**
 * 到点提醒：每 30 秒检查一次全部事件，
 * 对设置了时间 + 提前提醒的事件，在触发时间点弹系统通知。
 */

const CHECK_INTERVAL_MS = 30_000
// 触发后 10 分钟内仍然有效（比如电脑刚好在提醒时刻睡眠/重启）
const GRACE_MS = 10 * 60_000

let timer: ReturnType<typeof setInterval> | null = null
// 已发过通知的事件 id（本次运行内不重复发）
const fired = new Set<string>()

function notify(ev: EventItem, getWindow: () => BrowserWindow | null): void {
  if (!Notification.isSupported()) return
  const ahead = ev.remindMinutes
  const notification = new Notification({
    title: '银豆豆计时 · 提醒',
    body: `「${ev.name}」${ev.date} ${ev.time} 开始，还有 ${formatAhead(ahead)}`
  })
  notification.on('click', () => {
    const win = getWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })
  notification.show()
}

function formatAhead(mins: number): string {
  if (mins >= 1440) return `${mins / 1440} 天`
  if (mins >= 60) return `${mins / 60} 小时`
  return `${mins} 分钟`
}

function checkOnce(getWindow: () => BrowserWindow | null): void {
  const now = Date.now()
  for (const ev of listEvents()) {
    if (!ev.time || !ev.remindMinutes || ev.archived) continue
    // 事件的具体时刻（本地时间）
    const startMs = new Date(`${ev.date}T${ev.time}:00`).getTime()
    if (Number.isNaN(startMs)) continue
    const triggerMs = startMs - ev.remindMinutes * 60_000
    const late = now - triggerMs
    if (late >= 0 && late <= GRACE_MS && !fired.has(ev.id)) {
      fired.add(ev.id)
      notify(ev, getWindow)
    }
  }
}

export function startReminderScheduler(getMainWindow: () => BrowserWindow | null): void {
  if (timer) return
  checkOnce(getMainWindow)
  timer = setInterval(() => checkOnce(getMainWindow), CHECK_INTERVAL_MS)
  app.on('before-quit', () => {
    if (timer) clearInterval(timer)
  })
}
