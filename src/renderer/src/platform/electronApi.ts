/**
 * 平台判断与统一入口：
 * - 电脑版（Electron）：直接用 preload 提供的 window.api
 * - 手机/网页版：用 IndexedDB 实现的"网页数据引擎"，接口一模一样
 * 界面代码只认 platformApi，不关心自己跑在哪。
 */

type AppApi = Window['api']

export function getElectronApi(): AppApi | null {
  const w = window as unknown as { api?: AppApi }
  return w.api ?? null
}

export const isElectron: boolean = getElectronApi() !== null
