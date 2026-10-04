/**
 * @file faceEvidence.ts — 人脸取证图渲染源偏好 SSOT
 *
 * [FEAT face-scene-pref 2026-10-02] 领导口径: 人脸识别相关告警/通行记录的主展示图
 * 必须默认使用「现场快照/原图」(scene snapshot, 全帧 640 宽), 而非「人脸抓拍小图」
 * (face crop, ≤256px); 设置中心提供开关控制默认渲染源, 默认开启「使用快照原图」。
 *
 * 设计边界 (重要):
 * - 后端 (face 插件 sendAlarmNotification/通行链) 对每条人脸事件**同时独立落盘**
 *   两路取证文件: snapshot_url (人脸裁剪小图) + metadata.scene_url (现场快照原图),
 *   不二选一 — 本模块只决定**前端渲染源**, 关闭开关不丢任何一路取证文件。
 * - 偏好存 localStorage (纯渲染偏好, 每浏览器独立; 后端无 schema 变更)。
 * - 消费方: useAlarmTableHelpers.getSnapshotUrl (告警中心/态势屏/场景面板快照列)、
 *   AlarmPopup 画廊、FaceRealtimeView 实时卡片 + 通行记录表格。
 */

const FACE_SCENE_PREF_KEY = 'shieldbox.settings.faceEvidenceScene'

/** 开关是否开启 (默认 true = 使用快照原图; 读失败/无值/隐私模式均回落默认) */
export function faceScenePreferred(): boolean {
  try {
    const v = localStorage.getItem(FACE_SCENE_PREF_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

/** 写入开关 (设置中心切换时调用; 即时生效 — 消费方每次渲染重读) */
export function setFaceScenePreferred(v: boolean): void {
  try {
    localStorage.setItem(FACE_SCENE_PREF_KEY, v ? '1' : '0')
  } catch {
    // 存储不可用 (隐私模式/配额) 时静默 — 开关仍在本会话内由调用方持有 UI 态
  }
}

/** 相对路径 → 绝对 URL (与 types/alarm.ts toAbsoluteUrl / FaceRealtimeView
 *  normalizeSnapshotUrl 同口径: data:/http(s): 原样, / 补 origin, 裸路径补 /) */
function toAbsoluteUrl(u: string): string {
  if (!u) return ''
  if (u.startsWith('data:') || u.startsWith('http://') || u.startsWith('https://')) return u
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return u.startsWith('/') ? origin + u : origin + '/' + u
}

/** metadata 归一提取 (数组形态取首元素 — 与 normalizeAlarmCore gov 口径一致;
 *  兼容 snake/camel 双写), 返回绝对化的 scene_url; 无则空串 */
export function faceSceneUrlOf(row: any): string {
  let m = row?.metadata
  if (typeof m === 'string') {
    try { m = JSON.parse(m) } catch { return '' }
  }
  const gov: Record<string, unknown> = Array.isArray(m)
    ? (m[0] && typeof m[0] === 'object' ? m[0] : {})
    : (m && typeof m === 'object' ? m : {})
  const v = String((gov as any).scene_url ?? (gov as any).sceneUrl ?? '')
  return v ? toAbsoluteUrl(v) : ''
}

/** 人脸类告警判定: alarm_type 前缀 face_ 或 metadata 携带 scene_url (人脸链落盘标记)。
 *  非 face 告警不受开关影响 (行为插件三帧取证语义不同, 保持原渲染链)。 */
export function isFaceAlarmRow(row: any): boolean {
  const t = String(row?.type || row?.alarm_type || row?.alarmType || '').toLowerCase()
  if (t.startsWith('face')) return true
  return !!faceSceneUrlOf(row)
}

/** 人脸行主图解析 (开关感知): 开 = scene_url 优先 → fallback 兜底;
 *  关 = fallback 优先 (调用方传原行为结果) → scene_url 仍兜底 (不浪费已落盘证据)。
 *  fallback 为惰性求值函数, 避免关闭分支的重复计算。 */
export function resolveFaceEvidenceUrl(row: any, fallback: () => string): string {
  const scene = faceSceneUrlOf(row)
  if (faceScenePreferred()) {
    return scene || fallback()
  }
  return fallback() || scene
}
