// [REFACTOR format-time 2026-10-05] 固定本地时间格式为展示层 SSOT，避免各场景页分叉。
export function formatLocalDateTime(value?: string | number): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// [REFACTOR short-time 2026-10-05] 场景告警点位与表格共用同一段“月-日 时:分”展示逻辑。
export function formatShortDateTime(value?: string | number): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
