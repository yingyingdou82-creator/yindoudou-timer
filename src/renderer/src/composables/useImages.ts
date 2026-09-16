import { platformApi } from '../platform'

// 图片缓存：同一个文件名全界面只读取一次，卡片再多也不重复加载
const cache = new Map<string, string>()

export function useImages() {
  async function loadImage(filename: string): Promise<string> {
    if (!filename) return ''
    const hit = cache.get(filename)
    if (hit) return hit
    const dataUrl = (await platformApi.images.get(filename)) ?? ''
    if (dataUrl) {
      cache.set(filename, dataUrl)
    }
    return dataUrl
  }

  function forget(filename: string): void {
    cache.delete(filename)
  }

  /** 数据有大变化（如导入备份）时清空缓存，让界面重新读取 */
  function clearAll(): void {
    cache.clear()
  }

  return { loadImage, forget, clearAll }
}
