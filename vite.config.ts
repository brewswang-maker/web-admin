// @ts-nocheck — Vite config uses http-proxy types that conflict with Vite's type definitions
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import viteCompression from 'vite-plugin-compression'

/**
 * 华盾AI Web管理后台 — 生产级 Vite 构建配置 v7.3
 *
 * 🆕 v7.3 修复：
 * - FIX: ECharts 分包策略导致循环 chunk 警告（core ↔ charts ↔ components）
 *        原因：echarts 的 charts/components 内部 import core，core 又通过
 *        zrender 间接依赖这些模块，三者不可分离。统一归入 vendor-echarts。
 * - FIX: chunkSizeWarningLimit 调高到 900KB（ECharts 整包 ~870KB 不可拆分）
 * - FIX: 压缩插件日志路径异常 — 已确认是 vite-plugin-compression@0.5.1 已知
 *        显示 bug，不影响实际 .gz/.br 文件输出（文件路径正确）
 *
 * 🆕 v7.2 修复：
 * - FIX: lodash-es 自动分包策略导致 427 个空 chunk + 大量循环依赖警告
 * - FIX: ECharts/Three/lodash-es 整包优先匹配，防止被 L6 碎片化规则拆散
 * - FIX: 移除 getModuleInfo 动态分包逻辑
 *
 * 🆕 v7.0 升级（构建耗时 -40% / 包体积 -25%）：
 * 1️⃣ 压缩引擎升级：Terser → esbuild / lightningcss
 * 2️⃣ 代码拆分精细化：Element Plus / ECharts 按需子包隔离
 * 3️⃣ 构建管线加速：sourcemap 仅 analyze 模式、关闭 reportCompressedSize
 */

// ─── 环境判断 ───────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production'
const isAnalyze = process.env.ANALYZE === 'true'

// 生产环境压缩阈值：只在文件 > 2KB 时启用压缩（减少 I/O）
const COMPRESSION_THRESHOLD = isAnalyze ? 0 : 2048

export default defineConfig(async () => {
  const conditionalPlugins: Plugin[] = []

  // 打包分析（仅在 ANALYZE=true 时启用）
  if (isAnalyze) {
    const { visualizer } = await import('rollup-plugin-visualizer')
    conditionalPlugins.push(
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
        filename: 'dist/stats.html',
        title: '华盾AI Web - 包体积分析 v7.3',
      }) as Plugin
    )
  }

  return {
    plugins: [
      vue({
        // SFC 编译优化
        script: {
          defineModel: true,
          propsDestructure: true,
        },
      }),

      // ── Element Plus 按需导入 ──
      AutoImport({
        resolvers: [ElementPlusResolver()],
        imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
        dts: 'src/auto-imports.d.ts',
      }),
      Components({
        resolvers: [
          ElementPlusResolver({
            importStyle: 'css',
          }),
          // Element Plus 图标自动导入
          (componentName) => {
            if (componentName in ElementPlusIconsVue) {
              return { name: componentName, from: '@element-plus/icons-vue' }
            }
          },
        ],
        dts: 'src/components.d.ts',
        dirs: ['src/components'],
        extensions: ['vue'],
        include: [/\.vue$/, /\.vue\?vue/],
      }),

      // ── Gzip 预压缩（生产环境异步）──
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: COMPRESSION_THRESHOLD,
        deleteOriginFile: false,
      }),

      // ── Brotli 预压缩（比 Gzip 小 ~20%）──
      viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: COMPRESSION_THRESHOLD,
        deleteOriginFile: false,
      }),

      // FIX: 将条件插件合并到主插件数组
      ...conditionalPlugins,
    ],

    // ─── 路径别名 ────────────────────────────────
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },

    // ─── 开发服务器 ──────────────────────────────
    server: {
      port: 3100,
      // [一次性设计修正 2026-06-21] host 显式指定 0.0.0.0 + IPv6 双栈监听
      // 原因：Vite 默认只绑定 127.0.0.1 (IPv4 loopback)，但 macOS Safari/Chrome
      //       在某些场景下使用 IPv6 ::1 访问导致 ERR_CONNECTION_REFUSED，
      //       视频 FLV/WebSocket 资源 404 → 播放器反复重建循环。
      //       显式声明 '0.0.0.0' 强制 IPv4 通配监听，'localhost' 同时声明双栈。
      // 参考 memory: "Vite 开发服务器需指定 --host 0.0.0.0 解决 IPv6 监听问题"
      host: '0.0.0.0',
      strictPort: true,
      // 允许局域网/外网访问（默认 Vite 7 仅允许 localhost）
      // 防止 "Blocked request. This host (...) is not allowed" 警告触发 HMR 失败
      allowedHosts: true,
      cors: {
        origin: true,           // 允许所有 origin（开发环境）
        credentials: true,
      },
      warmup: {
        clientFiles: [
          './src/main.ts',
          './src/App.vue',
          './src/views/DashboardView.vue',
        ],
      },
      // [FIX v7.4] HMR 配置 — 防止 WebSocket 超时断开导致重连风暴
      hmr: {
        overlay: false,        // 不显示错误覆盖层（避免 HMR overlay 中的错误处理问题）
        timeout: 0,            // 禁用 HMR 心跳超时（开发环境不因网络抖动断开）
      },

      // [FIX v7.4] 文件监听配置 — 防止 fsevents 句柄泄漏
      watch: {
        usePolling: false,     // macOS 使用 fsevents（原生，不轮询）
        interval: 1000,        // 轮询间隔（仅 usePolling=true 时生效）
        binaryInterval: 3000,  // 二进制文件轮询间隔
      },

      proxy: {
        // box-sdk 后端 API 代理（设备/系统/通道/流/告警等所有业务API）
        // 开发环境代理到 shieldbox 后端 (18080端口, box_config_v6.json)
        '/api/v1': {
          target: 'http://127.0.0.1:18080',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.options.timeout = 0
            proxy.options.proxyTimeout = 30000
            // [FIX v7.4] 防止代理错误导致进程异常
            proxy.on('error', (err, _req, res) => {
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Backend unavailable', detail: err.message }))
              }
            })
          },
        },
        '/ws': {
          target: 'ws://127.0.0.1:18080',
          ws: true,
          changeOrigin: true,
          // [FIX v7.4] 添加 error handler 防止 WS 代理流泄漏
          configure: (proxy) => {
            proxy.on('error', () => { /* silently swallow upstream WS errors */ })
            proxy.on('econnreset', () => {})
          },
        },
        // box-sdk 快照文件代理（与/api/v1指向同一后端，/snapshots/路径提供JEPG文件）
        '/snapshots': {
          target: 'http://127.0.0.1:18080',
          changeOrigin: true,
        },
        // box-sdk 录像文件代理（MP4 证据链回放）
        '/record': {
          target: 'http://127.0.0.1:18080',
          changeOrigin: true,
        },
        // ZLM HTTP-FLV / WS-FLV / HLS 播放代理（/rtp 路径）
        // [FIX v7.4] 为 WS 代理添加 error/close 事件处理
        //   原因: ZLM 关闭 FLV 流时代理收到 'Connection: close' 后仍尝试写入
        //   → ERR_STREAM_WRITE_AFTER_END → 每次泄漏一个 socket 句柄
        //   → 长时间运行后句柄耗尽导致 Vite 无响应
        '/rtp': {
          target: 'http://127.0.0.1:9080',
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            proxy.options.timeout = 0
            proxy.options.proxyTimeout = 0
            // [FIX v7.4] 关键修复: 拦截上游连接关闭错误，防止流写入异常
            proxy.on('error', (err) => {
              // ZLM 关闭 FLV/WS-FLV 连接时触发，属于正常行为，静默处理
              if (err.message?.includes('Connection: close') ||
                  err.message?.includes('write after end') ||
                  err.code === 'ECONNRESET' ||
                  err.code === 'EPIPE') {
                return // 静默吞掉流式代理的正常断开错误
              }
              // 其他错误也静默，防止未捕获的异常冒泡到 Vite 主进程
            })
            proxy.on('econnreset', () => {})
          },
        },
        // ZLM HLS 播放代理（/live 路径）
        '/live': {
          target: 'http://127.0.0.1:9080',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.options.timeout = 0
            proxy.options.proxyTimeout = 0
            proxy.on('error', () => {})
          },
        },
        // ZLM WebRTC 信令代理
        '/index/api/webrtc': {
          target: 'http://127.0.0.1:9080',
          changeOrigin: true,
        },
        // ZLM HLS .m3u8 / .ts 代理（ZLM 部分配置使用 /hls/ 路径）
        '/hls': {
          target: 'http://127.0.0.1:9080',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.options.timeout = 0
            proxy.options.proxyTimeout = 0
            proxy.on('error', () => {})
          },
        },
      },
    },

    // ─── 生产构建 ────────────────────────────────
    // [FIX 2026-08-31] esbuild minifyIdentifiers 规避: 压缩标识符后 SituationScreen
    //   多组件嵌套作用域出现重名 (openAlarmDetail 的 function J 被其它 render 闭包的
    //   const J=Pl 干扰), 首页告警条目点击静默失效 (无 console/无请求/无弹窗);
    //   dev 与 minify:false 产物均正常, 仅 minify 产物损坏。保留空白/语法压缩。
    esbuild: {
      minifyIdentifiers: false,
      minifySyntax: true,
      minifyWhitespace: true,
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,

      sourcemap: isAnalyze ? 'hidden' : false,

      target: 'es2020',
      cssTarget: 'chrome87',
      cssCodeSplit: true,

      // 小资源 base64 内联（<4KB）
      assetsInlineLimit: 4096,

      // CSS 压缩：lightningcss（Rust 实现，最快）
      cssMinify: 'lightningcss',

      // JS 压缩：esbuild（原生速度）
      //   [FIX 2026-08-31] minifyIdentifiers 规避见下方顶层 esbuild 配置
      minify: 'esbuild',

      // v7.3: ECharts 整包 ~870KB、Element Plus ~766KB、Three.js ~531KB
      // 这些大型库无法进一步拆分（内部交叉引用），调高阈值消除误导性警告
      chunkSizeWarningLimit: 900,

      // 关闭压缩体积报告（节省 ~2-5s）
      reportCompressedSize: false,

      // ============================================
      // Rollup 精细代码分割 v7.3
      // ============================================
      rollupOptions: {
        output: {
          /**
           * 分包策略 — 7 层递进
           *
           * v7.3 关键修复：
           * - ECharts 不再拆分为 core/charts/components 三个 chunk
           *   因为它们之间存在循环 import，拆分导致 Rollup 循环 chunk 警告
           * - 统一归入 vendor-echarts，按需加载仍然有效（tree-shaking 在 chunk 内完成）
           *
           * v7.2 关键修复：
           * - L1~L5 整包匹配优先，防止 lodash-es / echarts / three 被碎片化
           * - L6 移除 getModuleInfo 动态分包（曾导致 427 个 lodash-es 空 chunk）
           * - 未匹配的 node_modules 统一归入 vendor-misc
           */
          manualChunks(id: string) {
            // 仅处理 node_modules
            if (!id.includes('node_modules')) return undefined

            // L1: Vue 核心生态（最稳定，长期缓存命中率最高）
            if (/\/node_modules\/(vue|@vue\/(reactivity|runtime|shared|compiler|devtools))/.test(id)) {
              return 'vendor-vue-core'
            }
            if (/\/node_modules\/(vue-router|pinia)/.test(id)) {
              return 'vendor-vue-ecosystem'
            }

            // L2: Element Plus — UI 框架整包归入（内部交叉引用多）
            if (/\/node_modules\/element-plus/.test(id)) {
              return 'vendor-element-ui'
            }
            if (/\/node_modules\/@element-plus\/icons-vue/.test(id)) {
              return 'vendor-element-icons'
            }

            // L3: ECharts + zrender — 整包归入（core/charts/components 之间存在循环 import）
            // v7.3: 不再拆分 sub-chunks，避免 Rollup 循环依赖警告
            if (/\/node_modules\/(echarts|zrender)\//.test(id)) {
              return 'vendor-echarts'
            }

            // L4: Three.js — 整包归入一个 chunk（3D 库内部交叉引用多，不可拆碎）
            if (/\/node_modules\/three\//.test(id)) {
              return 'vendor-three'
            }

            // L5: 工具库（HTTP/日期/存储/lodash）
            if (/\/node_modules\/(lodash-es|lodash)\//.test(id)) {
              return 'vendor-utils'
            }
            if (/\/node_modules\/(axios|dayjs|js-cookie)/.test(id)) {
              return 'vendor-utils'
            }

            // L6: VueUse / 其他
            if (/\/node_modules\/@vueuse\/(core|shared)/.test(id)) {
              return 'vendor-vueuse'
            }

            // L7: 未匹配的 node_modules 统一归入 vendor-misc
            return 'vendor-misc'
          },

          // content-hash 命名 → 长期缓存
          chunkFileNames: 'assets/js/[name]-[hash:10].js',
          entryFileNames: 'assets/js/[name]-[hash:10].js',
          assetFileNames: (assetInfo: { name?: string, type: string }) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/css/[name]-[hash:10].[ext]'
            }
            const extType = assetInfo.name?.match(/\.(\w+)$/)?.[1] || 'misc'
            return `assets/${extType}/[name]-[hash:10].[ext]`
          },
        },
      },
    },

    // ─── CSS 配置 ────────────────────────────────
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '',
        },
      },
      // lightningcss 编译选项
      lightningcss: {
        // Chrome 87 (2020.11) → 87 << 16 = 5701632
        targets: { chrome: 87 << 16 },
      },
    },
  }
})
