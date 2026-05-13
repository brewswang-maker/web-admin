<template>
  <div ref="chartContainer" class="lazy-chart" :style="{ height }">
    <!-- 加载中骨架屏 -->
    <div v-if="!ready" class="chart-placeholder">
      <div class="placeholder-shimmer"></div>
    </div>
    <!-- 错误兜底 -->
    <div v-else-if="loadError" class="chart-error">
      <span>图表加载失败</span>
      <button class="retry-btn" @click="retry">重试</button>
    </div>
    <!-- 图表渲染 -->
    <component
      v-else
      :is="VChartComponent"
      :option="option"
      autoresize
      :style="{ height }"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * LazyChart v7 — 按需加载 ECharts 子模块
 *
 * 策略：
 *  1. 仅在 DOM 挂载后动态 import echarts/core + vue-echarts
 *  2. 自动从 option.series[].type 推断需要的图表类型，按需加载
 *  3. 全局单例注册（多个 LazyChart 实例共享 echarts 实例）
 *  4. 加载失败时可重试
 *
 * 效果：非图表页面 0 开销；图表页面首屏仅加载用到的类型
 *      → 全量 ECharts ~800KB → 按需 ~60-120KB
 */
import { ref, shallowRef, onMounted } from 'vue'
import type { EChartsOption } from 'echarts'

// ── 全局状态（跨组件单例） ──
let echartsReady = false
let echartsInitPromise: Promise<void> | null = null
const registeredCharts = new Set<string>()
const registeredComponents = new Set<string>()

const props = defineProps<{
  option: EChartsOption
  height?: string
}>()

const VChartComponent = shallowRef<any>(null)
const ready = ref(false)
const loadError = ref(false)
const chartContainer = ref<HTMLElement>()

/**
 * 从 EChartsOption 中提取所需的 series 类型
 * 例: [{ type: 'line' }, { type: 'bar' }] → ['line', 'bar']
 */
function detectChartTypes(option: EChartsOption): string[] {
  const types = new Set<string>()
  if (option.series && Array.isArray(option.series)) {
    for (const s of option.series) {
      if (s && (s as any).type) {
        types.add((s as any).type as string)
      }
    }
  }
  // 默认至少需要一个基础类型
  if (types.size === 0) types.add('line')
  return Array.from(types)
}

/**
 * ECharts 类型名 → 导入路径映射
 */
const CHART_TYPE_MAP: Record<string, string> = {
  line: 'LineChart',
  bar: 'BarChart',
  pie: 'PieChart',
  scatter: 'ScatterChart',
  radar: 'RadarChart',
  gauge: 'GaugeChart',
  funnel: 'FunnelChart',
  heatmap: 'HeatmapChart',
  treemap: 'TreemapChart',
  sunburst: 'SunburstChart',
  candlestick: 'CandlestickChart',
  map: 'MapChart',
  lines: 'LinesChart',
  custom: 'CustomChart',
}

/**
 * 初始化 ECharts 单例（全局仅执行一次）
 */
async function initEChartsSingleton(neededTypes: string[]): Promise<void> {
  // 已初始化 → 仅补充加载新图表类型
  if (echartsReady) {
    await loadMissingChartTypes(neededTypes)
    return
  }

  // 正在初始化 → 等待完成后补充
  if (echartsInitPromise) {
    await echartsInitPromise
    await loadMissingChartTypes(neededTypes)
    return
  }

  echartsInitPromise = (async () => {
    const [echartsMod, vChartMod] = await Promise.all([
      import('echarts/core'),
      import('vue-echarts'),
    ])

    const { use } = echartsMod
    const { CanvasRenderer } = await import('echarts/renderers')

    // 基础组件（几乎所有图表都需要）
    const { GridComponent, TooltipComponent, LegendComponent, TitleComponent, ToolboxComponent } =
      await import('echarts/components')

    const chartsToRegister: any[] = [CanvasRenderer]
    const componentsToRegister: any[] = [
      GridComponent, TooltipComponent, LegendComponent, TitleComponent, ToolboxComponent,
    ]

    // 加载检测到的图表类型
    const chartModules = await loadChartModules(neededTypes)
    chartsToRegister.push(...chartModules)

    use([...chartsToRegister, ...componentsToRegister])

    // 记录已注册
    for (const t of neededTypes) registeredCharts.add(t)
    registeredComponents.add('grid')
    registeredComponents.add('tooltip')
    registeredComponents.add('legend')
    registeredComponents.add('title')
    registeredComponents.add('toolbox')

    VChartComponent.value = vChartMod.default
    echartsReady = true
  })()

  await echartsInitPromise
}

/**
 * 补充加载尚未注册的图表类型
 */
async function loadMissingChartTypes(neededTypes: string[]): Promise<void> {
  const missing = neededTypes.filter((t) => !registeredCharts.has(t))
  if (missing.length === 0) return

  const chartModules = await loadChartModules(missing)
  const { use } = await import('echarts/core')
  use(chartModules)

  for (const t of missing) registeredCharts.add(t)
}

/**
 * 按需加载图表模块
 */
async function loadChartModules(types: string[]): Promise<any[]> {
  const modules: any[] = []
  for (const t of types) {
    const moduleName = CHART_TYPE_MAP[t]
    if (!moduleName) continue
    try {
      const mod = await import('echarts/charts')
      if ((mod as any)[moduleName]) {
        modules.push((mod as any)[moduleName])
      }
    } catch {
      console.warn(`[LazyChart] Chart type "${t}" not available in echarts/charts`)
    }
  }
  return modules
}

// ── 重试 ──
function retry() {
  loadError.value = false
  mountChart()
}

// ── 挂载 ──
async function mountChart() {
  try {
    const neededTypes = detectChartTypes(props.option)
    await initEChartsSingleton(neededTypes)
    ready.value = true
  } catch (err) {
    console.error('[LazyChart] Failed to load ECharts:', err)
    loadError.value = true
  }
}

onMounted(() => {
  mountChart()
})
</script>

<style scoped>
.lazy-chart {
  position: relative;
  min-height: 200px;
}

.chart-placeholder {
  position: absolute;
  inset: 0;
}

.placeholder-shimmer {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.chart-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 14px;
  gap: 8px;
}

.retry-btn {
  padding: 4px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}

.retry-btn:hover {
  border-color: #409eff;
  color: #409eff;
}
</style>
