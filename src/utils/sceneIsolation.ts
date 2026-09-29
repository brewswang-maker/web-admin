/**
 * utils/sceneIsolation.ts — 多场景隔离前端工具
 *
 * [SCENE-ISOLATION 2026-09-29] 与后端改造 (UserStore sceneTags / RestApiHandlers
 * requesterSceneTags / DrogonWsAdapter 连接场景过滤) 配套的前端纵深防御层。
 * 服务端是硬闸 (查询注入/WS 广播过滤/编辑 403), 此处负责:
 *   1. scenario_* 角色 → 场景 tag 映射 (与后端 UserStore::sceneTagsFromRoles
 *      及路由守卫 SCENARIO_SECTION_ROLES 三方同源; 旧会话 localStorage 无
 *      sceneTags 字段时兜底推导)
 *   2. 本场景事件键集动态拉取 (SSOT 复用 /event-types/metadata?scene= —
 *      后端 EventTypeAliases scene_tags 变更自动跟随, 零静态维护)
 */
import { http } from '@/api/http'

/** scenario_* 角色 → EventTypeAliases 场景 tag (单点映射, 与后端同源) */
const SCENE_ROLE_TO_TAG: Record<string, string> = {
  scenario_perimeter: 'video_perimeter',
  scenario_screening: 'security_screening',
  scenario_school: 'school_campus',
  scenario_gas_station: 'gas_station',
  scenario_large_event: 'large_event',
  scenario_hotel: 'hotel_unattended',
}

/** 从角色列表推导场景 tags (UserInfo.sceneTags 为空时的兜底, 存量会话兼容) */
export function sceneTagsFromRoles(roles: string[] | undefined | null): string[] {
  if (!roles?.length) return []
  const tags: string[] = []
  for (const r of roles) {
    const t = SCENE_ROLE_TO_TAG[r]
    if (t && !tags.includes(t)) tags.push(t)
  }
  return tags
}

/** 逗号串联 (REST ?scene= 参数形态) */
export function sceneParam(tags: string[]): string {
  return tags.join(',')
}

// ── 本场景事件键集 (WS 帧/弹窗纵深过滤用; 模块级缓存) ──

let sceneEventSet: Set<string> | null = null
let sceneEventSetFor: string[] = []   // 缓存对应的场景集 (场景变了重拉)
let sceneEventSetLoading: Promise<Set<string>> | null = null

/**
 * 确保本场景事件键集就绪 (fire-and-forget 友好):
 * GET /event-types/metadata?scene=a,b → 集合 (alarm_type 并集)。
 * 拉取失败返回空集 = 放行 (纵深层失效不阻断主链, 服务端硬闸仍在)。
 */
export async function ensureSceneEventSet(sceneTags: string[]): Promise<Set<string>> {
  if (!sceneTags.length) return new Set()
  const same = sceneEventSet &&
    sceneTags.length === sceneEventSetFor.length &&
    sceneTags.every((t, i) => t === sceneEventSetFor[i])
  if (same && sceneEventSet) return sceneEventSet
  if (sceneEventSetLoading) return sceneEventSetLoading
  sceneEventSetLoading = (async () => {
    try {
      const res: any = await http.get('/event-types/metadata', {
        params: { scene: sceneParam(sceneTags) },
      })
      const d = res?.data?.data ?? res?.data ?? {}
      const set = new Set<string>()
      const groups = d?.groups ?? {}
      for (const g of Object.values<any>(groups)) {
        for (const it of (g?.items ?? [])) {
          const k = String(it?.alarm_type ?? '')
          if (k) set.add(k)
        }
      }
      sceneEventSet = set
      sceneEventSetFor = [...sceneTags]
      return set
    } catch {
      return new Set<string>()   // 失败放行 (纵深层不阻断)
    } finally {
      sceneEventSetLoading = null
    }
  })()
  return sceneEventSetLoading
}

/** 告警事件是否属于给定场景集 (tags 空 = 全量放行; 事件集未就绪 = 放行) */
export function alarmInScenes(alarmType: string, sceneTags: string[], eventSet: Set<string> | null): boolean {
  if (!sceneTags.length) return true
  if (!eventSet || eventSet.size === 0) return true   // 未就绪/拉取失败放行
  return eventSet.has(alarmType)
}
