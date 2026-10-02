/**
 * roiWriteFrameBasis.test.ts — [FIX p1-roi-basis-write 2026-10-02] 缺陷 13-5
 *
 * 背景 (真机 56mf 实测, 台账 §5.1.44): 13-1 首版把「像素尺度 ROI 顶点的归一除数」
 *   绑到告警证据图 naturalWidth/Height。真机取证证伪该假设 ——
 *   · 证据图由插件侧 evidenceEncodeAlignedFrame(max_w=kMaxW=1280) 从喂帧降采样而来
 *     (box-sdk/include/plugin/algo/{KeyFrameCapture,EvidenceFrames}.h);
 *   · 几何顶点由画板按「通道快照真实帧尺寸」写入
 *     (LinkageRuleView roiFrameByChannel → frameOfChannel, 缺陷 14-1 的产物);
 *   · 抽样 4 页×30 条告警中 12 条像素形态 alarm_shapes: **12/12 顶点越出证据帧
 *     边界** (max x=1317>1280, max y=1074>720/360), 且同一几何 (ch…2003 的
 *     646×1073) 同时配到 1280×720 与 640×360 两种证据帧 —— 除数随证据帧漂移。
 *   ⇒ 以证据帧为除数把区域放大 1.5×/3× 并 clamp 削顶 (净回归)。本批纠正: 除数
 *   取通道目录声明的 resolution (chFrameOf), 未知 → {0,0} → roiSchema SSOT 回退
 *   1920×1080, 与写入侧未命中时的回退同口径; **绝不回退证据帧尺寸**。
 *
 * 判据纪律 (每条都能被「坏实现」证伪):
 *   ① parseResolution 六形态 + 非法 → {0,0}
 *      (坏实现: 只 split('x') → "1280×960"/"1280X960"/"1280 960" 全红);
 *   ② 真机目录形态 → chFrameOf(20 位码) = {1920,1080}
 *      (坏实现: 未把 resolution 落表 → {0,0} 红);
 *   ③ 子码流 _chN 形态与主形态同基准
 *      (坏实现: 不剥后缀 → 子码流告警查不到 → {0,0} 红, 区域退回常量基准);
 *   ④ 未知/已删通道 → {0,0} 且 **不得**等于任何证据帧尺寸
 *      (坏实现: 拿证据帧尺寸兜底 → 1280×720 红 —— 本缺陷的根红线);
 *   ⑤ 非法分辨率字符串 ("1920x0" / "unknown") 不落表 → {0,0}
 *      (坏实现: 不做 >0 校验 → {1920,0} 红, 会喂给 normalizePoint 半个除数);
 *   ⑥ 形状链联合判据 (真机现网数字): 同一冻结快照顶点按 {1920,1080} 与按
 *      证据帧 {1280,720} 归一的结果必须可分, 且前者不越界、后者被 clamp 削顶
 *      (坏实现: normPoints 忽略 frame → 两态同值 → 红;
 *       坏接线: 组件传证据帧 → 本条给出「错在哪」的数值证据)。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

vi.mock('@/api/channel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/channel')>()
  return { ...actual, channelApi: { ...actual.channelApi, getList: vi.fn() } }
})
vi.mock('@/api/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/device')>()
  return { ...actual, deviceApi: { ...actual.deviceApi, getList: vi.fn() } }
})

import { channelApi } from '@/api/channel'
import { deviceApi } from '@/api/device'
import {
  parseResolution, chFrameOf, loadAlarmNameDirectory, alarmDirReady,
} from '../useAlarmDeviceLabel'
import { useAlarmShapes } from '../useAlarmShapes'

// ── 真机 56mf /api/v1/channels 原样四通道 (全 1920x1080) + 两条例外夹具 ──
const CHANNELS = [
  { channel_id: '34020000001320002001', name: '员工通道摄像头', device_id: '34020000001180000002', resolution: '1920x1080' },
  { channel_id: '34020000001320002003', name: '全景摄像头', device_id: '34020000001180000002', resolution: '1920x1080' },
  // 子码流形态行 (真机区域/告警两侧均以剥后缀主形态互认, 这里验同一口径)
  { channel_id: '34020000001320002004_ch0', name: '中安华盾大门 子码流', device_id: '34020000001180000002', resolution: '1280×960' },
  // 脏数据形态: 后端给出不可解析/半零分辨率 → 必须视为「未知」而非除数
  { channel_id: '34020000001320002099', name: '脏分辨率通道', device_id: '34020000001180000002', resolution: '1920x0' },
  { channel_id: '34020000001320002098', name: '无分辨率通道', device_id: '34020000001180000002', resolution: 'unknown' },
]

beforeAll(async () => {
  ;(channelApi.getList as any).mockResolvedValue({ data: { data: { channels: CHANNELS, items: CHANNELS } } })
  ;(deviceApi.getList as any).mockResolvedValue({ data: { data: { devices: [], items: [] } } })
  loadAlarmNameDirectory()
  for (let i = 0; i < 100 && !alarmDirReady().value; i++) await new Promise((r) => setTimeout(r, 5))
  expect(alarmDirReady().value).toBe(true)
})

describe('ROI 写入侧基准解析 (13-5)', () => {
  it('① parseResolution 六形态可解析 / 非法归零 (判据 ①)', () => {
    expect(parseResolution('1920x1080')).toEqual({ w: 1920, h: 1080 })
    expect(parseResolution('1280X960')).toEqual({ w: 1280, h: 960 })
    expect(parseResolution('1280×960')).toEqual({ w: 1280, h: 960 })
    expect(parseResolution('1280*960')).toEqual({ w: 1280, h: 960 })
    expect(parseResolution('1280/960')).toEqual({ w: 1280, h: 960 })
    expect(parseResolution('1280 960')).toEqual({ w: 1280, h: 960 })
    expect(parseResolution('720-1280')).toEqual({ w: 720, h: 1280 })
    for (const bad of ['', '   ', 'unknown', '1920', '1920x1080x2', '0x0', '1920x0', null, undefined, 123]) {
      expect(parseResolution(bad), `bad=${JSON.stringify(bad)}`).toEqual({ w: 0, h: 0 })
    }
  })

  it('② 真机目录形态 → chFrameOf(20 位码) = 通道声明分辨率 (判据 ②)', () => {
    expect(chFrameOf('34020000001320002001')).toEqual({ w: 1920, h: 1080 })
    expect(chFrameOf('34020000001320002003')).toEqual({ w: 1920, h: 1080 })
  })

  it('③ 子码流 _chN 与主形态同基准 (判据 ③)', () => {
    expect(chFrameOf('34020000001320002004_ch0')).toEqual({ w: 1280, h: 960 })
    expect(chFrameOf('34020000001320002004')).toEqual({ w: 1280, h: 960 })
  })

  it('④ 未知/已删通道 → {0,0} 走 SSOT 回退, 绝不回退证据帧尺寸 (判据 ④ 红线)', () => {
    const f = chFrameOf('34020000001320999999')
    expect(f).toEqual({ w: 0, h: 0 })
    // 红线: 未知时不得给出任何「证据帧档位」尺寸 (1280×720 / 640×360 是
    // KeyFrameCapture kMaxW=1280 降采样产物, 与几何写入基准不同源)
    expect(f).not.toEqual({ w: 1280, h: 720 })
    expect(f).not.toEqual({ w: 640, h: 360 })
    expect(chFrameOf('')).toEqual({ w: 0, h: 0 })
    expect(chFrameOf(undefined)).toEqual({ w: 0, h: 0 })
  })

  it('⑤ 非法/半零分辨率不落表 → {0,0} (判据 ⑤)', () => {
    expect(chFrameOf('34020000001320002099')).toEqual({ w: 0, h: 0 })
    expect(chFrameOf('34020000001320002098')).toEqual({ w: 0, h: 0 })
  })

  it('⑥ 形状链联合判据: 真机顶点 (1270,1074) 按写入侧基准不越界, 按证据帧被 clamp 削顶 (判据 ⑥)', async () => {
    // 真机 ch…2004 冻结快照原值 (无注入): points=[[124,190],[1025,163],[1270,974],[94,1074]]
    const snap = [{
      type: 'detection_zone',
      name: '多边形 1',
      points: [[124, 190], [1025, 163], [1270, 974], [94, 1074]],
    }]
    const round = (pts: Array<[number, number]>) =>
      pts.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))])

    // 正确基准 = 通道声明 1920×1080 (与画板写入同源): 满幅内, 无一顶点贴边
    const a = useAlarmShapes()
    expect(await a.load('34020000001320002004', 'intrusion', snap, 'k-13-5-a', { w: 1920, h: 1080 }))
      .toBe('snapshot')
    const good = round(a.shapes.value[0].points)
    expect(good).toEqual([[0.0646, 0.1759], [0.5339, 0.1509], [0.6615, 0.9019], [0.049, 0.9944]])
    expect(good.every(([x, y]) => x < 1 && y < 1)).toBe(true)

    // 错误基准 = 证据帧 1280×720 (13-1 首版接线): 1.5× 放大 → 右下顶点被 clamp 削顶
    const b = useAlarmShapes()
    expect(await b.load('34020000001320002004', 'intrusion', snap, 'k-13-5-b', { w: 1280, h: 720 }))
      .toBe('snapshot')
    const wrong = round(b.shapes.value[0].points)
    expect(wrong).toEqual([[0.0969, 0.2639], [0.8008, 0.2264], [0.9922, 1], [0.0734, 1]])
    expect(wrong).not.toEqual(good)
  })
})
