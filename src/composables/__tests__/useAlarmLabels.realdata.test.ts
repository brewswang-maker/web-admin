/**
 * useAlarmLabels.realdata.test.ts — [FIX dev-col-leak/dev-col-ip/mon-point-seq 2026-09-19] 回归锁
 *
 * 背景 (真机 192.168.0.100 实测 1653 条告警六族形态 + 用户「越改越差」投诉):
 *   「设备」列与「监控点」列完全重复 (摄像头1/Camera 02)、无名设备列 '-'、
 *   137 未命名通道占位「监控点13120000…」裸显长编码。
 * 夹具 = 真机设备/通道目录与告警行形态原样:
 *   设备名全=国标编码 (GB28181 注册未命名) / 通道 摄像头1/Camera 02/执法记录仪 已命名,
 *   137 通道 (13120000001370000001) 未命名 / 设备 IP 192.168.0.108/104/101。
 * 断言口径:
 *   ① 设备列=设备级标识 (目录名 → 设备 IP → 父设备链 → '-'), 永不回落通道名;
 *   ② 监控点列=可读名 → 「监控点 N」序号占位 (设备内通道字典序位) → 父设备可读名 → 短占位;
 *   ③ 两列零重复; ④ 不裸显 20 位编码 / 「监控点<长编码>」占位。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// ── 目录注入 (真机 100 形态原样; axios 层解包后形态: res.data.data.*) ──
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
import { loadAlarmNameDirectory, alarmDirReady } from '../useAlarmDeviceLabel'
import { alarmDevLabel, alarmChLabel, normalizeAlarmCompat } from '../useAlarmTableHelpers'

const DEVICES = [
  { id: '34020000001320000001', name: '34020000001320000001', ip: '192.168.0.108' },
  { id: '34020000001320000002', name: '34020000001320000002', ip: '192.168.0.104' },
  { id: '34020000001320000013', name: '34020000001320000013', ip: '192.168.0.101' },
]
const CHANNELS = [
  { channel_id: '13120000001320000001', name: '摄像头1', device_id: '34020000001320000001' },
  { channel_id: '13120000001370000001', name: '13120000001370000001', device_id: '34020000001320000001' },
  { channel_id: '13120000001320000002', name: 'Camera 02', device_id: '34020000001320000001' },
  { channel_id: '34020000001320000002_ch0', name: '通道 1', device_id: '34020000001320000002' },
  { channel_id: '13120000001320000013', name: '执法记录仪', device_id: '34020000001320000013' },
]

let seq = 0
function row(over: Record<string, unknown>): any {
  return normalizeAlarmCompat({
    alarm_id: `a-${++seq}`,
    alarm_type: 'perimeter_intrusion',
    severity: 3,
    timestamp_ms: 1789795847920,
    description: 'test row',
    ...over,
  })
}

beforeAll(async () => {
  ;(channelApi.getList as any).mockResolvedValue({ data: { data: { channels: CHANNELS, items: CHANNELS } } })
  ;(deviceApi.getList as any).mockResolvedValue({ data: { data: { devices: DEVICES, items: DEVICES } } })
  loadAlarmNameDirectory()
  for (let i = 0; i < 100 && !alarmDirReady().value; i++) await new Promise((r) => setTimeout(r, 5))
  expect(alarmDirReady().value).toBe(true)
})

describe('六族真机形态 → 设备列/监控点列显示口径', () => {
  it('① 摄像头1 (REST 行): 设备列=IP, 监控点列=名, 两列零重复', () => {
    const r = row({ channel_id: '13120000001320000001', channel_id_str: '13120000001320000001', channel_name: '摄像头1', device_id: '', device_admin_id: '34020000001320000001' })
    expect(alarmDevLabel(r)).toBe('192.168.0.108')
    expect(alarmChLabel(r)).toBe('摄像头1')
    expect(alarmDevLabel(r)).not.toBe(alarmChLabel(r))
  })

  it('② Camera 02: 同上 (原「越改越差」两列重复行)', () => {
    const r = row({ channel_id: '13120000001320000002', channel_id_str: '13120000001320000002', channel_name: 'Camera 02', device_id: '34020000001320000001', device_admin_id: '34020000001320000001' })
    expect(alarmDevLabel(r)).toBe('192.168.0.108')
    expect(alarmChLabel(r)).toBe('Camera 02')
    expect(alarmDevLabel(r)).not.toBe(alarmChLabel(r))
  })

  it('③ 137 未命名通道: 设备列=IP, 监控点列=「监控点 3」(设备内字典序位; 原 - / 监控点13120000…)', () => {
    const r = row({ alarm_type: 'person_with_backpack', channel_id: '13120000001370000001', channel_id_str: '13120000001370000001', channel_name: '13120000001370000001', device_id: '34020000001320000001', device_admin_id: '34020000001320000001', metadata: [{ channel_id: 614990790, algo_id: 'person_with_backpack' }] })
    expect(alarmDevLabel(r)).toBe('192.168.0.108')
    expect(alarmChLabel(r)).toBe('监控点 3')
  })

  it('④ 执法记录仪: 设备列=该设备 IP (192.168.0.101)', () => {
    const r = row({ channel_id: '13120000001320000013', channel_id_str: '13120000001320000013', channel_name: '执法记录仪', device_id: '13120000001320000013', device_admin_id: '34020000001320000013' })
    expect(alarmDevLabel(r)).toBe('192.168.0.101')
    expect(alarmChLabel(r)).toBe('执法记录仪')
  })

  it('⑤ 设备码形态 (channel_id_str=3402… 设备码): 设备列=IP, 监控点列=尾4位短占位 (原裸显 20 位)', () => {
    const r = row({ channel_id: '34020000001320000001', channel_id_str: '34020000001320000001', channel_name: '34020000001320000001', device_id: '34020000001320000001', device_admin_id: '' })
    expect(alarmDevLabel(r)).toBe('192.168.0.108')
    expect(alarmChLabel(r)).toBe('监控点…0001')
  })

  it('⑥ WS 帧 device_name=通道名 (后端 enrich 泄漏): 设备列下沉 IP, 不当通道名直显', () => {
    const r = row({ device_name: 'Camera 02', channel_id: '13120000001320000002', channel_id_str: '13120000001320000002', channel_name: 'Camera 02', device_admin_id: '34020000001320000001' })
    expect(alarmDevLabel(r)).toBe('192.168.0.108')
    expect(alarmChLabel(r)).toBe('Camera 02')
  })

  it('⑦ WS 帧 device_name=「未知设备」占位: 设备列下沉 IP', () => {
    const r = row({ device_name: '未知设备', channel_id: '13120000001320000002', channel_id_str: '13120000001320000002', channel_name: 'Camera 02', device_admin_id: '34020000001320000001' })
    expect(alarmDevLabel(r)).toBe('192.168.0.108')
  })

  it('⑧ 目录外通道 (corridor_gate_01, 合成占位「监控点corridor_gate_01」不直用): 设备列 -, 监控点列保留可读 id', () => {
    const r = row({ alarm_type: 'face_pass_staff', channel_id: 'corridor_gate_01', channel_id_str: 'corridor_gate_01', channel_name: '', device_id: 'corridor_gate_01', device_admin_id: '' })
    expect(alarmDevLabel(r)).toBe('-')
    expect(alarmChLabel(r)).toBe('corridor_gate_01')
  })

  it('⑨ 负 hash 守卫行: 两列诚实横杠, 不裸显编号', () => {
    const r = row({ channel_id: '-516937651', channel_id_str: '-516937651', channel_name: '', device_id: '', device_admin_id: '' })
    expect(alarmDevLabel(r)).toBe('-')
    expect(alarmChLabel(r)).toBe('-')
  })

  it('⑩ 防回归: 主流形态设备列/监控点列不裸显 6 位以上纯编码、不出现「监控点<长编码>」', () => {
    const rows = [
      row({ channel_id: '13120000001320000001', channel_id_str: '13120000001320000001', channel_name: '摄像头1', device_admin_id: '34020000001320000001' }),
      row({ channel_id: '13120000001370000001', channel_id_str: '13120000001370000001', channel_name: '13120000001370000001', device_admin_id: '34020000001320000001' }),
      row({ channel_id: '34020000001320000001', channel_id_str: '34020000001320000001', channel_name: '34020000001320000001', device_admin_id: '' }),
      row({ channel_id: '1756644621', channel_id_str: '1756644621', channel_name: '', device_admin_id: '' }),
    ]
    for (const r of rows) {
      const dev = alarmDevLabel(r)
      const ch = alarmChLabel(r)
      expect(dev).not.toMatch(/^\d{6,}/)
      expect(ch).not.toMatch(/^监控点\d{6,}/)
      expect(ch).not.toMatch(/^\d{6,}/)
    }
  })
})
