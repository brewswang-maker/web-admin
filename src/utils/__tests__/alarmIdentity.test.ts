/**
 * alarmIdentity.test.ts — [FIX p1-alarm-identity 2026-10-02] 缺陷 12-1
 *
 * 背景: 弹窗 (AlarmPopup 三个 computed) / 预览弹窗 (AlarmsView、AlarmEventsPanel 的
 *   openSnapshotPreview) / 标注组件 (SnapshotAnnotated.effAlgoId) 曾各自推导同一告警的
 *   (channelId, algoId) —— 两处列表预览**完全不传 algoId** (useAlarmShapes 的 algoHit
 *   因 `!algoId` 恒真, 越界命中该通道任意规则), 通道侧只用快照 URL 正则 + 顶层 channelId,
 *   未接入平台既有的真通道码 SSOT `alarmChannelIdOf`。本批六处统一委托本模块。
 *
 * 判据纪律 (每条都要能被「坏实现」证伪):
 *   1. metadata.channel_id_str 必须赢过顶层 channelId (坏实现: 只用顶层 → 拿到 NVR 父码 → 红);
 *   2. 顶层被归并成父码且无 metadata 线索时, 快照 URL 的 gb_<裸码> 必须救回 (坏实现:
 *      原样返回父码 → 红) —— 保住 PREV-CHFIX 语义;
 *   3. 取证图 URL (/snapshots/evidence/ev_*.jpg, 不含通道码) 不得瞎猜, 回退顶层码
 *      (坏实现: 把 "evidence" 当通道名 → 红) —— 真机 i=14 实锚的清单外现象;
 *   4. 同一告警在「弹窗入参形态」与「列表预览入参形态」下必须得到同一 identity
 *      —— 这条就是 12-1 的正身 (修复前三处口径不同 → 红)。
 */
import { describe, it, expect } from 'vitest'
import {
  channelFromAlarmUrls, resolveAlarmAlgoId, resolveAlarmChannelId, resolveAlarmIdentity,
} from '../alarmIdentity'

const REAL_CH = '13120000001320900001'
const NVR_PARENT = '13120000001320000000'

describe('alarmIdentity 通道口径 (12-1)', () => {
  it('metadata.channel_id_str 优先于顶层 channelId (判据 1)', () => {
    const a = { channelId: NVR_PARENT, metadata: { channel_id_str: REAL_CH } }
    expect(resolveAlarmChannelId(a)).toBe(REAL_CH)
  })

  it('顶层被归并为父码时从快照 URL 救回真通道, 去 gb_ 前缀与 _ch0 尾缀 (判据 2)', () => {
    const a = {
      channelId: NVR_PARENT,
      snapshotUrl: `/snapshots/rtp/gb_${REAL_CH}_ch0/1.jpg`,
    }
    expect(resolveAlarmChannelId(a)).toBe(REAL_CH)
  })

  it('回放 URL 形态 /record/record/rtp/<ch>/ 同样可反解', () => {
    expect(channelFromAlarmUrls(`/record/record/rtp/${REAL_CH}/a.mp4`)).toBe(REAL_CH)
  })

  it('取证图 URL 不含通道码 → 不猜, 回退顶层 channelId (判据 3, 真机 i=14 实锚)', () => {
    const a = { channelId: REAL_CH, snapshotUrl: '/snapshots/evidence/ev_20261002_1.jpg' }
    expect(channelFromAlarmUrls(a.snapshotUrl)).toBe('')
    expect(resolveAlarmChannelId(a)).toBe(REAL_CH)
  })

  it('显式 override (弹窗手工切通道) 高于一切推导', () => {
    const a = { channelId: NVR_PARENT, metadata: { channel_id_str: REAL_CH } }
    expect(resolveAlarmChannelId(a, { override: 'OVERRIDE_CH' })).toBe('OVERRIDE_CH')
  })

  it('裸 row snake_case 形态与 normalize 后形态同解', () => {
    expect(resolveAlarmChannelId({ channel_id: REAL_CH } as any)).toBe(REAL_CH)
  })

  it('空入参不崩 (undefined / null / {} → 空串)', () => {
    expect(resolveAlarmChannelId(undefined)).toBe('')
    expect(resolveAlarmChannelId(null)).toBe('')
    expect(resolveAlarmChannelId({})).toBe('')
  })
})

describe('alarmIdentity 算法口径 (12-1)', () => {
  it('metadata.algo_id 优先', () => {
    expect(resolveAlarmAlgoId({ metadata: { algo_id: 'shield.algo.face.detect' }, type: 'face' }))
      .toBe('shield.algo.face.detect')
  })

  it('metadata 为插件直报数组形态 [{...}] → 取首元素 (与 unpackAlarmMeta 同口径)', () => {
    expect(resolveAlarmAlgoId({ metadata: [{ algo_id: 'shield.algo.behavior.loitering' }] }))
      .toBe('shield.algo.behavior.loitering')
  })

  it('algorithm_id 与顶层 algoId 两级回退 (修复前弹窗只认 algo_id)', () => {
    expect(resolveAlarmAlgoId({ metadata: { algorithm_id: 'shield.algo.fire.detect' } }))
      .toBe('shield.algo.fire.detect')
    expect(resolveAlarmAlgoId({ metadata: {}, algoId: 'shield.algo.ppe.detect' }))
      .toBe('shield.algo.ppe.detect')
  })

  it('无任何算法字段时退 type (弹窗历史口径, 列表预览此前缺失导致 algoHit 恒真)', () => {
    expect(resolveAlarmAlgoId({ metadata: {}, type: 'shield.algo.perimeter.intrusion' }))
      .toBe('shield.algo.perimeter.intrusion')
    expect(resolveAlarmAlgoId({ metadata: {}, event_type: 'illegal_parking' }))
      .toBe('illegal_parking')
  })

  it("字符串 'undefined' 视为无效 (后端 JSON 序列化的脏值)", () => {
    expect(resolveAlarmAlgoId({ metadata: { algo_id: 'undefined' }, type: 'fallback' }))
      .toBe('fallback')
  })
})

describe('alarmIdentity 三处口径一致 (12-1 正身)', () => {
  // 同一告警: 弹窗侧读 normalize 后的 snapshotUrl/videoClipUrl; 列表预览侧把
  //   getSnapshotUrl(row) 的结果作为 snapshotUrl 传入 —— 修复前两条链推导结果不同。
  const alarm = {
    channelId: NVR_PARENT,
    type: 'shield.algo.behavior.loitering',
    metadata: { algo_id: 'shield.algo.behavior.loitering' },
    snapshotUrl: `/snapshots/rtp/gb_${REAL_CH}_ch0/1.jpg`,
    videoClipUrl: `/record/record/rtp/gb_${REAL_CH}_ch0/1.mp4`,
  }

  it('弹窗形态与列表预览形态得到同一 (channelId, algoId) (判据 4)', () => {
    const popupView = resolveAlarmIdentity(alarm)
    const listView = resolveAlarmIdentity(alarm, { snapshotUrl: alarm.snapshotUrl })
    expect(listView).toEqual(popupView)
    expect(popupView.channelId).toBe(REAL_CH)
    expect(popupView.algoId).toBe('shield.algo.behavior.loitering')
  })

  it('metadata 为空的告警: 两处仍同解 (清单验证条款「构造 metadata={} 断言形状数量相同」的前提)', () => {
    const bare = { channelId: REAL_CH, type: 'illegal_parking', metadata: {} }
    expect(resolveAlarmIdentity(bare)).toEqual({ channelId: REAL_CH, algoId: 'illegal_parking' })
    expect(resolveAlarmIdentity(bare, { snapshotUrl: '/snapshots/evidence/ev_1.jpg' }))
      .toEqual({ channelId: REAL_CH, algoId: 'illegal_parking' })
  })
})
