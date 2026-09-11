// [FIX dev-name-num 2026-09-11] 报警弹窗「设备名称」裸显数字治理 (共享反查目录)
//
//   现象 (真机实测 300 条采样 3 条): face_pass_staff 等 specialized 插件路径的
//   channel_id 在落库时被截断为 int32 hash (e.g. "1225162990"), 后端
//   findChannelNameById 对此形态反查不中 → channel_name/device_name 双空 →
//   前端 normalizeAlarmCore 兜底链全空 → AlarmPopup「设备名称」兜底 deviceId
//   裸显数字串。2026-09-10 后端 WS/REST enrich 只覆盖新告警, 历史库与反查
//   失败形态仍会漏。
//
//   修复: 通道 + 设备目录 (channelApi/deviceApi, 懒加载单例) 反查富化 —
//   ① 名称已是可读文本 → 原样返回; ② 空名/纯数字形态 → 按 deviceId/channelId
//   反查设备名/通道名 (剥 _chN 双形态互认); ③ 反查不中 → 返回 '' 由显示层
//   兜底 '-' (宁显占位不裸显编号; 「设备编号」行显示国标码是合理语义, 不动)。
import { ref } from 'vue'
import { channelApi } from '@/api/channel'
import { deviceApi } from '@/api/device'

/** 纯数字 ID 形态 (GB28181 20 位 / int32 截断 hash / _chN 子码流后缀 / 「通道+数字」兜底产物 —
 *  二次 normalize 时 channelName 兜底会经 raw.channelName 回流进 deviceName, 同口径拦截;
 *  自定义名如「通道01」仅 2 位数字不受影响) */
export const isNumericId = (v: unknown): boolean =>
  /^(?:通道)?\d{6,}(_ch\d+)?$/.test(String(v ?? '').trim())
/** 剥子码流后缀 (_chN) — 国标 20 位主形态与子码流形态互认 */
export const baseChannelId = (v: unknown): string =>
  String(v ?? '').replace(/_ch\d+$/, '')

// ── 目录单例 (懒加载一次; 失败静默 — 显示层保持原兜底不阻塞) ──
const devNameById = ref<Map<string, string>>(new Map())   // 设备 id → 设备名
const chNameById = ref<Map<string, string>>(new Map())    // 通道 id → 通道名 (原值 + 剥 _chN 双形态)
const chDevById = ref<Map<string, string>>(new Map())     // 通道父码 → 父设备 id
let dirStarted = false

export function loadAlarmNameDirectory(): void {
  if (dirStarted) return
  dirStarted = true
  ;(async () => {
    try {
      const [chRes, devRes] = await Promise.all([
        channelApi.getList({ page: 1, pageSize: 500 }),
        deviceApi.getList().catch(() => null),
      ])
      // 字段形态与 useLinkageOptions.fetchChannelOptions 同源 (GET /api/v1/channels
      // → data.channels, channel_id 为 GB28181 国标码; 设备表多形态容器兼容)
      const chRaw = (chRes as any)?.data
      const channels: any[] = chRaw?.data?.channels ?? chRaw?.data?.items ?? chRaw?.data ?? chRaw?.items ?? []
      const devRaw = (devRes as any)?.data ?? null
      const devices: any[] = devRaw?.data?.devices ?? devRaw?.data ?? devRaw?.devices ?? devRaw?.items ?? []
      const dMap = new Map<string, string>()
      for (const d of devices) {
        const id = String(d?.id ?? '')
        if (id && d?.name) dMap.set(id, String(d.name))
      }
      const cMap = new Map<string, string>()
      const pMap = new Map<string, string>()
      for (const c of channels) {
        const id = String(c?.channel_id ?? c?.id ?? '')
        if (!id) continue
        const nm = String(c?.name ?? '')
        if (nm) { cMap.set(id, nm); cMap.set(baseChannelId(id), nm) }
        const pid = String(c?.device_id ?? c?.deviceId ?? '')
        if (pid) pMap.set(baseChannelId(id), pid)
      }
      devNameById.value = dMap
      chNameById.value = cMap
      chDevById.value = pMap
    } catch { /* 目录服务不可用 → 反查恒空, 显示层走 '-' 兜底 */ }
  })()
}

/**
 * 报警「设备名称」解析 (同步, 目录 reactive — 异步加载完成后调用方 computed 自动重算):
 *   ① deviceName 已是可读文本 → 原样;
 *   ② 空名/纯数字 → deviceId(剥 _chN) → 设备名; channelId → 通道名 → 父设备名;
 *   ③ 全不中 → '' (显示层兜底 '-' / location, 不裸显编号)
 */
export function resolveAlarmDeviceName(
  deviceName: unknown, deviceId: unknown, channelId: unknown,
): string {
  loadAlarmNameDirectory()
  const dn = String(deviceName ?? '').trim()
  if (dn && !isNumericId(dn)) return dn
  const dv = baseChannelId(deviceId)
  const cv = String(channelId ?? '').trim()
  if (dv) {
    const hit = devNameById.value.get(dv)
    if (hit) return hit
  }
  if (cv) {
    const chHit = chNameById.value.get(cv) ?? chNameById.value.get(baseChannelId(cv))
    if (chHit) return chHit
    const pid = chDevById.value.get(baseChannelId(cv))
    const devHit = pid ? devNameById.value.get(pid) : undefined
    if (devHit) return devHit
  }
  return ''
}
