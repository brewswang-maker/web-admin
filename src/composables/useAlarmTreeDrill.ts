/**
 * composables/useAlarmTreeDrill.ts — [t3-tree-channel 2026-09-11] 三级树服务端下钻
 *
 * 背景 (真机实测根因):
 *   AlarmDeviceTreePanel 勾选此前仅走页面前端过滤 —
 *   · AlarmsView 服务端分页 (total 11369 / 页 20) → 树筛选只作用当前页 → 勾选恒空;
 *   · 场景页拉取被后端 clamp (请求 pageSize=500 实得 100) → 窗口外通道告警不可见。
 *   → "勾通道 → 列表收敛至该通道告警" 不成立。
 *
 * 方案 (零后端改动): 复用 /api/v1/alarms 既有 channel_id 参数 —
 *   后端 channelFilterCond 对 ≥15 位数字码做 hash/device_id 归一精确匹配
 *   (真机实测: 通道码 2001→42 条 / 2002→68 条 区分精确, 设备码→108 条)。
 *   · 单值: 调用方直接把 channel_id=值 拼进请求 (服务端过滤, 分页/筛选全保留);
 *   · 多值: 后端参数为单值 (重复参数取最后一个 / 半角逗号无效 — 实测) →
 *     fan-out 并行 N 路 (每路 channel_id=一个值), 合并按 id 去重, createdAt 降序。
 *
 * 值集来源: 面板 emit 的 AlarmTreeSelection.drillValues
 *   (精确语义: 通道原始码/设备码; channelIds 是宽谓词集, 勿用于下钻)。
 */
const DRILL_FANOUT_LIMIT = 16   // 路数上限 (防极端跨区域多点选择爆请求; 超限截断)
const DRILL_CONCURRENCY = 4     // 并发池 (后端 SQLite 单写锁, 过高并发挤队列)

/**
 * 多值 fan-out 拉取合并: 对每个下钻值并行调 fetchOne (缺省每路第一页),
 * 合并按 id 去重, createdAt 降序返回。单路失败静默跳过 (best-effort)。
 */
export async function fetchAlarmDrillFanout<T extends { id?: string; createdAt?: string }>(
  values: string[],
  fetchOne: (value: string) => Promise<T[]>,
  limit = DRILL_FANOUT_LIMIT,
): Promise<T[]> {
  const list = Array.from(new Set(values.filter(Boolean))).slice(0, limit)
  if (!list.length) return []
  const out = new Map<string, T>()
  let cursor = 0
  const worker = async () => {
    while (cursor < list.length) {
      const v = list[cursor++]
      const rows = await fetchOne(v).catch(() => [])
      for (const a of rows) {
        const key = a.id ? String(a.id) : 'noid_' + out.size
        out.set(key, a)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DRILL_CONCURRENCY, list.length) }, () => worker())
  )
  return Array.from(out.values()).sort((a, b) =>
    (new Date(b.createdAt ?? 0).getTime() || 0) - (new Date(a.createdAt ?? 0).getTime() || 0))
}
