import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { isWidgetVisible, isWidgetWindow, toggleWidget } from './widget'

/**
 * 系统托盘（屏幕右下角小图标）：
 * 软件常驻后台的"家"——关闭窗口只是隐藏，想真正退出走托盘菜单。
 */

function iconFile(): string {
  // 开发模式：项目目录下的 assets；正式安装包：resources 目录（打包时配置）
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', 'bean-32.png')
    : join(__dirname, '..', '..', 'assets', 'icons', 'bean-32.png')
}

function showMainWindow(): void {
  const main = BrowserWindow.getAllWindows().find((w) => !isWidgetWindow(w))
  if (main) {
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
  }
}

export function setupTray(): Tray {
  const tray = new Tray(nativeImage.createFromPath(iconFile()))
  tray.setToolTip('银豆豆计时')

  const applyMenu = (): void => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开主窗口', click: () => showMainWindow() },
        {
          label: '显示桌面小组件',
          type: 'checkbox',
          checked: isWidgetVisible(),
          click: () => {
            toggleWidget()
            applyMenu() // 刷新勾选状态
          }
        },
        { type: 'separator' },
        { label: '退出银豆豆计时', click: () => app.quit() }
      ])
    )
  }

  applyMenu()
  // 点一下托盘图标 = 打开主窗口
  tray.on('click', () => showMainWindow())

  // 小组件显示状态变化时刷新菜单勾选（每秒轻量检查，状态没变就不重建）
  let lastVisible = isWidgetVisible()
  setInterval(() => {
    const v = isWidgetVisible()
    if (v !== lastVisible) {
      lastVisible = v
      applyMenu()
    }
  }, 1000)

  return tray
}
