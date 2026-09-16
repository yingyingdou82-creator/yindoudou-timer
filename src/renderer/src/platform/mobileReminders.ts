import type { EventItem } from '@shared/types'

/**
 * 手机版到点提醒（只在安卓 App 里生效，网页/电脑版自动跳过）：
 * App 打开或数据变化时，把未来 7 天内会触发的提醒提前注册到系统。
 * 到点由安卓系统弹出通知——即使那时 App 已关闭也能收到。
 */

interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' }>
  requestPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' }>
  getPending(): Promise<{ notifications: Array<{ id: number }> }>
  cancel(pending: { notifications: Array<{ id: number }> }): Promise<void>
  schedule(options: {
    notifications: Array<{
      id: number
      title: string
      body: string
      schedule: { at: number; allowWhileIdle?: boolean }
    }>
  }): Promise<void>
}

interface CapacitorGlobal {
  Capacitor?: {
    isNativePlatform?: () => boolean
    Plugins?: Record<string, unknown>
  }
}

/** 只看未来 7 天内的提醒 */
const WINDOW_AHEAD_MS = 7 * 24 * 60 * 60 * 1000

/** 用事件 id 生成稳定的通知编号（通知 id 必须是整数） */
function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 2000000000
}

function aheadLabel(mins: number): string {
  if (mins >= 1440) return `${mins / 1440} 天`
  if (mins >= 60) return `${mins / 60} 小时`
  return `${mins} 分钟`
}

export async function scheduleMobileReminders(events: EventItem[]): Promise<void> {
  const cap = (window as unknown as CapacitorGlobal).Capacitor
  if (!cap?.isNativePlatform?.()) return
  const ln = cap.Plugins?.['LocalNotifications'] as LocalNotificationsPlugin | undefined
  if (!ln) return

  try {
    // 通知权限（安卓 13+ 需要用户同意；只在首次询问）
    let perm = await ln.checkPermissions()
    if (perm.display === 'prompt') {
      perm = await ln.requestPermissions()
    }
    if (perm.display !== 'granted') return

    // 重建计划：先清掉旧通知，再按最新数据注册
    const pending = await ln.getPending()
    if (pending.notifications.length > 0) {
      await ln.cancel({ notifications: pending.notifications })
    }

    const now = Date.now()
    const list: Array<{
      id: number
      title: string
      body: string
      schedule: { at: number; allowWhileIdle: boolean }
    }> = []

    for (const ev of events) {
      if (!ev.time || !ev.remindMinutes || ev.archived) continue
      const startMs = new Date(`${ev.date}T${ev.time}:00`).getTime()
      if (Number.isNaN(startMs)) continue
      const triggerAt = startMs - ev.remindMinutes * 60_000
      // 过期的、太远的（超过 7 天）都不注册，下次打开 App 会再补
      if (triggerAt <= now || triggerAt > now + WINDOW_AHEAD_MS) continue

      list.push({
        id: hashId(ev.id),
        title: '银豆豆计时 · 提醒',
        body: `「${ev.name}」将于 ${ev.time} 开始（提前 ${aheadLabel(ev.remindMinutes)}提醒）`,
        schedule: { at: triggerAt, allowWhileIdle: true }
      })
    }

    if (list.length > 0) {
      await ln.schedule({ notifications: list })
    }
  } catch {
    // 提醒失败不影响主流程
  }
}
