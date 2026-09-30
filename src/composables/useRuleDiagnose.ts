/**
 * [FEAT rule-diagnose 2026-09-30] 规则失效原因诊断 composable
 *
 * 消费 GET /linkage/rules/{id}/diagnose (后端复用存量检测: RegionStore 内存查表 /
 * getChannelStatuses / SecurityAreaStore::resolveAreaChannelIds, 单规则 5s 内返回)。
 *
 * 设计取舍:
 * - 模块级缓存 + 5min TTL: 规则列表几十行各挂一个徽章, tab 反复切换不重复打后端;
 *   启停规则后调用 invalidate() 立即失效。
 * - 零判空归一: 后端 404/字段缺失/网络异常一律归一为 null → 组件展示占位文案
 *   「原因待诊断, 请点击进入编辑器查看」, 绝不因响应残缺抛错阻塞列表渲染。
 * - 展示口径: 仅 severity ∈ {critical, warning} 视为「已开启但不工作」(红色感叹号);
 *   纯 info (如过滤型 REGION_UNCONSTRAINED 全画面放行) 不算失效, 不渲染徽章。
 */
import { ref } from 'vue'
import { linkageApi, type RuleDiagnosis } from '@/api/linkage'

export interface RuleDiagnoseView {
  healthy: boolean
  /** 仅保留 critical/warning 级 (真正的「不工作」); info 级在 tooltip 详情区仍可见 */
  blocking: RuleDiagnosis[]
  /** 全量诊断 (含 info), 供 tooltip 展示完整原因 */
  all: RuleDiagnosis[]
}

interface CacheEntry {
  at: number
  data: RuleDiagnoseView | null
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

/** 归一单条诊断 (字段缺失兜底, 零判空) */
function normalizeDiag(raw: unknown): RuleDiagnosis {
  const d = (raw ?? {}) as Partial<RuleDiagnosis>
  return {
    code: typeof d.code === 'string' ? d.code : 'UNKNOWN',
    severity: typeof d.severity === 'string' ? d.severity : 'warning',
    message: typeof d.message === 'string' && d.message ? d.message : '原因待诊断, 请点击进入编辑器查看',
    fix_hint: typeof d.fix_hint === 'string' ? d.fix_hint : '',
    affected_channels: Array.isArray(d.affected_channels)
      ? d.affected_channels.filter((c): c is string => typeof c === 'string')
      : []
  }
}

/** 拉取并归一单规则诊断; 任何异常 → null (占位文案兜底) */
export async function fetchRuleDiagnose(ruleId: string): Promise<RuleDiagnoseView | null> {
  if (!ruleId) return null
  const hit = cache.get(ruleId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  try {
    const resp = await linkageApi.getRuleDiagnose(ruleId)
    const body = (resp as { data?: { data?: unknown } })?.data?.data as
      | { healthy?: boolean; diagnoses?: unknown[] }
      | undefined
    const all = Array.isArray(body?.diagnoses) ? body!.diagnoses.map(normalizeDiag) : []
    const view: RuleDiagnoseView = {
      // healthy 字段缺失时按「存在 critical 即不健康」自判 (零判空归一)
      healthy: typeof body?.healthy === 'boolean'
        ? body!.healthy
        : !all.some(d => d.severity === 'critical'),
      blocking: all.filter(d => d.severity === 'critical' || d.severity === 'warning'),
      all
    }
    cache.set(ruleId, { at: Date.now(), data: view })
    return view
  } catch {
    // 404 (旧固件无此端点) / 网络异常: 缓存 null 短期不重试, 列表渲染不受影响
    cache.set(ruleId, { at: Date.now(), data: null })
    return null
  }
}

/** 规则启停/编辑保存后调用: 立即丢弃缓存, 下次徽章挂载重新诊断 */
export function invalidateRuleDiagnose(ruleId?: string) {
  if (ruleId) cache.delete(ruleId)
  else cache.clear()
}

/** 诊断码 → 中文短标签 (tooltip 标题行; 未收录码回退裸 code, 与事件类型 SSOT 展示口径一致) */
export const RULE_DIAGNOSE_CODE_ZH: Record<string, string> = {
  RULE_DISABLED: '规则未启用',
  SPATIAL_AREA_EMPTY: '安保区域已删除/无成员',
  CHANNEL_MISSING: '绑定通道不存在',
  CHANNEL_NOT_RUNNING: '通道未运行',
  CHANNEL_FROZEN: '通道画面冻结',
  REGION_MISSING: '布防区域缺失',
  REGION_UNCONSTRAINED: '区域约束未生效',
  RULE_ROI_UNDRAWN: '规则 ROI 未绘制',
  SCHEDULER_UNAVAILABLE: '推理调度器不可用'
}

export function diagnoseCodeZh(code: string): string {
  return RULE_DIAGNOSE_CODE_ZH[code] || code
}

/** 列表页批量预热 (可选优化: 挂载后逐条后台拉, 徽章渲染时缓存已热) */
export function useRuleDiagnose() {
  const loading = ref(false)
  return { loading, fetchRuleDiagnose, invalidateRuleDiagnose, diagnoseCodeZh }
}
