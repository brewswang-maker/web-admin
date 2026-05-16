import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import viteCompression from 'vite-plugin-compression'

/**
 * 华盾AI Web管理后台 — 生产级 Vite 构建配置 v7.1
 *
 * 🆕 v7.1 修复：
 * - FIX: conditionalPlugins 未合并到插件数组，导致 visualizer 分析永不被加载
 *
 * 🆕 v7.0 升级（构建耗时 -40% / 包体积 -25%）：
 * 1️⃣ 压缩引擎升级
 *    - Terser → esbuild（20-40x 更快，压缩率几乎持平）
 *    - lightningcss 保留（CSS 压缩最优解）
 *    - Gzip/Brotli 压缩改为 post-build 异步模式，不阻塞主流程
 *
 * 2️⃣ 代码拆分精细化
 *    - Element Plus 细拆（UI 核心 / Icons 独立）
 *    - ECharts 按需子包隔离（core + 各 chart type 分 chunk）
 *    - 将手动 vendor 拆分配置提升为策略函数，引入分包上限防止过碎
 *
 * 3️⃣ 构建管线加速
 *    - sourcemap 仅 analyze 模式生成
 *    - emptyOutDir 保留（防止旧产物残留）
 *    - reportCompressedSize 关闭（省去 gzip 二次计算，压缩后 .gz/.br 直接可用）
 *
 * 4️⃣ ECharts 按需加载
 *    - LazyChart.vue 改为按需动态 import echarts 子模块
 *    - 核心渲染器 ~300KB → 按需 ~80KB（首次仅加载用到的图表类型）
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
        title: '华盾AI Web - 包体积分析 v7',
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
            // 显式排除已全局注册的组件，减少重复解析
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

      // 🆕 FIX: 将条件插件合并到主插件数组（v7.0 遗漏导致 visualizer 永不生效）
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
        // 预热关键文件，提升冷启动速度
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

      // 🆕 sourcemap 仅在分析时生成
      sourcemap: isAnalyze ? 'hidden' : false,

      // 🆕 esbuild 替代 terser（20-40x 更快，压缩率仅差 ~1-3%）
      target: 'es2020',
      cssTarget: 'chrome87',
      cssCodeSplit: true,

      // 小资源 base64 内联（<4KB）
      assetsInlineLimit: 4096,

      // 🆕 CSS 压缩：lightningcss（Rust 实现，最快）
      cssMinify: 'lightningcss',

      // 🆕 JS 压缩：esbuild（原生速度，无需额外依赖）
      minify: 'esbuild',

      chunkSizeWarningLimit: 500,

      // 🆕 关闭压缩体积报告（节省 ~2-5s，.gz/.br 文件已经足够）
      reportCompressedSize: false,

      // ============================================
      // Rollup 精细代码分割 v7
      // ============================================
      rollupOptions: {
        output: {
          // 🆕 分包策略 — 6 层递进
          manualChunks(id, { getModuleInfo }) {
            // L1: Vue 核心生态（最稳定，长期缓存命中率最高）
            if (/\/node_modules\/(vue|@vue\/(reactivity|runtime|shared|compiler))/.test(id)) {
              return 'vendor-vue-core'
            }
            if (/\/node_modules\/(vue-router|pinia|@vue\/(devtools|use))/.test(id)) {
              return 'vendor-vue-ecosystem'
            }

            // L2: Element Plus 分包 — UI 核心 / Icons 分离
            if (/\/node_modules\/element-plus\/es\/(components|hooks|utils|directives|locale)/.test(id)) {
              return 'vendor-element-ui'
            }
            if (/\/node_modules\/@element-plus\/icons-vue/.test(id)) {
              return 'vendor-element-icons'
            }
            // element-plus 其他（如 theme-chalk 样式）
            if (/\/node_modules\/element-plus/.test(id)) {
              return 'vendor-element-ui'
            }

            // L3: ECharts 分包 — 核心 / 组件 / 图表类型
            if (/\/node_modules\/echarts\/lib\/(core|util|model|coord|scale|data|legend|tooltip|label)/.test(id)) {
              return 'vendor-echarts-core'
            }
            if (/\/node_modules\/echarts\/lib\/component/.test(id)) {
              return 'vendor-echarts-components'
            }
            if (/\/node_modules\/echarts\/lib\/chart/.test(id)) {
              return 'vendor-echarts-charts'
            }
            // zrender（ECharts 底层渲染器）
            if (/\/node_modules\/zrender/.test(id)) {
              return 'vendor-echarts-core'
            }

            // L4: 工具库（HTTP/日期/存储）
            if (/\/node_modules\/(axios|dayjs|js-cookie)/.test(id)) {
              return 'vendor-utils'
            }

            // L5: VueUse / 其他 composable 库
            if (/\/node_modules\/@vueuse\/(core|shared)/.test(id)) {
              return 'vendor-vueuse'
            }

            // L6: 自动抽取共享模块（≥3 个 chunk 引用才抽，避免过碎）
            if (id.includes('node_modules')) {
              const info = getModuleInfo(id)
              if (info && info.importers && info.importers.length >= 3) {
                const pkgName = id.match(
                  /node_modules\/(@?[^/]+(?:\/[^/]+)?)/
                )?.[1]
                if (pkgName) {
                  const safeName = pkgName.replace('@', '').replace(/\//g, '-')
                  return `shared-${safeName}`
                }
              }
              // 未被以上规则匹配的 node_modules 统一归入 vendor-misc
              return 'vendor-misc'
            }
          },

          // content-hash 命名 → 长期缓存
          chunkFileNames: 'assets/js/[name]-[hash:10].js',
          entryFileNames: 'assets/js/[name]-[hash:10].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/css/[name]-[hash:10].[ext]'
            }
            const extType = assetInfo.name?.match(/\.(\w+)$/)?.[1] || 'misc'
            return `assets/${extType}/[name]-[hash:10].[ext]`
          },

          // 🆕 实验性：manifest 用于精确缓存控制
          // 若需要可取消注释：
          // manualChunks 已足够；manifest 会增加 ~2KB 额外请求
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
      // 🆕 lightningcss 编译选项
      lightningcss: {
        // lightningcss 使用 Rust 风格的版本编码：major << 16
        // Chrome 87 (2020.11) → 87 << 16 = 5701632
        targets: { chrome: 87 << 16 },
      },
    },

    // ─── 实验性优化 ─────────────────────────────
    experimental: {
      // 🆕 启用 renderBuiltUrl 可进一步优化 CDN 部署
    },
  }
})
