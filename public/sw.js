/**
 * 华盾AI Web 管理后台 — Service Worker
 *
 * 缓存策略（三层分级）：
 * ┌─────────────────────┬──────────────────┬─────────────────────┐
 * │ 资源类型             │ 策略              │ 更新方式             │
 * ├─────────────────────┼──────────────────┼─────────────────────┤
 * │ JS/CSS (assets/)    │ Cache-First      │ 构建后 content-hash  │
 * │ 字体/图片            │ Cache-First      │ hash 变化自动更新    │
 * │ API (/api/)         │ Network-First    │ 网络优先，离线降级   │
 * │ HTML (导航请求)      │ Network-First    │ 确保获取最新版本     │
 * └─────────────────────┴──────────────────┴─────────────────────┘
 *
 * 版本管理：通过 CACHE_VERSION 控制，构建时自动更新
 */

// ⚠️ 构建时由 vite-plugin 替换为实际版本号
const CACHE_VERSION = 'v1.0.0'

// 静态资源缓存（content-hash 命名 → 永久有效）
const STATIC_CACHE = `static-${CACHE_VERSION}`

// 动态资源缓存（API 响应等，有 TTL）
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`

// ============================================================
// Install — 预缓存关键资源
// ============================================================
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${CACHE_VERSION}...`)

  // skipWaiting：新 SW 立即激活，不等旧 SW 释放
  self.skipWaiting()

  // 预缓存入口 HTML（确保离线可访问）
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll([
        '/', // 根路径
        '/index.html',
      ]).catch((err) => {
        console.warn('[SW] Pre-cache failed (non-critical):', err)
      })
    })
  )
})

// ============================================================
// Activate — 清理旧版本缓存
// ============================================================
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${CACHE_VERSION}...`)

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // 删除不是当前版本的缓存
            return name.startsWith('static-') || name.startsWith('dynamic-')
              ? name !== STATIC_CACHE && name !== DYNAMIC_CACHE
              : false
          })
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`)
            return caches.delete(name)
          })
      )
    }).then(() => {
      // claim：接管所有打开的页面
      return self.clients.claim()
    })
  )
})

// ============================================================
// Fetch — 请求拦截与缓存策略
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 跳过非 GET 请求
  if (request.method !== 'GET') return

  // 跳过 chrome-extension
  if (url.protocol === 'chrome-extension:') return

  // ── 策略 1: 静态资源 Cache-First ──
  if (
    url.pathname.startsWith('/assets/') || // JS/CSS chunks
    /\.(js|css|woff2?|ttf|svg|png|jpg|webp|ico|gz|br)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // ── 策略 2: API Network-First ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE))
    return
  }

  // ── 策略 3: HTML 导航请求 Network-First ──
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE))
    return
  }

  // ── 默认: Network-First ──
  event.respondWith(networkFirst(request, DYNAMIC_CACHE))
})

// ============================================================
// 缓存策略实现
// ============================================================

/**
 * Cache-First：优先从缓存读取，缓存缺失时回退网络
 * 适用于 content-hash 命名的静态资源（文件名变化 = 内容变化）
 */
async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // 离线且无缓存 → 返回 fallback
    return new Response('Offline', { status: 503 })
  }
}

/**
 * Network-First：优先从网络获取，失败时回退缓存
 * 适用于 API 和 HTML 导航请求
 */
async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached

    // 完全离线 → 返回离线页面
    return new Response(
      '<html><body><h1>离线状态</h1><p>请检查网络连接后重试</p></body></html>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    )
  }
}

// ============================================================
// 类型声明（Service Worker 环境）
// ============================================================
declare const self: ServiceWorkerGlobalScope
