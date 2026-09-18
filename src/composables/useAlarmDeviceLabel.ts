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
// [CH-BINDING-DISPLAY 2026-09-14] int32 哈希反投影 (规则 channel_ids 老口径展示反查)
import { safeChannelHash } from '@/utils/channelHash'

/** [chan-tree 2026-09-11] 通道条目 (三级树叶子 + 通道列展示共用)
 *  raw=通道 id 原值 (含 _chN 子码流形态) / base=剥后缀互认键 / name=可读名 (空由显示层占位) */
export interface ChannelBrief { raw: string; base: string; name: string }

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
// [chan-tree 2026-09-11] 设备 id → 其通道列表 (AlarmDeviceTreePanel 三级树叶子数据源)
const devChsById = ref<Map<string, ChannelBrief[]>>(new Map())
/** 目录就绪信号 (异步加载完成; 树面板响应式重建用) */
const dirReady = ref(false)
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
      // [chan-tree 2026-09-11] 设备→通道分组 (同名归并: rawId 与剥后缀 base 同属一组)
      const devChs = new Map<string, ChannelBrief[]>()
      for (const c of channels) {
        const id = String(c?.channel_id ?? c?.id ?? '')
        if (!id) continue
        const nm = String(c?.name ?? '')
        if (nm) { cMap.set(id, nm); cMap.set(baseChannelId(id), nm) }
        const pid = String(c?.device_id ?? c?.deviceId ?? '')
        if (pid) {
          pMap.set(baseChannelId(id), pid)
          const arr = devChs.get(pid) ?? []
          if (!arr.some(x => x.base === baseChannelId(id))) {
            arr.push({ raw: id, base: baseChannelId(id), name: nm })
          }
          devChs.set(pid, arr)
        }
      }
      devNameById.value = dMap
      chNameById.value = cMap
      chDevById.value = pMap
      devChsById.value = devChs
      dirReady.value = true
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

// ── [chan-tree 2026-09-11] 同步读取 API (三级树/列展示共用; 懒加载触发) ──
export function devNameOf(id: unknown): string {
  loadAlarmNameDirectory()
  return devNameById.value.get(baseChannelId(id)) ?? ''
}
export function chNameOf(id: unknown): string {
  loadAlarmNameDirectory()
  return chNameById.value.get(String(id ?? '').trim())
    ?? chNameById.value.get(baseChannelId(id)) ?? ''
}
export function devChannelsOf(id: unknown): ChannelBrief[] {
  loadAlarmNameDirectory()
  return devChsById.value.get(baseChannelId(id)) ?? []
}
/** [CH-BINDING-DISPLAY 2026-09-14] int32 哈希通道反投影 (规则 source_cond.channel_ids 老口径):
 *   channel_ids 存 FNV-1a &0x7FFFFFFF 投影 (与 safeChannelHash / 后端 safeChannelHash 同源),
 *   目录通道 raw/base 双形态逐一试算, 命中即返回 (O(N) N=目录通道数 ≤500)。
 *   供规则列表「绑定通道」列名称反查 — int32 口径不再裸显数字/误判「全部通道」。 */
export function findChannelByHash(hash: number): ChannelBrief | undefined {
  loadAlarmNameDirectory()
  if (!hash) return undefined
  for (const arr of devChsById.value.values()) {
    for (const c of arr) {
      if (safeChannelHash(c.raw) === hash || safeChannelHash(c.base) === hash) return c
    }
  }
  return undefined
}
/** [t3-tree-channel 2026-09-11] 通道 → 父设备码 (目录反查; 通道叶谓词补值用):
 *  告警列表 channelId 归一 = channel_id_str (列表端 = device_id 列值), 多通道设备
 *  的告警以父设备码落库 → 仅 raw+base 的通道叶谓词恒 miss; 补父设备码后命中。 */
export function parentDevOfChannel(id: unknown): string {
  loadAlarmNameDirectory()
  return chDevById.value.get(baseChannelId(id)) ?? ''
}
export function alarmDirReady() {
  loadAlarmNameDirectory()
  return dirReady
}

// ── [FIX ind-floormap-parity 2026-09-18] 告警真通道码统一解析 (原 SituationScreen 局部实现
//   迁入共享): 首页平面地图与定位追踪页室内面板共用, 防两处口径漂移。
//   平面图点位绑定按通道码 (真机实锚 map25: 绑定 …1320002001/002), 顶层 channelId
//   (父设备码) 变体永不命中 → 定位/涟漪/自动切图/标签全链共用此解析。 ──
/** metadata 解包 (治理帧形态数组取首元素 — 与 toAlarm govSrc 解析同口径; 对象原样) */
export function unpackAlarmMeta(alarm: { metadata?: unknown }): Record<string, unknown> {
  const metaRaw = alarm?.metadata
  if (Array.isArray(metaRaw))
    return (metaRaw[0] && typeof metaRaw[0] === 'object' ? metaRaw[0] : {}) as Record<string, unknown>
  return (metaRaw && typeof metaRaw === 'object' ? metaRaw : {}) as Record<string, unknown>
}

/** 告警真通道码解析: metadata[0].channel_id_str (监控点级通道码) 优先, int32 哈希投影
 *  反查三级兜底, 顶层 channelId (父设备码) 末级兜底 */
export function alarmChannelIdOf(alarm: { metadata?: unknown; channelId?: string }): string {
  const meta = unpackAlarmMeta(alarm)
  const s = String(meta.channel_id_str || '').trim()
  if (s) return s
  // [FIX ch-id-str 2026-09-18] int 哈希通道投影反查 (三级兜底): climbing 等插件旧
  //   数据 meta 只带 int32 投影 channel_id (FNV-1a &0x7FFFFFFF, 与 safeChannelHash
  //   同源) — 目录通道 raw/base 双形态逐一试算命中即反解真通道码 (存量未重启
  //   期间产生的历史告警同样受益)。
  const h = Number(meta.channel_id)
  if (Number.isFinite(h) && h > 0) {
    const hit = findChannelByHash(h)
    if (hit?.raw) return hit.raw
  }
  return alarm.channelId || ''
}

// [chan-col 2026-09-11 完成锚点] 设备→通道目录扩展批次 · 部署产物 entry=index-wS8-Hc--kp.js tgz md5=57e4f6f0d728c29eeca8f2a8f6dd629b

// [t3-tree-channel 2026-09-11 完成锚点] 三级树通道级服务端下钻(单值直传+多值 fan-out)批次 · 部署产物 entry=index-CvT0U9Nv4f.js tgz md5=07a2e26224ed93a40c47f987c04b7bb5
