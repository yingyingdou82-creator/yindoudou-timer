import { getElectronApi, isElectron } from './electronApi'
import { createWebApi } from './webApi'

export { isElectron }

/** 统一的数据接口：电脑版走 Electron 传话，手机/网页版走内置数据库 */
export const platformApi: Window['api'] = getElectronApi() ?? createWebApi()
