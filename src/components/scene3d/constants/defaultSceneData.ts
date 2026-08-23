/**
 * 华盾AI智能视频盒子 v7.0 - 默认场景数据（体育场）
 * components/scene3d/constants/defaultSceneData.ts
 *
 * @description Scene3D 组件的默认设备和建筑数据（当 props 未传入时使用）。
 * 数据来源与 box-sdk/config/scene_config.json 的 stadium 场景逐字段一致
 * （基于 Stadium/ 目录 5 张实景照片校准，v1.1: 塔桅对称化/水滴演艺厅南移中轴/
 * 波浪馆东南/训练场东北/综合配套楼加高；v1.5.0 场外建筑删除，
 * v1.9.5 场外演示设备点位同步删除）。
 * 与内置应用端 StadiumSceneData.js 保持同 id/同命名/同坐标。
 */

import type { Device3DNode, Building3DNode } from '../types/scene3d'

// ════════════════════════════════════════════════════
// ── 默认设备数据（11 个体育场馆内摄像点位）──
// [v1.9.5] 删 8 处场外配套区点位（喷泉广场/广告大屏/配套楼顶/停车场×2/
// 滨水步道/波浪馆/训练场）：对应场外建筑 v1.5.0 已删，设备悬空孤点。
// 保留馆内 11 台：主入口/看台×4/内场/塔桅/球门灯光带×4。
// [WEB-GLB v1.9.0→v1.9.2] 球门 4 点位 demo-cam16~19 (两端×两侧):
// 草坪 52.5×34 (GLB 105×68 × modelScale 0.5), 球门在 x=±26.25 端线;
// (±24, 27.5, ±14): z=±14 在球门柱(±3.66)两侧; 旧 y=16 位于屋盖下表面
// (实测 y≈26) 之下被完全遮挡不可见, v1.9.2 上移至屋盖灯光带 y=27.5
// (设备底 26.9 > 屋盖上表面 东26.25/西26.43, 不穿模, raycast 验证);
// rotation = atan2(dx, -dz) 朝场心, 四端数据逐字段一致。
// ════════════════════════════════════════════════════

export const DEFAULT_DEVICES: Device3DNode[] = [
  { id: 'demo-cam1', name: 'CAM_01 主入口', x: 0, y: 5, z: 24, status: 'online', location: '主入口广场', fov: 70, rotation: 0 },
  { id: 'demo-cam5', name: 'CAM_05 看台A区', x: 0, y: 13, z: -32, status: 'online', location: '看台A区高点', fov: 65, rotation: 0 },
  { id: 'demo-cam6', name: 'CAM_06 看台B区', x: 26, y: 13, z: -8, status: 'alarm', location: '看台B区高点', alarmType: '人群聚集', fov: 65, rotation: -1.571 },
  { id: 'demo-cam7', name: 'CAM_07 看台C区', x: 0, y: 13, z: 16, status: 'online', location: '看台C区高点', fov: 65, rotation: 3.142 },
  { id: 'demo-cam8', name: 'CAM_08 看台D区', x: -26, y: 13, z: -8, status: 'online', location: '看台D区高点', fov: 65, rotation: 1.571 },
  { id: 'demo-cam9', name: 'CAM_09 内场', x: 0, y: 4, z: -8, status: 'online', location: '内场草坪', fov: 80, rotation: 3.142 },
  { id: 'demo-cam10', name: 'CAM_10 塔桅全景', x: -16, y: 20, z: -30, status: 'online', location: '塔桅2全景', fov: 90, rotation: 0 },
  { id: 'demo-cam16', name: 'CAM_16 东球门南侧', x: 24, y: 27.5, z: -14, status: 'online', location: '东球门灯光带南侧', fov: 70, rotation: -2.099 },
  { id: 'demo-cam17', name: 'CAM_17 东球门北侧', x: 24, y: 27.5, z: 14, status: 'online', location: '东球门灯光带北侧', fov: 70, rotation: -1.043 },
  { id: 'demo-cam18', name: 'CAM_18 西球门南侧', x: -24, y: 27.5, z: -14, status: 'maintenance', location: '西球门灯光带南侧', fov: 70, rotation: 2.099 },
  { id: 'demo-cam19', name: 'CAM_19 西球门北侧', x: -24, y: 27.5, z: 14, status: 'alarm', location: '西球门灯光带北侧', alarmType: '禁区闯入', fov: 70, rotation: 1.043 },
]

// ════════════════════════════════════════════════════
// ── 默认建筑数据（体育场元素清单 A1~G1）──
// ════════════════════════════════════════════════════

// [WEB-GLB 2026-08-21] 场景周边示意元素全部删除; 主体育场内壳保留 (与 GLB 互补)。
// GLB 是体育场外壳 + 屋顶, 但内场 (草坪/跑道/大屏/连廊) 是黑色空块,
// 需要参数化补足看起来才是完整体育场。
// GLB scale=0.5, 真实 Lusail 草坪 105×68m → 渲染 52.5×34m, 因此 pitch rx=26, rz=17
// [WEB-GLB 2026-08-21] 方案 A (1:1 Lusail 内场 + 性能优化) — 仅保留体育场内核心元素 + GLB
// 周边示意/风格化散件全部删除; track 删除 (Lusail 是 FIFA 专用足球场, 无田径跑道)
// pitch rx=26 rz=17 完美对应 GLB scale=0.5 后的真实草坪 105×68m → 52.5×34m
// [WEB-GLB 2026-08-21] v1.5.0 GLB 坐标深度校正:
// GLB 是碗型模型 (看台底 y=0 / 草皮 y=29 / 顶棚 y=47.6).
// 原 v1.4.0 modelOffsetY=-4.5 让草皮悬空 y=10、看台埋地 y=-4.5;
// 修正为 modelOffsetY=0 让看台底贴地, 草皮在 y=14.5 被看台环绕 (碗型).
// 删除 player-tunnel-s (与 GLB cabin_2 重叠, 导致替补席显示在球场上).
// LED 大屏移到看台顶部 4 角 (x=±28, z=±15, y=18).
export const DEFAULT_BUILDINGS: Building3DNode[] = [
  // [WEB-GLB 2026-08-21] v1.5.0 全面修正: 完全依赖 GLB 提供体育场内元素
  // 原 GLB 是 Al Wakrah Stadium (卡塔尔 2022 世界杯, Sketchfab yu.gi_oh2011, CC-BY-NC-SA-4.0)
  // GLB 已含: 草坪 + 标线 + 球门 + 角旗 + 5 层看台 + 球员更衣室 (66 meshes)
  // 仅追加: 4 块 LED 大屏 (放看台顶部 4 角)
  // GLB 看台底在 y=0, modelOffsetY=0 让看台底贴到场景地面
  { id: 'stadium-glb-ref', name: 'Al Wakrah 体育场 (GLB)', shape: 'model', x: 0, z: 0,
    modelUrl: '/models/stadium.glb', modelScale: 0.5, modelOffsetY: 0, modelRotationDeg: 0, decor: false },
  // 4 块 LED 大屏 (看台顶部 4 角, GLB 没有)
  { id: 'scoreboard-ne', name: '东北 LED 大屏', shape: 'board', x:  28, z:  15, y: 18, w: 14, h: 7, color: '#0B1220', emissive: '#2A6BFF', thetaDeg: -103 },
  { id: 'scoreboard-nw', name: '西北 LED 大屏', shape: 'board', x: -28, z:  15, y: 18, w: 14, h: 7, color: '#0B1220', emissive: '#2A6BFF', thetaDeg: 103 },
  { id: 'scoreboard-se', name: '东南 LED 大屏', shape: 'board', x:  28, z: -15, y: 18, w: 14, h: 7, color: '#0B1220', emissive: '#2A6BFF', thetaDeg: -77 },
  // [WEB-GLB v1.9.0] thetaDeg: 绕 Y 朝向角(度), BoxGeometry 正面朝 +z,
  // 旋转后朝 (sinθ, 0, cosθ) — 朝场心角(ne≈-118°/se≈-62°)± 15° 偏向观众席;
  // 与 scene_config.json / StadiumSceneData.js 双端同源
  { id: 'scoreboard-sw', name: '西南 LED 大屏', shape: 'board', x: -28, z: -15, y: 18, w: 14, h: 7, color: '#0B1220', emissive: '#2A6BFF', thetaDeg: 77 }
]

// ════════════════════════════════════════════════════
// ── 默认围墙数据（体育场周界 ±62/±52）──
// ════════════════════════════════════════════════════

export const DEFAULT_FENCES = [
  { x: -36, y: 0, z: 0, width: 0.3, height: 3, depth: 56 },
  { x: 36, y: 0, z: 0, width: 0.3, height: 3, depth: 56 },
  { x: 0, y: 0, z: -28, width: 72, height: 3, depth: 0.3 },
  { x: 0, y: 0, z: 28, width: 72, height: 3, depth: 0.3 },
]

/** 体育场场景地面/周界参数（与 scene_config.json 一致） */
export const STADIUM_SCENE_META = {
  ground: { width: 80, height: 55 },
  perimeter: { halfW: 35, halfD: 25 },
  rotationDeg: 0,
  decor: true,
}
