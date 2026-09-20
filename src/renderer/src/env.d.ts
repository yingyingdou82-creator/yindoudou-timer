import type {
  AttendanceRecord,
  AttendanceRecordDraft,
  EventDraft,
  EventItem
} from '@shared/types'

// 告诉 TypeScript：window 上有 api 这个对象（由 preload 提供）
declare global {
  interface Window {
    api: {
      events: {
        list(): Promise<EventItem[]>
        create(draft: EventDraft): Promise<EventItem>
        update(id: string, draft: EventDraft): Promise<EventItem>
        remove(id: string): Promise<void>
      }
      attendance: {
        list(): Promise<AttendanceRecord[]>
        upsert(draft: AttendanceRecordDraft): Promise<AttendanceRecord>
        remove(date: string): Promise<void>
      }
      images: {
        save(dataUrl: string): Promise<string>
        get(filename: string): Promise<string | null>
        remove(filename: string): Promise<void>
        fetchUrl(url: string): Promise<string>
      }
      onChanged(cb: () => void): () => void
      widget: {
        toggle(): Promise<boolean>
        getState(): Promise<{ sizeLevel: number; opacity: number; visible: boolean }>
        setHeight(px: number): Promise<void>
        apply(patch: { sizeLevel?: number; opacity?: number }): Promise<void>
        hide(): Promise<void>
      }
      window: {
        focusMain(): Promise<void>
        minimize(): Promise<void>
        maximizeToggle(): Promise<void>
        close(): Promise<void>
      }
      onMaximized(cb: (v: boolean) => void): () => void
      settings: {
        get(): Promise<{
          theme: 'light' | 'dark'
          fontScale: number
          autoLaunch: boolean
          guideShown: boolean
        }>
        setTheme(theme: 'light' | 'dark'): Promise<'light' | 'dark'>
        setFontScale(value: number): Promise<number>
        setAutoLaunch(value: boolean): Promise<void>
        setGuideShown(value: boolean): Promise<void>
      }
      onThemeChanged(cb: (theme: 'light' | 'dark') => void): () => void
      onFontChanged(cb: (scale: number) => void): () => void
      backup: {
        export(): Promise<{ ok: boolean; path?: string; error?: string }>
        import(): Promise<{
          ok: boolean
          imported?: number
          canceled?: boolean
          error?: string
        }>
      }
    }
  }
}

export {}
