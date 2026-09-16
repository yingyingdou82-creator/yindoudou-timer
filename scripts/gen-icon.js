/**
 * 生成"银豆豆计时"的应用图标（纯代码画图，不依赖任何第三方工具）：
 * 一个白色圆盘上放着三颗红豆豆（和界面里 🫘 的形象一致）。
 * 运行：node scripts/gen-icon.js
 * 输出：assets/icons/bean-16.png、bean-32.png、bean-256.png（256 供打包安装程序用）
 */
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

// ---- PNG 编码（最简实现） ----
function crc32(buf) {
  let c
  let crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 位
  ihdr[9] = 6 // RGBA
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // 每行 filter 类型 0
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- 画图工具 ----
function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

/** 点是否在某颗豆子里（豆子 = 旋转椭圆 凹口圆），返回深度用于描边 */
function inBean(px, py, bean) {
  // 平移 + 反旋转到豆子本地坐标
  const dx = px - bean.x
  const dy = py - bean.y
  const lx = dx * Math.cos(-bean.rot) - dy * Math.sin(-bean.rot)
  const ly = dx * Math.sin(-bean.rot) + dy * Math.cos(-bean.rot)
  const ex = lx / bean.rx
  const ey = ly / bean.ry
  const e = Math.sqrt(ex * ex + ey * ey)
  if (e > 1) return 0
  // 凹口：豆子内侧一个小圆"咬掉"一块
  const nx = (lx - bean.notchX) / bean.notchR
  const ny = (ly - bean.notchY) / bean.notchR
  const nd = Math.sqrt(nx * nx + ny * ny)
  if (nd < 1) return 0
  // 返回 0~1：越靠边越大（用于描边）
  return clamp01((e - 0.8) / 0.2)
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const c = size / 2

  // 白色圆盘（带浅灰描边）
  const plateR = size * 0.48

  // 三颗红豆豆（位置和角度模仿 🫘 的排布）
  const s = size
  const beans = [
    // 左边那颗：斜躺，凹口朝右上
    { x: s * 0.35, y: s * 0.46, rx: s * 0.155, ry: s * 0.1, rot: -0.5, notchX: s * 0.09, notchY: -s * 0.05, notchR: s * 0.055 },
    // 中间偏下那颗：竖躺，凹口朝左上
    { x: s * 0.53, y: s * 0.62, rx: s * 0.1, ry: s * 0.16, rot: 0.35, notchX: -s * 0.05, notchY: -s * 0.09, notchR: s * 0.055 },
    // 右边那颗：斜躺，凹口朝左上
    { x: s * 0.68, y: s * 0.4, rx: s * 0.15, ry: s * 0.095, rot: 0.45, notchX: -s * 0.085, notchY: -s * 0.05, notchR: s * 0.05 }
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const dPlate = Math.sqrt((px - c) ** 2 + (py - c) ** 2)
      const plateCov = clamp01(1 - (dPlate - plateR * 0.95) / (plateR * 0.1))
      if (plateCov <= 0) continue

      // 默认是白盘颜色（靠边缘泛浅灰）
      const edge = clamp01((dPlate / plateR - 0.86) / 0.14)
      let r = 253 - edge * 22
      let g = 254 - edge * 24
      let b = 255 - edge * 26
      let alpha = plateCov

      // 叠豆子
      for (const bean of beans) {
        const depth = inBean(px, py, bean)
        if (depth > 0) {
          // 红棕色：上亮下暗
          const t = (py - (bean.y - bean.ry)) / (bean.ry * 2)
          let br = 197 - t * 52
          let bg = 84 - t * 26
          let bb = 62 - t * 20
          // 描边（靠边变深）
          if (depth > 0) {
            br = br * (1 - depth * 0.45) + 96 * depth * 0.45
            bg = bg * (1 - depth * 0.45) + 34 * depth * 0.45
            bb = bb * (1 - depth * 0.45) + 26 * depth * 0.45
          }
          // 左上小高光
          const hx = (px - (bean.x - bean.rx * 0.3)) / (bean.rx * 0.5)
          const hy = (py - (bean.y - bean.ry * 0.35)) / (bean.ry * 0.55)
          const hd = Math.sqrt(hx * hx + hy * hy)
          if (hd < 1) {
            const hl = (1 - hd) * 0.35
            br = br * (1 - hl) + 236 * hl
            bg = bg * (1 - hl) + 150 * hl
            bb = bb * (1 - hl) + 132 * hl
          }
          r = br
          g = bg
          b = bb
          break // 豆子不重叠，取第一颗即可
        }
      }

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(alpha * 255)
    }
  }
  return rgba
}

const outDir = path.join(__dirname, '..', 'assets', 'icons')
fs.mkdirSync(outDir, { recursive: true })
for (const size of [16, 32, 256]) {
  const png = encodePng(size, size, draw(size))
  const file = path.join(outDir, `bean-${size}.png`)
  fs.writeFileSync(file, png)
  console.log(`已生成 ${file}（${size}x${size}）`)
}
