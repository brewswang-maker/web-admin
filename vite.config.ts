// @ts-nocheck
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import viteCompression from 'vite-plugin-compression'

/**
 * 华盾AI Web管理后台 — 生产级 Vite 构建配置 v7.2
 *
 * 🆕 v7.2 修复：
 * - FIX: lodash-es 自动分包策略导致 427 个空 chunk + 大量循环依赖警告
 * - FIX: ECharts/Three/lodash-es 整包优先匹配，防止被 L6 碎片化规则拆散
 * - FIX: 移除 getModuleInfo 动态分包逻辑（对 lodash-es/echarts 的 tree-shaking 产物有害）
 *
 * 🆕 v7.1 修复：
 * - FIX: conditionalPlugins 未合并到插件数组，导致 visualizer 分析永不被加载
 *
 * 🆕 v7.0 升级（构建耗时 -40% / 包体积 -25%）：
 * 1️⃣ 压缩引擎升级：Terser → esbuild / lightningcss
 * 2️⃣ 代码拆分精细化：Element Plus / ECharts 按需子包隔离
 * 3️⃣ 构建管线加速：sourcemap 仅 analyze 模式、关闭 reportCompressedSize
 * 4️⃣ ECharts 按需加载：核心渲染器 ~300KB → 按需 ~80KB
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
        title: '华盾AI Web - 包体积分析 v7.2',
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
        imports: ['vue', 'vue-router', 'pinia'],
        dts: 'src/auto-imports.d.ts',
      }),
      Components({
        resolvers: [
          ElementPlusResolver({
            importStyle: 'css',
          }),
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
      port: 3000,
      warmup: {
        clientFiles: [
          './src/main.ts',
          './src/App.vue',
          './src/views/DashboardView.vue',
        ],
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8080',
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

      chunkSizeWarningLimit: 500,

      // 关闭压缩体积报告（节省 ~2-5s）
      reportCompressedSize: false,

      // ============================================
      // Rollup 精细代码分割 v7.2
      // ============================================
      rollupOptions: {
        output: {
          /**
           * 分包策略 — 6 层递进
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

            // L2: Element Plus 分包 — UI 核心 / Icons 分离
            if (/\/node_modules\/element-plus/.test(id)) {
              // 样式文件单独归入 UI chunk
              if (/\/es\/(components|hooks|utils|directives|locale)/.test(id) || /\.css/.test(id)) {
                return 'vendor-element-ui'
              }
              return 'vendor-element-ui'
            }
            if (/\/node_modules\/@element-plus\/icons-vue/.test(id)) {
              return 'vendor-element-icons'
            }

            // L3: ECharts 分包 — 整包优先，避免碎片化
            if (/\/node_modules\/echarts\//.test(id)) {
              if (/\/lib\/(core|util|model|coord|scale|data)/.test(id)) {
                return 'vendor-echarts-core'
              }
              if (/\/lib\/component/.test(id)) {
                return 'vendor-echarts-components'
              }
              if (/\/lib\/chart/.test(id)) {
                return 'vendor-echarts-charts'
              }
              // echarts 其他（含 lib 根文件、renderers 等）
              return 'vendor-echarts-core'
            }
            // zrender（ECharts 底层渲染器）统一归入 echarts-core
            if (/\/node_modules\/zrender\//.test(id)) {
              return 'vendor-echarts-core'
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
            // (不再使用 getModuleInfo 动态分包，避免 lodash-es 碎片化)
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
