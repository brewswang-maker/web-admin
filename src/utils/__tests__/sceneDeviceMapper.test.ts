import { describe, expect, it } from 'vitest'
import {
  parseCoord,
  isValidCoord,
  normalizeStatus,
  normalizeMapDevicePoint,
  normalizeGb28181Location,
  mergeDeviceLocations,
  perimeterPoint,
  mapDevicesToScene,
  expandChannelNodes,
  DEMO_SCENE_DEVICES,
  type NormalizedDevice,
  type SceneDevice3D,
  type DevicePlacement,
} from '@/utils/sceneDeviceMapper'

describe('parseCoord', () => {
  it('解析 number 坐标', () => {
    expect(parseCoord(108.5)).toBe(108.5)
  })
  it('解析 string 坐标', () => {
    expect(parseCoord('108.949911')).toBeCloseTo(108.949911)
  })
  it('空值/非法值返回 null', () => {
    expect(parseCoord(null)).toBeNull()
    expect(parseCoord(undefined)).toBeNull()
    expect(parseCoord('')).toBeNull()
    expect(parseCoord('abc')).toBeNull()
    expect(parseCoord(NaN)).toBeNull()
  })
})

describe('isValidCoord', () => {
  it('有效坐标返回 true', () => {
    expect(isValidCoord(34.33, 108.94)).toBe(true)
  })
  it('(0,0) 视为无效（DeviceInfo 默认值）', () => {
    expect(isValidCoord(0, 0)).toBe(false)
  })
  it('缺失视为无效', () => {
    expect(isValidCoord(null, 108.94)).toBe(false)
    expect(isValidCoord(34.33, null)).toBe(false)
  })
  it('越界视为无效', () => {
    expect(isValidCoord(91, 108)).toBe(false)
    expect(isValidCoord(34, 181)).toBe(false)
    expect(isValidCoord(-91, 108)).toBe(false)
  })
})

describe('normalizeStatus', () => {
  it('映射后端状态到场景状态', () => {
    expect(normalizeStatus('online')).toBe('online')
    expect(normalizeStatus('offline')).toBe('offline')
    expect(normalizeStatus('alarming')).toBe('alarm')
    expect(normalizeStatus('alarm')).toBe('alarm')
    expect(normalizeStatus('maintenance')).toBe('maintenance')
    expect(normalizeStatus('maintaining')).toBe('maintenance')
  })
  it('未知状态默认 offline', () => {
    expect(normalizeStatus('whatever')).toBe('offline')
    expect(normalizeStatus(undefined)).toBe('offline')
  })
})

describe('normalizeMapDevicePoint', () => {
  it('兼容后端 type 字段（而非 deviceType）', () => {
    const dev = normalizeMapDevicePoint({
      id: '34020000001320000013',
      name: '摄像头-01',
      lat: 0,
      lng: 0,
      status: 'offline',
      type: 'IPCamera',
      alarmCount: 1,
      projectName: '当前项目',
      lastAlarmType: 'person_detected',
    })
    expect(dev).not.toBeNull()
    expect(dev!.deviceType).toBe('IPCamera')
    expect(dev!.status).toBe('offline')
    expect(dev!.alarmCount).toBe(1)
    expect(dev!.lastAlarmType).toBe('person_detected')
  })
  it('缺少 id 返回 null', () => {
    expect(normalizeMapDevicePoint({ name: 'x' })).toBeNull()
  })
  it('无名称时回退使用 id', () => {
    const dev = normalizeMapDevicePoint({ id: 'abc' })
    expect(dev!.name).toBe('abc')
  })
})

describe('normalizeGb28181Location', () => {
  it('解析字符串坐标与 user_set_location 标记', () => {
    const loc = normalizeGb28181Location({
      deviceId: '34020000001320000001',
      longitude: '108.949911',
      latitude: '34.333658',
      address: '',
      user_set_location: 'true',
    })
    expect(loc).not.toBeNull()
    expect(loc!.deviceId).toBe('34020000001320000001')
    expect(loc!.userSetLocation).toBe(true)
  })
  it('缺少 deviceId 返回 null', () => {
    expect(normalizeGb28181Location({ longitude: 108 })).toBeNull()
  })
})

describe('mergeDeviceLocations', () => {
  const base: NormalizedDevice = {
    id: 'd1',
    name: '设备1',
    lat: 0,
    lng: 0,
    status: 'online',
    deviceType: 'IPCamera',
    alarmCount: 0,
    projectName: '当前项目',
    address: '',
    userSetLocation: false,
  }

  it('用户选点坐标（gb28181）覆盖 DeviceInfo 的 0 坐标', () => {
    const merged = mergeDeviceLocations([base], [
      { deviceId: 'd1', longitude: '108.949911', latitude: '34.333658', address: '东门', userSetLocation: true },
    ])
    expect(merged[0].lng).toBeCloseTo(108.949911)
    expect(merged[0].lat).toBeCloseTo(34.333658)
    expect(merged[0].userSetLocation).toBe(true)
    expect(merged[0].address).toBe('东门')
  })

  it('gb28181 坐标无效时保留原坐标', () => {
    const withCoord = { ...base, lat: 30, lng: 110 }
    const merged = mergeDeviceLocations([withCoord], [
      { deviceId: 'd1', longitude: '0', latitude: '0', address: '', userSetLocation: false },
    ])
    expect(merged[0].lat).toBe(30)
    expect(merged[0].lng).toBe(110)
  })

  it('无匹配位置记录时原样返回', () => {
    const merged = mergeDeviceLocations([base], [])
    expect(merged[0]).toEqual(base)
  })
})

describe('perimeterPoint', () => {
  it('total<=0 返回中心', () => {
    expect(perimeterPoint(0, 0)).toEqual({ x: 0, z: 0 })
  })
  it('所有点都在周界矩形范围内（默认体育场 perimeter 62/52）', () => {
    for (let i = 0; i < 8; i++) {
      const { x, z } = perimeterPoint(i, 8)
      expect(Math.abs(x)).toBeLessThanOrEqual(62)
      expect(Math.abs(z)).toBeLessThanOrEqual(52)
    }
  })
  it('halfW/halfD 可传参覆盖默认周界', () => {
    const { x, z } = perimeterPoint(0, 4, 30, 20)
    expect(Math.abs(x)).toBeLessThanOrEqual(30)
    expect(Math.abs(z)).toBeLessThanOrEqual(20)
  })
  it('多个点位置互不重叠', () => {
    const pts = Array.from({ length: 6 }, (_, i) => perimeterPoint(i, 6))
    const keys = new Set(pts.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`))
    expect(keys.size).toBe(6)
  })
})

describe('mapDevicesToScene', () => {
  it('空列表返回空数组', () => {
    expect(mapDevicesToScene([])).toEqual([])
  })

  it('有坐标设备经 bounding box 归一化，无坐标设备走周界布局', () => {
    const devices: NormalizedDevice[] = [
      { id: 'a', name: 'A', lat: 34.0, lng: 108.0, status: 'online', deviceType: '', alarmCount: 0, projectName: '', address: '', userSetLocation: false },
      { id: 'b', name: 'B', lat: 34.2, lng: 108.2, status: 'alarm', deviceType: '', alarmCount: 1, projectName: '', address: '', userSetLocation: false },
      { id: 'c', name: 'C', lat: 0, lng: 0, status: 'offline', deviceType: '', alarmCount: 0, projectName: '', address: '', userSetLocation: false },
    ]
    const nodes = mapDevicesToScene(devices)
    expect(nodes).toHaveLength(3)

    const a = nodes.find(n => n.id === 'a')!
    const b = nodes.find(n => n.id === 'b')!
    const c = nodes.find(n => n.id === 'c')!
    // a 为最小经纬度 → 映射到 -SCALE
    expect(a.x).toBeCloseTo(-38)
    expect(a.z).toBeCloseTo(-38)
    // b 为最大经纬度 → 映射到 +SCALE
    expect(b.x).toBeCloseTo(38)
    expect(b.z).toBeCloseTo(38)
    // 告警设备 y 抬高
    expect(b.y).toBe(5)
    // [FIX P2-2 2026-09-12] v1.9.5 设计变更: 无坐标设备兜底从「周界矩形分布」
    //   改为「馆内南侧场边线」(southPerimeterPoint, 真机无坐标统一朝北安装)。
    //   单个无坐标设备时 x=0 居中于南侧 (z=20>0), 不再满足旧的 x≠0 断言。
    //   设计意图是「不与中心重叠」— 改断言偏南侧。
    expect(c.z).toBeGreaterThan(0)
  })

  it('全部无坐标时沿周界均匀分布（不重叠在中心）', () => {
    const devices: NormalizedDevice[] = Array.from({ length: 4 }, (_, i) => ({
      id: `d${i}`, name: `D${i}`, lat: 0, lng: 0, status: 'online' as const,
      deviceType: '', alarmCount: 0, projectName: '', address: '', userSetLocation: false,
    }))
    const nodes = mapDevicesToScene(devices)
    expect(nodes).toHaveLength(4)
    const keys = new Set(nodes.map(n => `${n.x.toFixed(2)},${n.z.toFixed(2)}`))
    expect(keys.size).toBe(4)
    // 不应全部堆在中心
    expect(nodes.every(n => n.x === 0 && n.z === 0)).toBe(false)
  })

  it('节点携带 businessId / projectName 供交互使用', () => {
    const devices: NormalizedDevice[] = [
      { id: 'x1', name: 'X1', lat: 34, lng: 108, status: 'online', deviceType: 'IPCamera', alarmCount: 0, projectName: '当前项目', address: '东门', userSetLocation: true },
    ]
    const nodes = mapDevicesToScene(devices)
    expect(nodes[0].businessId).toBe('x1')
    expect(nodes[0].projectName).toBe('当前项目')
    expect(nodes[0].location).toBe('东门')
  })
})

describe('DEMO_SCENE_DEVICES', () => {
  it('演示数据不含 businessId（点击不跳转）', () => {
    expect(DEMO_SCENE_DEVICES.length).toBeGreaterThan(0)
    expect(DEMO_SCENE_DEVICES.every(d => !d.businessId)).toBe(true)
  })
})

// [CH-BIND 2026-09-19] 通道级绑定展开（华盾展厅 ch1→CAM_09 内场 / ch2→CAM_01 主入口）
describe('expandChannelNodes', () => {
  const mkDevice = (over: Partial<SceneDevice3D> = {}): SceneDevice3D => ({
    id: 'dev1', name: '华盾展厅', x: 0, y: 4, z: 20, status: 'online',
    location: '展厅', fov: 65, rotation: 0, businessId: 'dev1', ...over,
  })
  const mkChan = (id: string, name?: string) => ({ id, name })
  // 后端 placement 值均为字符串（KV 表），顺带验证 parseCoord 类型兼容
  const pCh1: DevicePlacement = { deviceId: 'ch1', sceneX: '0', sceneY: '4', sceneZ: '-8', rotation: '3.142', fov: '80' }
  const pCh2: DevicePlacement = { deviceId: 'ch2', sceneX: '0', sceneY: '5', sceneZ: '24', rotation: '0', fov: '70' }

  it('无通道级 placement 时原样返回（向后兼容：不展开、不改字段）', () => {
    const out = expandChannelNodes(
      [mkDevice()],
      new Map([['dev1', [mkChan('ch1'), mkChan('ch2')]]]),
      new Map(),
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('dev1')
    expect(out[0].channelId).toBeUndefined()
  })

  it('设备无通道列表时原样返回', () => {
    const out = expandChannelNodes([mkDevice()], new Map(), new Map([['ch1', pCh1]]))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('dev1')
  })

  it('任一通道有通道级 placement 即整设备展开：各通道独立占位', () => {
    const out = expandChannelNodes(
      [mkDevice()],
      new Map([['dev1', [mkChan('ch1', '周界测试摄像头 照楼下'), mkChan('ch2', '华盾展厅-通道2')]]]),
      new Map([['ch1', pCh1], ['ch2', pCh2]]),
    )
    expect(out).toHaveLength(2)
    const [n1, n2] = out
    // ch1 → CAM_09 内场 (0,4,-8) rot3.142 fov80
    expect(n1.id).toBe('ch1')
    expect(n1.channelId).toBe('ch1')
    expect(n1.businessId).toBe('dev1') // 保留父设备 id（详情跳转）
    expect(n1.name).toBe('周界测试摄像头 照楼下')
    expect(n1.x).toBe(0); expect(n1.y).toBe(4); expect(n1.z).toBe(-8)
    expect(n1.rotation).toBeCloseTo(3.142); expect(n1.fov).toBe(80)
    // ch2 → CAM_01 主入口 (0,5,24) rot0 fov70
    expect(n2.id).toBe('ch2')
    expect(n2.channelId).toBe('ch2')
    expect(n2.businessId).toBe('dev1')
    expect(n2.name).toBe('华盾展厅-通道2')
    expect(n2.x).toBe(0); expect(n2.y).toBe(5); expect(n2.z).toBe(24)
    expect(n2.rotation).toBe(0); expect(n2.fov).toBe(70)
  })

  it('部分绑定：未绑定通道回落设备级位置与姿态', () => {
    const out = expandChannelNodes(
      [mkDevice()],
      new Map([['dev1', [mkChan('ch1'), mkChan('ch2')]]]),
      new Map([['ch1', pCh1]]),
    )
    expect(out).toHaveLength(2)
    expect(out[0].z).toBe(-8) // ch1 有绑定
    expect(out[1].id).toBe('ch2')
    expect(out[1].x).toBe(0); expect(out[1].y).toBe(4); expect(out[1].z).toBe(20) // 设备级兜底
    expect(out[1].fov).toBe(65)
  })

  it('多设备：仅命中通道级绑定的设备被展开，其余保持设备级节点', () => {
    const other = mkDevice({ id: 'dev2', name: '别处摄像头', businessId: 'dev2' })
    const out = expandChannelNodes(
      [mkDevice(), other],
      new Map([['dev1', [mkChan('ch1'), mkChan('ch2')]], ['dev2', [mkChan('ch9')]]]),
      new Map([['ch1', pCh1], ['ch2', pCh2]]),
    )
    expect(out).toHaveLength(3) // dev1 展开成 2 + dev2 原样 1
    expect(out[2].id).toBe('dev2')
    expect(out[2].channelId).toBeUndefined()
  })
})
