import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 主进程：软件的"外壳"部分（管窗口、托盘、文件存储）
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  // 预加载层：外壳和界面之间的"传话员"
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  // 渲染进程：您看到的界面部分（主窗口 + 桌面小组件两个页面）
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          widget: resolve('src/renderer/widget.html')
        }
      }
    },
    plugins: [vue()]
  }
})
