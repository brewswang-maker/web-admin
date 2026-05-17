/**
 * 华盾AI智能视频盒子 v7.0 - 默认场景数据
 * components/scene3d/constants/defaultSceneData.ts
 *
 * @description Scene3D 组件的默认设备和建筑数据（当 props 未传入时使用）
 */

import type { Device3DNode, Building3DNode } from '../types/scene3d'

// ════════════════════════════════════════════════════
// ── 默认设备数据 ──
// ════════════════════════════════════════════════════

/** 默认10个摄像头设备分布 */
export const DEFAULT_DEVICES: Device3DNode[] = [
  {
    id: 'cam1', name: 'CAM_01 东门', x: -40, y: 4, z: -35,
    status: 'online', location: '1号厂区东门', fov: 60, rotation: 0,
  },
  {
    id: 'cam2', name: 'CAM_02 围墙北', x: 20, y: 4, z: -38,
    status: 'online', location: '北围墙', fov: 75, rotation: Math.PI / 4,
  },
  {
    id: 'cam3', name: 'CAM_03 车间A', x: -15, y: 5, z: 5,
    status: 'online', location: '2号车间入口', fov: 60, rotation: Math.PI / 2,
  },
  {
    id: 'cam4', name: 'CAM_04 车间B', x: 25, y: 5, z: 10,
    status: 'alarm', location: '3号厂区东围墙', alarmType: '周界入侵', fov: 65, rotation: -Math.PI / 3,
  },
  {
    id: 'cam5', name: 'CAM_05 仓库', x: -30, y: 4, z: 20,
    status: 'online', location: '仓库区域', fov: 70, rotation: Math.PI,
  },
  {
    id: 'cam6', name: 'CAM_06 停车场', x: 35, y: 4, z: 25,
    status: 'online', location: '停车场B区', fov: 80, rotation: Math.PI / 6,
  },
  {
    id: 'cam7', name: 'CAM_07 大门', x: 0, y: 5, z: 40,
    status: 'online', location: '1号大门', fov: 60, rotation: Math.PI,
  },
  {
    id: 'cam8', name: 'CAM_08 办公楼', x: -35, y: 6, z: -10,
    status: 'maintenance', location: '办公楼', fov: 55, rotation: -Math.PI / 2,
  },
  {
    id: 'cam9', name: 'CAM_09 配电房', x: 40, y: 4, z: -15,
    status: 'offline', location: '配电房', fov: 60, rotation: 0,
  },
  {
    id: 'cam10', name: 'CAM_10 围墙南', x: -10, y: 4, z: 38,
    status: 'online', location: '南围墙', fov: 75, rotation: Math.PI,
  },
]

// ════════════════════════════════════════════════════
// ── 默认建筑数据 ──
// ════════════════════════════════════════════════════

/** 默认6座工厂建筑 */
export const DEFAULT_BUILDINGS: Building3DNode[] = [
  { name: '1号车间', x: -20, z: -15, w: 24, d: 16, h: 8, color: '#1A73E8' },
  { name: '2号车间', x: 15, z: -15, w: 20, d: 14, h: 7, color: '#0F9D58' },
  { name: '仓库', x: -25, z: 15, w: 18, d: 12, h: 6, color: '#F4B400' },
  { name: '办公楼', x: 20, z: 15, w: 16, d: 12, h: 12, color: '#7C3AED' },
  { name: '配电房', x: 35, z: -5, w: 8, d: 8, h: 4, color: '#666' },
  { name: '门卫室', x: 0, z: 42, w: 6, d: 4, h: 3, color: '#888' },
]

// ════════════════════════════════════════════════════
// ── 默认围墙数据 ──
// ════════════════════════════════════════════════════

/** 默认4段围墙 */
export const DEFAULT_FENCES = [
  { x: -55, y: 0, z: 0, width: 0.3, height: 3, depth: 100 },
  { x: 55, y: 0, z: 0, width: 0.3, height: 3, depth: 100 },
  { x: 0, y: 0, z: -48, width: 110, height: 3, depth: 0.3 },
  { x: 0, y: 0, z: 48, width: 110, height: 3, depth: 0.3 },
]
