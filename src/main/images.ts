import { app, net } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * 事件背景图片的存取。
 * 图片统一放在用户数据目录下的 images 文件夹，事件数据里只记文件名。
 */

// 只允许简单的文件名，防止路径注入（如 ../../xxx）
const NAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/

export function imgDir(): string {
  const dir = join(app.getPath('userData'), 'images')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 保存一张图片（界面传来的 dataURL），返回生成的文件名 */
export function saveImage(dataUrl: string): string {
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('图片格式不支持，请换一张试试')
  const buf = Buffer.from(match[2], 'base64')
  if (buf.length > 5 * 1024 * 1024) throw new Error('图片太大了（压缩后仍超过 5MB），请换一张')

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  const filename = `img_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
  writeFileSync(join(imgDir(), filename), buf)
  return filename
}

/** 读取图片，返回 dataURL（给界面直接显示）；文件不存在返回 null */
export function getImage(filename: string): string | null {
  if (!NAME_RE.test(filename)) return null
  const file = join(imgDir(), filename)
  if (!existsSync(file)) return null
  const ext = filename.endsWith('.png') ? 'png' : filename.endsWith('.webp') ? 'webp' : 'jpeg'
  return `data:image/${ext};base64,${readFileSync(file).toString('base64')}`
}

/** 删除图片文件（事件删除或换图时清理旧文件） */
export function removeImageFile(filename: string): void {
  if (!NAME_RE.test(filename)) return
  try {
    unlinkSync(join(imgDir(), filename))
  } catch {
    // 文件不存在就算了，不影响使用
  }
}

/** 按原文件名还原一张图片（导入备份用） */
export function restoreImage(filename: string, dataUrl: string): void {
  if (!NAME_RE.test(filename)) throw new Error('图片文件名不正确')
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('图片数据不正确')
  writeFileSync(join(imgDir(), filename), Buffer.from(match[2], 'base64'))
}

/**
 * 从网页地址下载图片（支持"从浏览器把图片拖进软件"）。
 * 在外壳进程里下载，不受网页跨域限制。
 */
export async function fetchImageAsDataUrl(rawUrl: string): Promise<string> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('图片链接不正确')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http/https 的图片链接')
  }

  const res = await net.fetch(url.toString(), { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`图片下载失败（${res.status}）`)
  }
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!type.startsWith('image/')) {
    throw new Error('拖进来的这个链接不是图片')
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 10 * 1024 * 1024) {
    throw new Error('图片太大（超过 10MB），请换一张')
  }
  return `data:${type};base64,${buf.toString('base64')}`
}
