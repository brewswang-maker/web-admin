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
      warmup: {
        clientFiles: [
          './src/main.ts',
          './src/App.vue',
          './src/views/DashboardView.vue',
        ],
      },
      proxy: {
        // box-sdk 后端 API 代理（设备/系统/通道/流/告警等所有业务API）
        // 开发环境代理到 shieldbox 后端 (18080端口, box_config_v6.json)
        '/api/v1': {
          target: 'http://127.0.0.1:18080',
          changeOrigin: true,
          // 优化代理性能
          configure: (proxy) => {
            proxy.on('proxyReq', (_proxyReq, _req, _res) => {
              // no-op
            })
            proxy.options.timeout = 0
            proxy.options.proxyTimeout = 30000
          },
        },
        '/ws': {
          target: 'ws://127.0.0.1:18080',
          ws: true,
          changeOrigin: true,
        },
        // box-sdk 快照文件代理（与/api/v1指向同一后端，/snapshots/路径提供JEPG文件）
        '/snapshots': {
          target: 'http://127.0.0.1:18080',
          changeOrigin: true,
        },
        // ZLM HTTP-FLV 播放代理
        '/rtp': {
          target: 'http://127.0.0.1:9080',
          changeOrigin: true,
          // HTTP-FLV 是无限流式响应，必须禁用代理超时
          configure: (proxy) => {
            proxy.on('proxyReq', (_proxyReq, _req, _res) => {
              // no-op: disable default timeout handling for streaming
            })
            proxy.options.timeout = 0
            proxy.options.proxyTimeout = 0
          },
        },
        // ZLM WebRTC 信令代理
        '/index/api/webrtc': {
          target: 'http://127.0.0.1:9080',
          changeOrigin: true,
        },
      },
    },

    // ─── 生产构建 ────────────────────────────────
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
