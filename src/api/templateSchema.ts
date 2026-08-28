/**
 * [FIX P3-1] 规则模板导入导出 Schema 版本兼容校验
 * 独立模块, 供 linkage.ts (导出) 与 LinkageRuleView.vue (导入) 复用
 */
import type { RuleTemplate } from './linkage'

/** 当前规则模板导出格式版本 (major.minor)。
 *  - major 变更 = 不兼容 (导入时拒绝)
 *  - minor 变更 = 向后兼容 (导入时警告但放行, 未知字段忽略)
 *  [P2-1] v1.1: 新增 close_condition / response_deadline_s 治理字段 (可选, 旧文件缺省导入宽容) */
export const TEMPLATE_SCHEMA_VERSION = '1.1'

/** 导入校验结果 */
export interface TemplateImportValidation {
  ok: boolean
  version: string
  templates: RuleTemplate[]
  warnings: string[]
  errors: string[]
}

/** 解析 "major.minor" 版本号, 非法时返回 null */
function parseSemver(v: string): { major: number; minor: number } | null {
  const m = /^(\d+)\.(\d+)$/.exec(String(v).trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]) }
}

/**
 * [FIX P3-1] 校验导入的规则模板文件内容与当前 Schema 的兼容性。
 * 兼容策略:
 *  - 无版本号的旧文件 → 视为 v1.0 (legacy), 警告后放行
 *  - major 高于当前 → 拒绝 (结构不兼容)
 *  - minor 高于当前 (同 major) → 警告后放行 (新增字段忽略)
 *  - 逐个模板校验必填字段 (name / actions), 剔除非法项并记录
 */
export function validateTemplateImport(data: unknown): TemplateImportValidation {
  const result: TemplateImportValidation = {
    ok: false, version: TEMPLATE_SCHEMA_VERSION, templates: [], warnings: [], errors: [],
  }
  if (data === null || typeof data !== 'object') {
    result.errors.push('文件内容不是有效的 JSON 对象')
    return result
  }
  const obj = data as Record<string, unknown>
  // 支持两种结构: { templates: [...] } 包装 或 裸数组
  const rawTemplates = Array.isArray(obj) ? obj : (Array.isArray(obj.templates) ? obj.templates : null)
  if (rawTemplates === null) {
    result.errors.push('未找到 templates 数组, 文件结构不符合规则模板导出格式')
    return result
  }
  // ── 版本兼容性检查 ──
  const fileVersion = String(obj.schema_version ?? obj.version ?? '')
  const current = parseSemver(TEMPLATE_SCHEMA_VERSION)!
  if (!fileVersion) {
    result.warnings.push('文件缺少版本号 (schema_version), 已按旧版 v1.0 格式处理')
  } else {
    const file = parseSemver(fileVersion)
    result.version = fileVersion
    if (!file) {
      result.warnings.push('无法识别的版本号 "' + fileVersion + '", 已尝试按当前格式导入')
    } else if (file.major > current.major) {
      result.errors.push('文件版本 v' + fileVersion + ' 高于当前支持的 v' + TEMPLATE_SCHEMA_VERSION + ' (major 不兼容), 请升级系统后再导入')
      return result
    } else if (file.major < current.major) {
      result.warnings.push('文件版本 v' + fileVersion + ' 较旧, 部分新字段可能缺失, 将使用默认值')
    } else if (file.minor > current.minor) {
      result.warnings.push('文件版本 v' + fileVersion + ' 的 minor 高于当前 v' + TEMPLATE_SCHEMA_VERSION + ', 新增字段将被忽略')
    }
  }
  // ── 逐个模板必填字段校验 ──
  rawTemplates.forEach((t, i) => {
    const tpl = t as Record<string, unknown>
    if (tpl === null || typeof tpl !== 'object') {
      result.warnings.push('第 ' + (i + 1) + ' 项不是对象, 已跳过')
      return
    }
    if (typeof tpl.name !== 'string' || tpl.name.trim() === '') {
      result.warnings.push('第 ' + (i + 1) + ' 项缺少有效 name, 已跳过')
      return
    }
    if (tpl.actions !== undefined && !Array.isArray(tpl.actions)) {
      result.warnings.push('模板 "' + tpl.name + '" 的 actions 不是数组, 已置空')
      tpl.actions = []
    }
    result.templates.push(tpl as unknown as RuleTemplate)
  })
  if (result.templates.length === 0) {
    result.errors.push('校验后没有可导入的有效模板')
    return result
  }
  result.ok = true
  return result
}
