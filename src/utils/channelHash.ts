/**
 * 通道哈希契约 (前端镜像) — [R6 P1-3 2026-09-12] 自 useAlgoRuleSync 迁出
 *
 * 与后端 LinkageEngine.cpp safeChannelHash 逐位一致 (FNV-1a 32位 & 0x7FFFFFFF):
 *   GB 双流 _ch0 双形态 (完整通道串 / 去 _ch0 基值) 均需同源哈希参与命中,
 *   供告警弹窗匹配 (useAlarmPopup) / 算法页规则计数 (AlgoConfigView) /
 *   通道选择器 (DeviceChannelPicker) / 叠加形状 (useAlarmShapes) 共用。
 *
 * 原 useAlgoRuleSync 的正反向联动 (算法行开关 ↔ 规则启停) 与 localStorage 三键
 * 已随算法页降视图 (P1-3) 整体废除: 调度态唯一入口 = 规则 (reconciler 收敛)。
 */
export function safeChannelHash(idStr: string): number {
  if (!idStr) return 0
  let hash = 2166136261
  for (let i = 0; i < idStr.length; i++) {
    hash ^= idStr.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash & 0x7FFFFFFF
}
