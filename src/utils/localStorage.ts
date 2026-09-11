/** 告警快照叠加层显示偏好。默认开启以保持现网行为；写入失败时静默回退。 */
export const ALARM_SNAPSHOT_OVERLAY_KEY = 'alarm-snapshot-overlay'

export function getAlarmSnapshotOverlay(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(ALARM_SNAPSHOT_OVERLAY_KEY)
    if (raw === null || raw === '') return true
    return raw !== 'false' && raw !== '0'
  } catch {
    // 隐私模式或存储不可用时不影响当前页面。
    return true
  }
}

export function setAlarmSnapshotOverlay(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ALARM_SNAPSHOT_OVERLAY_KEY, String(enabled))
  } catch {
    // 偏好是非关键 UI 状态，存储失败不应阻断告警展示。
  }
}
