import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 手机/网页版的构建配置：把同一套界面打成纯网页（dist-web/），
 * 再由 Capacitor 装进安卓 App。
 * （电脑版 Electron 的构建配置在 electron.vite.config.ts，互不影响）
 */
export default defineConfig({
  root: 'src/renderer',
  // Web download APK is copied after Android build; keep it out of Capacitor assets.
  publicDir: false,
  plugins: [vue()],
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
