/**
 * streamUrl.ts — 视频流 URL 规范化工具
 *
 * 核心问题：后端 ZLM 适配器生成的播放 URL 是绝对路径
 *   (http://127.0.0.1:9080/rtp/gb_xxx.live.flv)，
 * 浏览器从 http://localhost:3100 发起 flv.js fetch/XHR 时属于跨域请求，
 * ZLM 未配置 CORS 头 → 请求被浏览器拦截 → 播放器无数据 → 黑屏。
 *
 * 解决方案：将所有 ZLM HTTP/WS 绝对 URL 转换为相对路径，
 * 让请求走 Vite 开发代理（/rtp → 127.0.0.1:9080, /live → 127.0.0.1:9080），
 * 消除 CORS 问题。
 *
 * 对标海康 iVMS / 大华 DSS：客户端内部统一用相对路径访问流媒体，
 * 由 Nginx/Vite 代理统一转发到流媒体引擎。
 */

/**
 * 将 ZLM 绝对 URL 转为相对路径（仅保留 path + query）
 *
 * 示例：
 *   http://127.0.0.1:9080/rtp/gb_001.live.flv  → /rtp/gb_001.live.flv
 *   ws://127.0.0.1:9080/rtp/gb_001.live.flv     → /rtp/gb_001.live.flv
 *   http://192.168.1.100:9080/live/cam1/hls.m3u8 → /live/cam1/hls.m3u8
 *   /rtp/gb_001.live.flv (已是相对路径)           → /rtp/gb_001.live.flv (不变)
 *   rtsp://127.0.0.1:554/live/cam1              → rtsp://127.0.0.1:554/live/cam1 (RTSP保持原样)
 */
export function normalizeStreamUrl(url: string): string {
  if (!url || typeof url !== 'string') return ''

  // RTSP/RTMP 协议保持原样（不走 HTTP 代理，由原生播放器或后端代理处理）
  if (url.startsWith('rtsp://') || url.startsWith('rtmp://')) {
    return url
  }

  // WebRTC 信令 URL 保持原样（由 /index/api/webrtc 代理处理）
  if (url.startsWith('webrtc://')) {
    return url
  }

  // 已经是相对路径（以 / 开头），直接返回
  if (url.startsWith('/')) {
    return url
  }

  // 尝试解析 URL，提取 path 部分
  // 匹配 http(s)://host:port/path 或 ws(s)://host:port/path
  const match = url.match(/^[a-z]+:\/\/[^/]+(.*)$/i)
  if (match && match[1]) {
    return match[1]
  }

  // 无法识别格式，原样返回
  return url
}

/**
 * 将 WS-FLV 绝对 URL 转换为基于当前页面 origin 的 WebSocket URL
 *
 * 示例：
 *   ws://127.0.0.1:9080/rtp/gb_001.live.flv → ws://localhost:3100/rtp/gb_001.live.flv
 *   （通过 Vite 代理 /rtp(ws:true) → ws://127.0.0.1:9080）
 *
 * 如果 URL 已经是相对路径，用当前页面协议补全
 */
export function normalizeWsFlvUrl(url: string): string {
  if (!url) return ''

  const normalized = normalizeStreamUrl(url)

  // 用当前页面协议构建 WS URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalized}`
}

/**
 * 批量规范化流 URL 字典
 */
export function normalizeStreamUrls<T extends Record<string, string>>(
  urls: T,
): T {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(urls)) {
    if (key === 'ws-flv' || key === 'wsFlvUrl' || key === 'ws_flv_url') {
      result[key] = normalizeWsFlvUrl(value)
    } else {
      result[key] = normalizeStreamUrl(value)
    }
  }
  return result as T
}
