/**
 * 图片处理：把用户选的图片自动压缩成适合做卡片背景的尺寸。
 * 目的：原图动辄好几 MB（手机照片），压到最长边 900 像素、JPEG 质量 85%，
 * 一般只剩几十 KB，软件存取都快，卡片的显示效果也完全够用。
 */

const MAX_SIDE = 900
const QUALITY = 0.85

export async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法处理图片')

    // 先铺白底，避免透明 PNG 压成 JPEG 时透明区域变黑
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)

    return canvas.toDataURL('image/jpeg', QUALITY)
  } finally {
    bitmap.close()
  }
}
