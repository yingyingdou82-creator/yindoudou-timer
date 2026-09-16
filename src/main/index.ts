import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerEventIpc } from './ipc'
import { startReminderScheduler } from './reminder'
import { setupTray } from './tray'
import { restoreWidgetIfOpen, screenshotAndQuit } from './widget'

// 可选：用环境变量 YDD_DATA_DIR 指定独立数据目录（演示/测试用，与正式数据完全隔离）
const demoDir = process.env['YDD_DATA_DIR']
if (demoDir) {
  app.setPath('userData', demoDir)
}

// 是否正在退出软件（托盘菜单"退出"时为 true；此时关闭窗口不再拦截）
let quitting = false

// 主窗口的引用（可能被隐藏到托盘，但一直在）
let mainWindow: BrowserWindow | null = null

/** 拿到主窗口（排除桌面小组件窗口） */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** 呼出主窗口；不存在则新建 */
function showOrCreateMainWindow(): void {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createWindow()
  }
}

// 创建主窗口
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '银豆豆计时',
    backgroundColor: '#f2f4f8',
    icon: join(__dirname, '..', '..', 'assets', 'icons', 'bean-32.png'),
    // Windows/Linux：去掉系统标题栏（界面自己画一个更好看的）；Mac：隐藏式标题栏保留红绿灯按钮
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 窗口准备好再显示，避免白屏一闪
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 截图模式：截取主窗口页面后自动退出（生成文档截图用）
    if (process.env['YDD_SHOT_MAIN'] === '1' && process.env['YDD_SHOT_OUT'] && mainWindow) {
      void screenshotAndQuit(mainWindow, process.env['YDD_SHOT_OUT'])
    }
  })

  // 点关闭 = 隐藏到托盘（软件常驻后台，托盘可呼回/退出）
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 把"是否最大化"状态告诉界面（用于切换 还原/最大化 图标）
  const sendMaxState = (): void => {
    mainWindow?.webContents.send('window:maximized', mainWindow?.isMaximized() ?? false)
  }
  mainWindow.on('maximize', sendMaxState)
  mainWindow.on('unmaximize', sendMaxState)

  // 界面里的链接用系统默认浏览器打开，不在软件内开新窗口
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式加载开发服务器，正式版加载打包好的页面
  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerEventIpc(getMainWindow)
  // 到点提醒：每 30 秒检查一次（含最小化在托盘时）；点通知呼出主窗口
  startReminderScheduler(() => getMainWindow())
  createWindow()
  setupTray()
  // 上次开着桌面小组件的话，自动恢复
  restoreWidgetIfOpen()

  // Mac 特有习惯：点图标没有窗口时，重新开一个
  app.on('activate', () => {
    showOrCreateMainWindow()
  })
})

// 真正退出前打个标记：此时窗口的 close 不再被拦截
app.on('before-quit', () => {
  quitting = true
})

// 软件常驻托盘：窗口全关也不自动退出，退出请走托盘菜单
app.on('window-all-closed', () => {
  // 留空：由托盘菜单"退出"控制
})
