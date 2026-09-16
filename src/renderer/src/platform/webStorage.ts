/**
 * 手机/网页版的存储：IndexedDB（浏览器内置的本地数据库，数据存在设备上，不上传）。
 * 用最简单的 key-value 方式存：事件列表、设置、图片各占一个键。
 */

const DB_NAME = 'yddt'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('本地数据库打不开'))
  })
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function kvDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 列出所有以某前缀开头的键（比如全部图片 img:xxx） */
export async function kvKeys(prefix: string): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String).filter((k) => k.startsWith(prefix)))
    req.onerror = () => reject(req.error)
  })
}
