// 计数方式：自然日 / 工作日 / 按周 / 按年
export type CountType = 'natural' | 'workday' | 'week' | 'year'

/** 工作日的来源：系统日历，或用户自己实际打卡的上班日 */
export type WorkdayMode = 'calendar' | 'attendance'

/** 手动出勤日历的当天状态 */
export type AttendanceStatus = 'worked' | 'leave' | 'rest'

/** 一天的实际出勤记录。未记录表示不纳入“实际打卡”统计。 */
export interface AttendanceRecord {
  date: string
  status: AttendanceStatus
  note: string
  updatedAt: number
}

export type AttendanceRecordDraft = Omit<AttendanceRecord, 'updatedAt'>

// 一条倒计时/正计时事件
export interface EventItem {
  id: string
  /** 事件名称，如「距离春节」 */
  name: string
  /**
   * 日期 YYYY-MM-DD。计时方向自动判断：
   * 日期在未来 = 倒计时；日期在过去 = 正计时；今天 = 就是今天
   */
  date: string
  /** 具体时间 HH:mm（可选，比赛、报名等准时开始的事情用；空字符串=不填） */
  time: string
  /** 截止日期 YYYY-MM-DD（可选；填了就是"时间段"事件，如比赛/报名期；空字符串=单日事件） */
  endDate: string
  /** 提前多少分钟提醒（0=不提醒；需要设置了 time 才生效） */
  remindMinutes: number
  countType: CountType
  /** 工作日模式下是否叠加法定节假日（节假日数据待接入，暂时预留） */
  workdayHoliday: boolean
  /** 工作日按系统日历计算，还是只统计用户手动标为“上班”的实际出勤日 */
  workdayMode: WorkdayMode
  /** 是否包含起始日（起算的第一天算进计时，整体多算 1 天） */
  includeStartDay: boolean
  /** 颜色标签（对应界面颜色盘的 key） */
  color: string
  /** 小图标（emoji） */
  icon: string
  /** 背景图片的文件名（存在用户数据目录的 images 文件夹里；空字符串=没有图片） */
  image: string
  /** 备注 */
  note: string
  /** 是否置顶 */
  pinned: boolean
  /** 是否已归档（归档后不在主界面显示，可在"归档"里找回） */
  archived: boolean
  /** 是否显示在桌面小组件上 */
  onDesktop: boolean
  /** 创建时间戳（毫秒） */
  createdAt: number
}

// 新建/修改事件时提交的数据（不含 id 和创建时间，由外壳负责生成）
export type EventDraft = Omit<EventItem, 'id' | 'createdAt'>

// 兼容旧数据文件：早期版本保存过的 mode 字段已废弃（改为按日期自动判断）
