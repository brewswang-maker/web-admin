/**
 * authedFetch — 带鉴权头的 fetch 薄封装（统一治理裸 fetch 鉴权遗漏）
 * utils/authedFetch.ts
 *
 * [FIX roi-snapshot-401 2026-10-07] 背景:
 *   box-sdk 的 HttpAuthGate 除白名单 (/healthz、/api/v1/auth/login、
 *   /api/v1/auth/register、/api/v1/gb28181/snapshot-upload、/VIID/Persons/)
 *   外, 其余接口一律要求 `Authorization: Bearer <token>`。而该头只由 http.ts
 *   的 axios 请求拦截器自动注入。凡绕过 axios 直接用原生 `fetch('/api...')`
 *   的调用都不带 token → 401, 表现为「ROI 快照取不到 / 绊线下拉恒空 / 模型
 *   列表空 / LLM 状态取不到」等静默失效 (credentials:'include' 只发 cookie,
 *   本系统鉴权是 js-cookie 存的 token 经 Bearer 头传, 二者不同源)。
 *
 * 约定: 所有对受保护 /api 的原生 fetch 一律走本函数。它:
 *   1) 自动补 `Authorization: Bearer <getAuthToken()>` (与 http.ts 同源);
 *   2) 默认 `credentials: 'include'` (调用方可覆盖);
 *   3) 保留调用方已有的 header; 调用方自带 Authorization 时不覆盖;
 *   4) FormData 场景不触碰 Content-Type, 交由浏览器生成 multipart 边界。
 */
import { getAuthToken } from '@/utils/auth'

export function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { credentials: 'include', ...init, headers })
}

export default authedFetch
