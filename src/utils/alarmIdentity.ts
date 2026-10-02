/**
 * [FIX p1-alarm-identity 2026-10-02] 缺陷清单 12-1：告警「形状身份」口径单一出处。
 *
 * 病灶（修复前实锚，共 6 个各自为政的推导点）：
 *   - AlarmPopup.popupAlgoId / popupOverlayChannelId / previewChannelId（弹窗侧，含 alarm.type 兜底）
 *   - SnapshotAnnotated.effAlgoId（只兜 metadata.algo_id，无 type 兜底）
 *   - AlarmsView / AlarmEventsPanel 的 openSnapshotPreview（列表预览侧，**完全不传 algoId**）
 * 同一告警在不同界面取到不同的 (channelId, algoId) → ① 规则链命中不同规则 →
 * 「弹窗有形状、预览无形状」甚至「预览串画别规则的几何」（algoId 空时
 * useAlarmShapes 的 algoHit 因 `!algoId` 恒真，会命中该通道任意启用规则）。
 *
 * 设计取向：
 *   1) **不新造通道口径** —— 平台早有真通道码 SSOT `alarmChannelIdOf`
 *      （metadata.channel_id_str → int32 哈希投影反查 → 顶层 channelId，
 *      告警列表/态势屏/弹窗设备名均在用），形状链此前未接入它才是 12-1 实质。
 *   2) **保留 PREV-CHFIX 语义** —— GB 告警顶层 channelId 可能被后端归并为父设备码
 *      (NVR)，此时快照/回放 URL 内嵌的 gb_<裸码> 是唯一真通道线索，须能救回。
 *   3) 纯函数、无副作用、无 DOM/网络依赖 —— 便于单测直接断言「三处口径一致」。
 */
import { alarmChannelIdOf, unpackAlarmMeta } from '@/composables/useAlarmDeviceLabel'

/** 兼容 normalize 后的 AlarmEvent 与 API 裸 row 两种形态（12-1 的成因之一即形态不一） */
export interface LooseAlarmRecord {
  metadata?: unknown
  channelId?: string
  channel_id?: string
  deviceId?: string
  device_id?: string
  algoId?: string
  algo_id?: string
  type?: string
  eventType?: string
  event_type?: string
  snapshotUrl?: string
  snapshot_img?: string
  videoClipUrl?: string
  record_video?: string
}

/**
 * 快照/回放 URL 内嵌的真实流通道（PREV-CHFIX 口径的并集）：
 * 覆盖既有三种正则形态 —— /record/[record/]rtp/<ch>/、/snapshots/rtp/<ch>/；
 * 去 gb_ 前缀与 _chN 尾缀还原裸通道码。
 * 人脸取证图 /snapshots/evidence/ev_*.jpg 一类不含通道码的 URL 返回空串（不猜）。
 */
export function channelFromAlarmUrls(...urls: unknown[]): string {
  for (const raw of urls) {
    const s = String(raw ?? '')
    if (!s) continue
    const hit = s.match(/\/record\/(?:record\/)?rtp\/([^/]+)\//)?.[1]
      ?? s.match(/\/snapshots\/rtp\/([^/]+)\//)?.[1]
    if (hit) return hit.replace(/^gb_/, '').replace(/_ch\d+$/i, '')
  }
  return ''
}

/**
 * 告警真通道码（形状叠加 / 预览 / 回放共用）。
 * 优先级：显式覆盖（弹窗手工切通道）> metadata 真码或哈希反解 > URL 反解（父码归并场景）
 * > 顶层 channelId/channel_id > deviceId。
 * 注意第 2、3 级的次序判定：`alarmChannelIdOf` 末级兜底即顶层 channelId，
 * 故用「结果 ≠ 顶层码」识别它是否来自更强证据；等于顶层码时先试 URL 反解，
 * 以免 GB 归并形态下按 NVR 父码查规则链必 miss（PREV-CHFIX 原意）。
 */
export function resolveAlarmChannelId(
  alarm: LooseAlarmRecord | null | undefined,
  opts?: { override?: string; snapshotUrl?: string },
): string {
  const override = String(opts?.override ?? '')
  if (override) return override
  if (!alarm) return ''
  const top = String(alarm.channelId ?? alarm.channel_id ?? '')
  const viaSsot = alarmChannelIdOf({ metadata: alarm.metadata, channelId: top })
  if (viaSsot && viaSsot !== top) return viaSsot
  const viaUrl = channelFromAlarmUrls(
    opts?.snapshotUrl, alarm.snapshotUrl, alarm.snapshot_img,
    alarm.videoClipUrl, alarm.record_video,
  )
  if (viaUrl) return viaUrl
  return viaSsot || top || String(alarm.deviceId ?? alarm.device_id ?? '')
}

/**
 * 告警触发算法 id（形状叠加的区域库/规则链匹配用）。
 * 优先级：metadata.algo_id|algoId|algorithm_id（unpackAlarmMeta 已处理
 * metadata 为数组 [{...}] 的插件直报形态）> 顶层 algoId/algo_id
 * > type|eventType|event_type（与弹窗 popupAlgoId 的 `?? alarm.type` 同款兜底；
 * 尾名口径差异由 useAlarmShapes.algoMatch 的 ALGO_TAIL_CANONICAL 负责翻译）。
 * 返回空串表示「确实无从判定」——调用方据此走歧义保护，不得当作通配放行。
 */
export function resolveAlarmAlgoId(alarm: LooseAlarmRecord | null | undefined): string {
  if (!alarm) return ''
  const meta = unpackAlarmMeta(alarm)
  const fromMeta = meta.algo_id ?? meta.algoId ?? meta.algorithm_id
  const s1 = String(fromMeta ?? '')
  if (s1 && s1 !== 'undefined') return s1
  const s2 = String(alarm.algoId ?? alarm.algo_id ?? '')
  if (s2 && s2 !== 'undefined') return s2
  return String(alarm.type ?? alarm.eventType ?? alarm.event_type ?? '')
}

/** 一次解包同时得到通道与算法口径（调用方勿再各自正则） */
export function resolveAlarmIdentity(
  alarm: LooseAlarmRecord | null | undefined,
  opts?: { override?: string; snapshotUrl?: string },
): { channelId: string; algoId: string } {
  return {
    channelId: resolveAlarmChannelId(alarm, opts),
    algoId: resolveAlarmAlgoId(alarm),
  }
}
