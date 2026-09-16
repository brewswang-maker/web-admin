/**
 * 告警等级 SSOT 映射 — 全站统一色板（方案 A）
 * [FIX level-color-ssot 2026-09-16] 此前 4 处独立实现互不一致:
 *   - AlarmPopup 暗色系 (#FF3D71/#FF6B35/#FFB800/#00D4AA)
 *   - AlarmsView levelTagType: high 与 medium 同 warning 不分色
 *   - SituationScreen 大屏: low=蓝 #1676D2
 *   - useLinkageOptions: medium=蓝 #409EFF
 *   统一为方案 A (Element Plus 色板, 与 el-tag type 语义对齐):
 *   低=绿 #67C23A · 中=黄 #E6A23C · 高=红 #F56C6C · 严重=深红 #B71C1C · 信息=灰 #909399
 * 消费方: AlarmPopup / AlarmsView / SituationScreen / useLinkageOptions /
 *   LinkageRuleView — 新增等级用色一律引此处, 禁止再散落硬编码。
 */

export type AlarmLevelKey = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** 等级 → 主色 */
export const ALARM_LEVEL_COLORS: Record<AlarmLevelKey, string> = {
  critical: '#B71C1C',
  high: '#F56C6C',
  medium: '#E6A23C',
  low: '#67C23A',
  info: '#909399',
}

/** 等级 → "r, g, b" 字符串 (供 rgba(var(--rgb), alpha) 拼接) */
export const ALARM_LEVEL_RGB: Record<AlarmLevelKey, string> = {
  critical: '183, 28, 28',
  high: '245, 108, 108',
  medium: '230, 162, 60',
  low: '103, 194, 58',
  info: '144, 147, 153',
}

/** 等级 → 中文默认文案 (i18n 页面可用各自 t() 覆盖, 不强制) */
export const ALARM_LEVEL_TEXT: Record<AlarmLevelKey, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
  info: '信息',
}

/**
 * 任意等级输入 → 标准 5 档。兼容: 字符串档位 / 数字 severity 1-5 / 旧词残留。
 * - 'warning' 为旧 3 档压缩表残留 → 归「中」(沿用 SituationScreen level-ssot
 *   2026-09-14 的既有归档决定, 不改变存量展示语义)
 * - 数字与 useLinkageOptions 旧表对齐: 5=严重 4=高 3=中 2=低 1=信息
 */
export function normalizeAlarmLevel(level: unknown): AlarmLevelKey {
  if (typeof level === 'number' || /^\d+$/.test(String(level))) {
    const n = Number(level)
    if (n >= 5) return 'critical'
    if (n === 4) return 'high'
    if (n === 3) return 'medium'
    if (n === 2) return 'low'
    return 'info'
  }
  const s = String(level ?? '').trim().toLowerCase()
  switch (s) {
    case 'critical':
    case '紧急':
      return 'critical'
    case 'high':
    case '高':
      return 'high'
    case 'medium':
    case 'warning':
    case '中':
      return 'medium'
    case 'low':
    case '低':
      return 'low'
    default:
      return 'info'
  }
}

/** 等级 → 主色 (任意输入形态) */
export function alarmLevelColor(level: unknown): string {
  return ALARM_LEVEL_COLORS[normalizeAlarmLevel(level)]
}

/** 等级 → "r, g, b" (任意输入形态) */
export function alarmLevelRgb(level: unknown): string {
  return ALARM_LEVEL_RGB[normalizeAlarmLevel(level)]
}

/** 等级 → 中文文案 (任意输入形态) */
export function alarmLevelText(level: unknown): string {
  return ALARM_LEVEL_TEXT[normalizeAlarmLevel(level)]
}

/**
 * el-tag type: 低=success(绿) / 中=warning(黄) / 高与严重=danger(红) /
 * 信息=info(灰)。严重档以 effect=dark 区分 (见 alarmLevelTagEffect)。
 */
export function alarmLevelTagType(level: unknown): 'success' | 'warning' | 'danger' | 'info' {
  switch (normalizeAlarmLevel(level)) {
    case 'low':
      return 'success'
    case 'medium':
      return 'warning'
    case 'high':
    case 'critical':
      return 'danger'
    default:
      return 'info'
  }
}

/** el-tag effect: 严重档 dark (深红视觉, 对齐色板「严重=深红」), 其余 light */
export function alarmLevelTagEffect(level: unknown): 'light' | 'dark' {
  return normalizeAlarmLevel(level) === 'critical' ? 'dark' : 'light'
}
