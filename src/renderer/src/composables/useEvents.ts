import { ref } from 'vue'
import type { EventDraft, EventItem } from '@shared/types'
import { platformApi } from '../platform'

// 模块级状态：整个界面共用同一份事件数据（Vue 自带方式，无额外零件）
const events = ref<EventItem[]>([])
const loaded = ref(false)

export function useEvents() {
  /** 从存储重新加载全部事件 */
  async function load(): Promise<void> {
    events.value = await platformApi.events.list()
    loaded.value = true
  }

  async function create(draft: EventDraft): Promise<void> {
    const item = await platformApi.events.create(draft)
    events.value = [...events.value, item]
  }

  async function update(id: string, draft: EventDraft): Promise<void> {
    const item = await platformApi.events.update(id, draft)
    events.value = events.value.map((ev) => (ev.id === id ? item : ev))
  }

  async function remove(id: string): Promise<void> {
    await platformApi.events.remove(id)
    events.value = events.value.filter((ev) => ev.id !== id)
  }

  return { events, loaded, load, create, update, remove }
}
