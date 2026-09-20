import { ref } from 'vue'
import type { AttendanceRecord, AttendanceRecordDraft } from '@shared/types'
import { platformApi } from '../platform'

// 与事件列表一样，出勤记录在全界面共用一份响应式状态。
const attendanceRecords = ref<AttendanceRecord[]>([])

export function useAttendance() {
  async function loadAttendance(): Promise<void> {
    attendanceRecords.value = await platformApi.attendance.list()
  }

  async function saveAttendance(draft: AttendanceRecordDraft): Promise<void> {
    const item = await platformApi.attendance.upsert(draft)
    const index = attendanceRecords.value.findIndex((record) => record.date === item.date)
    if (index >= 0) {
      attendanceRecords.value = attendanceRecords.value.map((record) =>
        record.date === item.date ? item : record
      )
    } else {
      attendanceRecords.value = [...attendanceRecords.value, item].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    }
  }

  async function removeAttendance(date: string): Promise<void> {
    await platformApi.attendance.remove(date)
    attendanceRecords.value = attendanceRecords.value.filter((record) => record.date !== date)
  }

  return { attendanceRecords, loadAttendance, saveAttendance, removeAttendance }
}
