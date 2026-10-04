/**
 * axisRegionIds.test.ts — [FIX p1-axis-region-id-domain 2026-10-02] 缺陷 15-1
 *
 * 背景: 时序条件三个区域选择器 (穿越链每一步 / 进入的区域 / 应先经过的区域) 都是
 *   `allow-create filterable` 且**下拉展示名称**, 序列化只 `String(v).trim()` 不做
 *   域校验 → 用户把看到的名称复制回来手输即可落库; 引擎侧按 `event.region_id`
 *   严格字符串直比 (LinkageEngine.cpp:1656/1731/1900, [R3-2 2026-09-10] 不做多形态
 *   回退) → 名称永不等于事件携带的 ID → 规则保存成功、开关可开、永不触发且零日志。
 *   本批把「序列化 + 形态白名单校验」抽成 axisRegionIds.ts 纯函数, 非 ID 形态返回
 *   bad 清单, 由 handleSave 报错并拒绝保存。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   1. `{region_id:'大门'}` → json='' 且 bad=['大门'] (清单 §15-1 验证 1 原文)
 *      (坏实现: 无域校验 → json 里带着「大门」→ 红 —— 这就是今天的病灶);
 *   2. 画板候选集内的 pid → 正常序列化
 *      (坏实现: 一刀切拒绝一切 → 红 —— 保护正常路径);
 *   3. 纯数字区域库 ID '12' → 通过
 *      (坏实现: 写成「只允许当前画板候选集」→ 红。实锚: 事件侧 metadata["region_id"]
 *       由插件写的是区域库数字主键 (intrusion_detector.cpp:724), 手输数字 ID 是今天
 *       唯一可能与引擎对上的形态, 按候选集白名单会把它一起杀掉);
 *   4. 前置区域为空 → 不算非法 (旧实现允许留空, 零回归);
 *   5. 空步骤 / 未填 → bad 为空且 json='' (与旧实现「全空即空串」一致);
 *   6. 混合 [pid, '大门'] → 整条 json='' 且只报「大门」
 *      (坏实现: 静默丢掉非法那一步返回残缺链 → 红 —— 正是旧行为);
 *   7. 钳位口径零变更: `Number(raw) || fallback` 后夹 [1s,24h] (旧实现逐字保留,
 *      0 落默认值而非下限);
 *   8. trim 生效: ' 12 ' 合法; ' 大门 ' → bad 为去空格形态。
 */
import { describe, it, expect } from 'vitest'
import {
  isAcceptableAxisRegionId,
  auditAxisRegionIds,
  clampGapS,
  serializeAxisSequencePure,
  serializeAxisConditionalPure,
  resolvePidToRegionId,
} from '../axisRegionIds'

const PID_A = 'roi_1758123456789_abc123'
const PID_B = 'roi_echo_1758123456789_0'
const CANDIDATES = [PID_A, PID_B]

describe('axisRegionIds 时序条件 region_id 域校验 (15-1)', () => {
  it('① 名称形态被拒: {region_id:"大门"} → json 空 + bad 指名 (判据 1)', () => {
    const r = serializeAxisSequencePure('sequence', [{ region_id: '大门', gap_s: 60 }], [])
    expect(r.json).toBe('')
    expect(r.bad).toEqual(['大门'])
  })

  it('② 画板候选 pid 正常序列化, 不被误杀 (判据 2)', () => {
    const r = serializeAxisSequencePure('sequence', [{ region_id: PID_A, gap_s: 60 }], CANDIDATES)
    expect(r.bad).toEqual([])
    expect(JSON.parse(r.json)).toEqual([{ region_id: PID_A, max_gap_ms: 60000 }])
  })

  it('③ 纯数字区域库 ID 放行 (手输「12」是今天唯一可能与引擎对上的形态, 判据 3)', () => {
    expect(isAcceptableAxisRegionId('12', [])).toBe(true)
    const r = serializeAxisSequencePure('sequence', [{ region_id: '12', gap_s: 30 }], CANDIDATES)
    expect(r.bad).toEqual([])
    expect(JSON.parse(r.json)).toEqual([{ region_id: '12', max_gap_ms: 30000 }])
    // pid 命名空间形态即使不在本次候选集 (规则回显时画板尚未加载) 也放行
    expect(isAcceptableAxisRegionId(PID_B, [])).toBe(true)
  })

  it('④ 前置区域留空不算非法; 填名称才算 (判据 4)', () => {
    const ok = serializeAxisConditionalPure('conditional', PID_A, '', 300, CANDIDATES)
    expect(ok.bad).toEqual([])
    expect(JSON.parse(ok.json)).toEqual({ target_region_id: PID_A, prior_region_id: '', lookback_ms: 300000 })
    const bad = serializeAxisConditionalPure('conditional', PID_A, '大门', 300, CANDIDATES)
    expect(bad.json).toBe('')
    expect(bad.bad).toEqual(['大门'])
  })

  it('⑤ 全空步骤 / 模式不匹配 → 空串且无非法 (与旧实现零回归, 判据 5)', () => {
    expect(serializeAxisSequencePure('sequence', [{ region_id: '', gap_s: 60 }], CANDIDATES))
      .toEqual({ json: '', bad: [] })
    expect(serializeAxisSequencePure('', [{ region_id: '大门', gap_s: 60 }], CANDIDATES))
      .toEqual({ json: '', bad: [] })   // 模式非 sequence = 清链, 不报非法
    expect(serializeAxisConditionalPure('conditional', '', '', 300, CANDIDATES))
      .toEqual({ json: '', bad: [] })
    expect(serializeAxisSequencePure('sequence', null, CANDIDATES)).toEqual({ json: '', bad: [] })
  })

  it('⑥ 混合合法+非法 → 整条拒绝且不静默丢步 (判据 6, 坏实现=旧「静默 filter 掉」)', () => {
    const r = serializeAxisSequencePure(
      'sequence',
      [{ region_id: PID_A, gap_s: 60 }, { region_id: '大门', gap_s: 120 }, { region_id: '大门', gap_s: 10 }],
      CANDIDATES,
    )
    expect(r.bad).toEqual(['大门'])            // 去重
    expect(r.json).toBe('')                     // 残缺链不落库
    // 审计器同样只报非法项 (空项不报)
    expect(auditAxisRegionIds([PID_A, '', ' 多边形 1 ', '12'], CANDIDATES)).toEqual(['多边形 1'])
  })

  it('⑦ 钳位口径零变更: 0/非法→默认值, 上限 24h (判据 7)', () => {
    // `Number(raw) || fallback` 是旧实现逐字口径: 0 / NaN / 空 → 落默认值 (不是 1)
    expect(clampGapS(0)).toBe(60)
    expect(clampGapS(999999)).toBe(86400)
    expect(clampGapS(undefined)).toBe(60)
    expect(clampGapS(0.4)).toBe(1)          // 1s 下限
    const r = serializeAxisSequencePure('sequence', [{ region_id: '12', gap_s: 0 }, { region_id: '13', gap_s: 99999 }], [])
    expect(JSON.parse(r.json)).toEqual([{ region_id: '12', max_gap_ms: 60000 }, { region_id: '13', max_gap_ms: 86400000 }])
    const c = serializeAxisConditionalPure('conditional', '12', '', 0, [])
    expect(JSON.parse(c.json).lookback_ms).toBe(300000)   // 0 → 默认 300s
  })

  it('⑧ trim 生效 (判据 8)', () => {
    expect(isAcceptableAxisRegionId('  12  ', [])).toBe(true)
    const r = serializeAxisSequencePure('sequence', [{ region_id: ' 大门 ', gap_s: 60 }], [])
    expect(r.bad).toEqual(['大门'])
    const ok = serializeAxisSequencePure('sequence', [{ region_id: ' 12 ', gap_s: 60 }], [])
    expect(JSON.parse(ok.json)).toEqual([{ region_id: '12', max_gap_ms: 60000 }])
  })
})

// ── [FIX p1-15-1b-mapping 2026-10-04] 15-1(b) 前端保存侧 pid↔区域库主键 规一化 ──
describe('resolvePidToRegionId + serialize* 接入 roiBindings (15-1b)', () => {
  const BINDINGS = [
    { roi_id: PID_A, region_id: 101 },
    { roi_id: PID_B, region_id: 0 },            // 未绑定 (0 非法)
    // ROI_UNBOUND 未列 → 模拟未绑定情形
  ]
  const ROI_UNBOUND = 'roi_9999_nobody'

  it('⑨ resolvePidToRegionId: 命中绑表时 pid → String(region_id)', () => {
    const r = resolvePidToRegionId(PID_A, BINDINGS)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.value).toBe('101'); expect((r as any).passthrough).toBeUndefined() }
  })

  it('⑩ resolvePidToRegionId: 未命中/region_id=0/缺失 时 ok:false + reason=unbound_pid', () => {
    const miss = resolvePidToRegionId(ROI_UNBOUND, BINDINGS)
    expect(miss.ok).toBe(false)
    if (!miss.ok) { expect(miss.reason).toBe('unbound_pid'); expect(miss.pid).toBe(ROI_UNBOUND) }
    const zero = resolvePidToRegionId(PID_B, BINDINGS)
    expect(zero.ok).toBe(false)   // region_id=0 不算已绑定
  })

  it('⑪ resolvePidToRegionId: 纯数字 / 空串 透传 (向后兼容)', () => {
    const num = resolvePidToRegionId('12', BINDINGS)
    expect(num.ok).toBe(true)
    if (num.ok) { expect(num.value).toBe('12'); expect((num as any).passthrough).toBe(true) }
    const empty = resolvePidToRegionId('', BINDINGS)
    expect(empty.ok).toBe(true)
    if (empty.ok) { expect(empty.value).toBe(''); expect((empty as any).passthrough).toBe(true) }
  })

  it('⑫ serializeAxisSequencePure: 传入 roiBindings 后落库 JSON 为数字 region_id (非 pid)', () => {
    const r = serializeAxisSequencePure('sequence', [{ region_id: PID_A, gap_s: 60 }], CANDIDATES, BINDINGS)
    expect(r.bad).toEqual([])
    expect(JSON.parse(r.json)).toEqual([{ region_id: '101', max_gap_ms: 60000 }])
  })

  it('⑬ serializeAxisSequencePure: pid 未绑定 → bad_pids 非空 + json 空 + bad 点名 (拒保存)', () => {
    const r = serializeAxisSequencePure('sequence', [{ region_id: ROI_UNBOUND, gap_s: 60 }], [ROI_UNBOUND], BINDINGS)
    expect(r.json).toBe('')
    expect(r.bad_pids).toEqual([ROI_UNBOUND])
    expect(r.bad.length).toBe(1)
    expect(r.bad[0]).toMatch(/未绑定区域库 ID/)
  })

  it('⑭ serializeAxisConditionalPure: target 已绑定 pid + prior 未绑定 pid → 拒保存 bad_pids 点名 prior', () => {
    const r = serializeAxisConditionalPure('conditional', PID_A, ROI_UNBOUND, 300, [PID_A, ROI_UNBOUND], BINDINGS)
    expect(r.json).toBe('')
    expect(r.bad_pids).toEqual([ROI_UNBOUND])
  })

  it('⑮ serializeAxisConditionalPure: 两侧均命中 → json 中 target/prior 均为数字 region_id (非 pid)', () => {
    const b2 = [...BINDINGS, { roi_id: ROI_UNBOUND, region_id: 202 }]
    const r = serializeAxisConditionalPure('conditional', PID_A, ROI_UNBOUND, 300, [PID_A, ROI_UNBOUND], b2)
    expect(r.bad).toEqual([])
    const parsed = JSON.parse(r.json)
    expect(parsed.target_region_id).toBe('101')
    expect(parsed.prior_region_id).toBe('202')
    expect(parsed.lookback_ms).toBe(300000)
  })

  it('⑯ roiBindings 为 undefined/null 时行为与旧形态一致 (向后兼容, pid 直接落库)', () => {
    const r1 = serializeAxisSequencePure('sequence', [{ region_id: PID_A, gap_s: 60 }], CANDIDATES)
    expect(JSON.parse(r1.json)).toEqual([{ region_id: PID_A, max_gap_ms: 60000 }])
    const r2 = serializeAxisSequencePure('sequence', [{ region_id: PID_A, gap_s: 60 }], CANDIDATES, null)
    expect(JSON.parse(r2.json)).toEqual([{ region_id: PID_A, max_gap_ms: 60000 }])
  })
})
