<template>
  <div class="topology-view">
    <el-card shadow="hover" class="topo-card">
      <template #header>
        <div class="topo-header">
          <div class="header-left">
            <span style="font-weight:600">IoT 设备拓扑图</span>
            <el-tag type="info" size="small" effect="plain" style="margin-left:12px">
              {{ deviceStore.devices.length }} 个设备 · {{ onlineCount }} 在线
            </el-tag>
          </div>
          <div class="header-right">
            <el-select v-model="layoutMode" size="small" style="width:120px;margin-right:8px">
              <el-option label="力导向" value="force" />
              <el-option label="环形" value="circular" />
            </el-select>
            <el-button size="small" @click="refreshTopology" :loading="refreshing">
              <el-icon><Refresh /></el-icon> 刷新
            </el-button>
          </div>
        </div>
      </template>
      <div class="topo-legend">
        <span class="legend-item"><span class="dot" style="background:#67C23A"></span>在线</span>
        <span class="legend-item"><span class="dot" style="background:#909399"></span>离线</span>
        <span class="legend-item"><span class="dot" style="background:#E6A23C"></span>告警</span>
        <span class="legend-item"><span class="dot" style="background:#409EFF"></span>维护</span>
      </div>
      <div ref="chartRef" class="topo-chart"></div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useDeviceStore } from '@/stores/device'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer])

const deviceStore = useDeviceStore()
const chartRef = ref<HTMLDivElement>()
const layoutMode = ref<'force' | 'circular'>('force')
const refreshing = ref(false)
let chart: echarts.ECharts | null = null

const onlineCount = computed(() => deviceStore.devices.filter(d => d.status === 'online').length)

const typeSymbol: Record<string, string> = {
  EdgeBox: 'rect',
  IPCamera: 'path://M64 192h640v384H64z m704 128l192-96v320l-192-96z',
  NVR: 'roundRect',
  DVR: 'diamond',
}

const statusColor: Record<string, string> = {
  online: '#67C23A',
  offline: '#909399',
  alarming: '#E6A23C',
  maintaining: '#409EFF',
}

function buildOption() {
  const devices = deviceStore.devices
  if (!devices.length) {
    return { title: { text: '暂无设备数据', left: 'center', top: 'center', textStyle: { color: '#909399', fontSize: 16 } } }
  }

  const categories = [
    { name: '边缘盒子' },
    { name: '摄像头' },
    { name: 'NVR' },
    { name: 'DVR' },
  ]
  const catMap: Record<string, number> = { EdgeBox: 0, IPCamera: 1, NVR: 2, DVR: 3 }

  const gatewayId = devices.find(d => d.deviceType === 'EdgeBox')?.id

  const nodes = devices.map(d => ({
    id: d.id,
    name: d.name,
    symbolSize: d.deviceType === 'EdgeBox' ? 56 : 38,
    symbol: typeSymbol[d.deviceType] || 'circle',
    category: catMap[d.deviceType] ?? 0,
    itemStyle: { color: statusColor[d.status] || '#909399', borderColor: '#fff', borderWidth: 2 },
    label: { show: true, fontSize: 11, color: '#303133', position: 'bottom' as const },
    tooltip: {
      formatter: `<b>${d.name}</b><br/>类型: ${d.deviceType}<br/>IP: ${d.ip}<br/>状态: ${d.status}<br/>通道: ${d.channelCount}`,
    },
  }))

  const links = gatewayId
    ? devices.filter(d => d.id !== gatewayId).map(d => ({
        source: d.deviceType === 'EdgeBox' ? d.id : gatewayId,
        target: d.id,
        lineStyle: { width: 1.5, color: '#C0C4CC', curveness: 0.1 },
      }))
    : []

  return {
    tooltip: { trigger: 'item' },
    legend: { data: categories.map(c => c.name), bottom: 10, textStyle: { fontSize: 12 } },
    series: [{
      type: 'graph',
      layout: layoutMode.value,
      data: nodes,
      links,
      categories,
      roam: true,
      draggable: true,
      emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      ...(layoutMode.value === 'force'
        ? { force: { repulsion: 260, gravity: 0.1, edgeLength: [80, 180], layoutAnimation: true } }
        : { circular: { rotateLabel: true } }),
    }],
  }
}

function render() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)
  chart.setOption(buildOption(), true)
}

async function refreshTopology() {
  refreshing.value = true
  try {
    await deviceStore.fetchDevices()
    render()
  } finally {
    refreshing.value = false
  }
}

function handleResize() { chart?.resize() }

watch(layoutMode, render)
watch(() => deviceStore.devices, render, { deep: true })

onMounted(() => {
  render()
  window.addEventListener('resize', handleResize)
  if (!deviceStore.devices.length) deviceStore.fetchDevices()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})
</script>

<style scoped lang="scss">
.topology-view { height: 100%; }
.topo-card {
  height: 100%;
  .topo-header { display: flex; justify-content: space-between; align-items: center;
    .header-left { display: flex; align-items: center; }
    .header-right { display: flex; align-items: center; }
  }
  .topo-legend { display: flex; gap: 16px; margin-bottom: 12px; padding: 0 4px;
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #606266;
      .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    }
  }
  .topo-chart { height: 520px; }
}
</style>
