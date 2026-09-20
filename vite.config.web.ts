import { resolve } from 'path'
import { existsSync, createReadStream } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 手机/网页版的构建配置：把同一套界面打成纯网页（dist-web/），
 * 再由 Capacitor 装进安卓 App。
 * （电脑版 Electron 的构建配置在 electron.vite.config.ts，互不影响）
 */
export default defineConfig({
  root: 'src/renderer',
  // 开发模式下用插件响应 /app.apk，不设 publicDir 避免 APK 被打进安卓包
  plugins: [
    vue(),
    {
      name: 'serve-apk-download',
      configureServer(server) {
        server.middlewares.use('/app.apk', (_req, res) => {
          const apkPath = resolve('src/renderer/public/app.apk')
          if (existsSync(apkPath)) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive')
            res.setHeader('Content-Disposition', 'attachment; filename="yindoudou-timer.apk"')
            createReadStream(apkPath).pipe(res)
          } else {
            res.statusCode = 404
            res.end('APK not found. Run Android build first, then copy to src/renderer/public/app.apk')
          }
        })
      }
    }
  ],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
