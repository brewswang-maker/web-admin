/**
 * [FIX face-edit-preview 2026-09-20] 人脸库图片 URL 解析 SSOT。
 *
 * 背景: 后端 faceRecordToJson (box-sdk RestApiHandlers.cpp L28779) 明确不再内嵌
 *   base64 — image_data/snapshot_base64 恒为空, 唯一可靠来源是 image_path
 *   (= /face_images/<person_id>.jpg; 设备 nginx location ^~ /face_images/
 *   alias /data/shield/face_images/ 直出, 三端口 80/8088/8090 均配置)。
 *
 * 历史缺陷: 人脸编辑页把 image_path 拼成 '/api/v1' + image_path → 经 /api/ 反代到
 *   box-sdk:18080, 而 box-sdk 无该静态路由 → 404 → 编辑表单预览空白。
 *   真机取证: GET /face_images/x.jpg = 200, GET /api/v1/face_images/x.jpg = 404。
 */

/** 人脸记录图片 URL 解析 (兼容历史内嵌 base64 / 绝对 URL / 相对 nginx 路径) */
export function resolveFaceImageUrl(rec: { image_data?: string; image_path?: string } | null | undefined): string {
  if (!rec) return ''
  const inline = (rec.image_data || '').trim()
  if (inline) return inline            // 兼容历史内嵌 base64 (data:image/...)
  const path = (rec.image_path || '').trim()
  if (!path) return ''
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path
  return path.startsWith('/') ? path : `/${path}`
}
