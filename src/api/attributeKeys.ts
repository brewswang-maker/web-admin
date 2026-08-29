/**
 * attributeKeys.ts — 属性键契约 (P4-B SSOT 的前端移植)  [P4-D 2026-08-29]
 *
 * SSOT 源码: box-sdk/include/service/alarm/AttributeKeyRegistry.h (header-only)
 * 守护测试:  box-sdk/tests/test_attribute_key_contract.cpp (C++ 侧)
 * 人读文档:  docs/attribute-key-contract.md
 *
 * 本文件用于 ConditionTreeEditor 属性条件编辑的 key 白名单与控件分型。
 * 与 C++ 注册表人工同步; PAR 26 label 双表一致性由 C++ 契约测试守护,
 * 前端若漂移会在规则校验/评估层暴露 (未注册 key 后端不阻断但无效)。
 */

/** 键值语义分类 (AttributeKeyRegistry.h AttributeKeyKind) */
export type AttributeKeyKind = 'score' | 'id' | 'conf' | 'state'

export interface AttributeKeyDef {
  key: string
  kind: AttributeKeyKind
  /** 来源分组 (用作下拉分组): PAR / PAR派生 / 行李证据 / 颜色 / safety / 身份 */
  group: string
  desc: string
}

/** PAR 26 label (与 AlgoInferenceHelper::labelAt / AttributeKeyRegistry 逐位一致) */
export const PAR_LABELS: string[] = [
  'Hat', 'Glasses', 'ShortSleeve', 'LongSleeve', 'UpperStride', 'UpperLogo',
  'UpperPlaid', 'UpperSplice', 'LowerStripe', 'LowerPattern', 'LongCoat',
  'Trousers', 'Shorts', 'Skirt&Dress', 'boots', 'HandBag', 'ShoulderBag',
  'Backpack', 'HoldObjectsInFront', 'AgeOver60', 'Age18-60', 'AgeLess18',
  'Female', 'Front', 'Side', 'Back',
]

/** P4-A 色系表 (id → 名称/色板) */
export const COLOR_CLASSES: Array<{ value: number; label: string; hex: string }> = [
  { value: 0, label: '黑色', hex: '#000000' },
  { value: 1, label: '白色', hex: '#FFFFFF' },
  { value: 2, label: '灰色', hex: '#9E9E9E' },
  { value: 3, label: '红色', hex: '#F44336' },
  { value: 4, label: '橙色', hex: '#FF9800' },
  { value: 5, label: '黄色', hex: '#FFEB3B' },
  { value: 6, label: '绿色', hex: '#4CAF50' },
  { value: 7, label: '青色', hex: '#00BCD4' },
  { value: 8, label: '蓝色', hex: '#2196F3' },
  { value: 9, label: '紫色', hex: '#9C27B0' },
  { value: 10, label: '粉色', hex: '#E91E63' },
  { value: 11, label: '棕色', hex: '#795548' },
]

/** 枚举型 id/state 键的可选值表 (value 控件分型依据) */
export const ID_ENUM_OPTIONS: Record<string, Array<{ value: number; label: string; hex?: string }>> = {
  attr_age_id: [
    { value: 0, label: '老年' },
    { value: 1, label: '成年' },
    { value: 2, label: '儿童' },
  ],
  attr_gender_id: [
    { value: 0, label: '男' },
    { value: 1, label: '女' },
  ],
  attr_facing_id: [
    { value: 0, label: '正面' },
    { value: 1, label: '侧面' },
    { value: 2, label: '背面' },
  ],
  upper_color_id: COLOR_CLASSES,
  lower_color_id: COLOR_CLASSES,
  mask_status: [
    { value: 0, label: '未戴口罩' },
    { value: 0.5, label: '佩戴口罩不规范' },
    { value: 1, label: '正确佩戴口罩' },
  ],
  group_type: [
    { value: 0, label: '未知' },
    { value: 1, label: '白名单' },
    { value: 2, label: '黑名单' },
  ],
}

/** 显式注册键 (AttributeKeyRegistry.h explicitAttributeKeys, 28 键) */
const EXPLICIT_KEYS: AttributeKeyDef[] = [
  // PAR 派生语义 (5)
  { key: 'attr_age_id', kind: 'id', group: 'PAR派生', desc: '年龄段 0=老年/1=成年/2=儿童 (仅描述与资源分配, 禁止拦截类自动决策)' },
  { key: 'attr_age_conf', kind: 'conf', group: 'PAR派生', desc: '年龄段判定置信度' },
  { key: 'attr_gender_id', kind: 'id', group: 'PAR派生', desc: '性别 0=男/1=女 (仅描述用途)' },
  { key: 'attr_facing_id', kind: 'id', group: 'PAR派生', desc: '朝向 0=正面/1=侧面/2=背面' },
  { key: 'attr_facing_conf', kind: 'conf', group: 'PAR派生', desc: '朝向判定置信度' },
  // personal_item 合成行李框证据 (5)
  { key: 'attr_src', kind: 'state', group: '行李证据', desc: '1=属性路线合成框 / 0=检测路线' },
  { key: 'attr_backpack', kind: 'score', group: '行李证据', desc: '背包属性分数 (合成框)' },
  { key: 'attr_shoulder', kind: 'score', group: '行李证据', desc: '单肩包属性分数 (合成框)' },
  { key: 'attr_handbag', kind: 'score', group: '行李证据', desc: '手提包属性分数 (合成框)' },
  { key: 'attr_facing_back', kind: 'score', group: '行李证据', desc: '背面朝向分数 (合成框)' },
  // P4-A 衣着颜色 (6)
  { key: 'upper_color_raw', kind: 'state', group: '颜色', desc: '上装单帧采样色系 0-11 (未投票, 可观测)' },
  { key: 'upper_color_id', kind: 'id', group: '颜色', desc: '上装色系投票 id (12 色系)' },
  { key: 'upper_color_conf', kind: 'conf', group: '颜色', desc: '上装色系投票占比 count/total' },
  { key: 'lower_color_raw', kind: 'state', group: '颜色', desc: '下装单帧采样色系 0-11 (未投票, 可观测)' },
  { key: 'lower_color_id', kind: 'id', group: '颜色', desc: '下装色系投票 id (12 色系)' },
  { key: 'lower_color_conf', kind: 'conf', group: '颜色', desc: '下装色系投票占比 count/total' },
  // safety 行为插件 (7)
  { key: 'mask_status', kind: 'state', group: '安全行为', desc: '口罩状态 0=未戴/0.5=不规范/1=正确' },
  { key: 'has_phone', kind: 'score', group: '安全行为', desc: '手持电话判定分数' },
  { key: 'phone_pose_score', kind: 'score', group: '安全行为', desc: '打电话姿态分数' },
  { key: 'hand_near_ear', kind: 'score', group: '安全行为', desc: '手近耳启发式分数' },
  { key: 'phone_pose_fallback', kind: 'score', group: '安全行为', desc: '弱判定回退分数' },
  { key: 'smoking_pose_score', kind: 'score', group: '安全行为', desc: '吸烟姿态分数' },
  { key: 'has_flame', kind: 'state', group: '安全行为', desc: '明火证据 0/1' },
  // 身份/关联 (5)
  { key: 'face_matched', kind: 'state', group: '身份', desc: '人脸库命中 0/1' },
  { key: 'person_id_hash', kind: 'state', group: '身份', desc: 'person_id 哈希 (脱敏)' },
  { key: 'similarity', kind: 'score', group: '身份', desc: '人脸相似度' },
  { key: 'group_type', kind: 'state', group: '身份', desc: '0=未知/1=白名单/2=黑名单' },
  { key: 'blacklist_hit', kind: 'state', group: '身份', desc: '黑名单命中 0/1' },
]

/** 全量注册键: PAR 26 动态展开 + 显式 28 键 */
export const ATTRIBUTE_KEYS: AttributeKeyDef[] = [
  ...PAR_LABELS.map(
    (l): AttributeKeyDef => ({
      key: `attr_${l}_score`,
      kind: 'score',
      group: 'PAR属性',
      desc: `PAR 属性 ${l} 分数`,
    })
  ),
  ...EXPLICIT_KEYS,
]

const KEY_MAP: Map<string, AttributeKeyDef> = new Map(
  ATTRIBUTE_KEYS.map((d) => [d.key, d])
)

/** key 合法域判定 (规则编辑前端拦截; 与后端 isRegisteredAttributeKey 同语义) */
export function isRegisteredAttributeKey(key: string): boolean {
  return KEY_MAP.has(key)
}

/** 查键定义 (含 kind/分组/描述); 未注册返回 undefined */
export function getAttributeKeyDef(key: string): AttributeKeyDef | undefined {
  return KEY_MAP.get(key)
}

/**
 * kind → 允许的算子集 (docs/attribute-key-contract.md §1 建议算子)。
 * 后端协议 op 字符串: == != > >= < <= exists not_exists。
 * 前端按 kind 强约束可选算子, 杜绝语义不匹配组合 (如 id 键用 >=)。
 */
export function allowedOps(kind: AttributeKeyKind): string[] {
  switch (kind) {
    case 'score':
    case 'conf':
      return ['>=', '<']
    case 'id':
      return ['==', '!=']
    case 'state':
      return ['==', '>=', 'exists', 'not_exists']
  }
}

/** value 控件分型: enum=枚举下拉 / slider=0-1 滑条 / bool=开关 / number=数值 */
export function valueControlKind(
  key: string,
  def: AttributeKeyDef | undefined
): 'enum' | 'slider' | 'bool' | 'number' {
  if (def && ID_ENUM_OPTIONS[key]) return 'enum'
  if (def && (def.kind === 'score' || def.kind === 'conf')) return 'slider'
  if (def && def.kind === 'state') {
    // 布尔型 state: 0/1 语义键
    const boolKeys = [
      'attr_src', 'has_flame', 'face_matched', 'blacklist_hit',
      'upper_color_raw', 'lower_color_raw',
    ]
    if (boolKeys.includes(key)) return 'bool'
  }
  return 'number'
}
