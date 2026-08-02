<!--
  华盾AI智能视频盒子 v7.0 - 地图选点对话框（复用组件）
  components/LocationPickerDialog.vue — 设备位置选点
  功能：地图选点 + 文字搜索 + 经纬度 + 地址
  使用：
    <LocationPickerDialog
      v-model="showPicker"
      :device-id="row.id"
      :device-name="row.name"
      :longitude="row.longitude"
      :latitude="row.latitude"
      @saved="onLocationSaved"
    />
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    :title="`设置设备位置 - ${deviceName || deviceId}`"
    width="900px"
    :close-on-click-modal="false"
    @opened="onDialogOpened"
    @closed="onDialogClosed"
  >
    <div class="location-picker">
      <!-- 左侧：地图 -->
      <div class="picker-map" :class="{ 'pick-mode-active': pickMode }" ref="mapContainerRef">
        <div id="picker-map-canvas" class="picker-map-canvas"></div>
        <!-- 选点模式覆盖提示 -->
        <div v-if="pickMode" class="pick-mode-banner">
          <el-icon style="margin-right: 6px;"><Aim /></el-icon>
          <span>请在地图上点击选择设备位置</span>
          <el-button size="small" text @click="cancelPickMode">取消</el-button>
        </div>
        <!-- 地图类型切换：右下角 -->
        <div v-if="mapReady" class="map-type-control">
          <el-radio-group v-model="mapType" size="small" @change="switchMapType">
            <el-radio-button value="vector">矢量</el-radio-button>
            <el-radio-button value="satellite">卫星</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 右侧：表单 -->
      <div class="picker-form">
        <el-form label-width="80px" size="default">
          <el-form-item label="设备">
            <el-input :model-value="deviceId" disabled />
          </el-form-item>
          <el-form-item label="经纬度">
            <div class="coord-inputs">
              <el-input v-model="form.longitude" placeholder="经度 如 108.908623" />
              <el-input v-model="form.latitude" placeholder="纬度 如 34.260803" />
            </div>
          </el-form-item>
          <el-form-item label=" ">
            <div class="action-row">
              <el-button :type="pickMode ? 'primary' : 'default'" @click="enterPickMode">
                <el-icon style="margin-right: 4px;"><Aim /></el-icon>
                {{ pickMode ? '点击地图选择...' : '在地图上选点' }}
              </el-button>
              <el-tag v-if="form.longitude && form.latitude" type="success" size="small">
                {{ form.longitude }}, {{ form.latitude }}
              </el-tag>
            </div>
          </el-form-item>
          <el-form-item label="检索地点">
            <div class="search-box">
              <el-input
                v-model="searchKeyword"
                placeholder="输入地点名称搜索 如:西安钟楼"
                clearable
                @keyup.enter="searchPlace"
                @clear="clearSearchResults"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
                <template #append>
                  <el-button @click="searchPlace" :loading="searchLoading">搜索</el-button>
                </template>
              </el-input>
              <div v-if="searchResults.length > 0" class="search-results-dropdown">
                <div class="search-results-header">
                  <span>共找到 {{ searchResults.length }} 个结果</span>
                  <el-button link size="small" @click="clearSearchResults">关闭</el-button>
                </div>
                <div
                  v-for="(poi, idx) in searchResults"
                  :key="idx"
                  class="search-result-item"
                  @click="selectSearchResult(poi)"
                >
                  <div class="result-name">
                    <el-icon style="color: #3B82F6; margin-right: 4px;"><LocationFilled /></el-icon>
                    {{ poi.name }}
                  </div>
                  <div class="result-address">{{ poi.address }}</div>
                </div>
              </div>
              <div v-else-if="searchKeyword && searchNoResult" class="search-results-dropdown no-result">
                <div class="empty-search">未找到地点，请尝试其他关键词</div>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="地址">
            <el-input
              v-model="form.address"
              placeholder="如 西安市雁塔区（自动获取或手动输入）"
            />
          </el-form-item>
        </el-form>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save" :loading="saving">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '@/api/http'

// ── 高德地图 JS SDK ──
const AMAP_KEY = '7fe207317aeae03b556a6cfa10e9ceb8'
declare global { interface Window { AMap: any } }

function loadAMap(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) return resolve()
    const s = document.createElement('script')
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder,AMap.PlaceSearch`
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('AMap SDK load failed'))
    document.head.appendChild(s)
  })
}

// ── Props & Emits ──
interface Props {
  modelValue: boolean
  deviceId: string
  deviceName?: string
  longitude?: number | string
  latitude?: number | string
  address?: string
}

const props = withDefaults(defineProps<Props>(), {
  deviceName: '',
  longitude: 0,
  latitude: 0,
  address: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'saved': [data: { longitude: number; latitude: number; address: string }]
}>()

// ── 状态 ──
const form = ref({ longitude: '', latitude: '', address: '' })
const pickMode = ref(false)
const saving = ref(false)
const mapReady = ref(false)
const mapType = ref<'vector' | 'satellite'>('vector')
const mapContainerRef = ref<HTMLElement>()

const searchKeyword = ref('')
const searchResults = ref<any[]>([])
const searchLoading = ref(false)
const searchNoResult = ref(false)

let map: any = null
let pickMarker: any = null
let geocoder: any = null
let placeSearch: any = null

// ── 生命周期 ──
onMounted(() => {
  // 预加载 AMap SDK
  loadAMap().catch(e => console.error('[LocationPicker] 高德SDK加载失败:', e))
})

onUnmounted(() => {
  destroyMap()
})

function destroyMap() {
  if (pickMarker && map) { map.remove(pickMarker); pickMarker = null }
  if (map) { map.destroy(); map = null }
  mapReady.value = false
  pickMode.value = false
}

// ── 对话框打开/关闭 ──
async function onDialogOpened() {
  // 初始化表单值
  form.value.longitude = props.longitude ? String(props.longitude) : ''
  form.value.latitude = props.latitude ? String(props.latitude) : ''
  form.value.address = props.address || ''

  // 等 DOM 渲染完毕后再初始化地图
  await nextTick()
  try {
    await loadAMap()
    initMap()
    mapReady.value = true
  } catch (e) {
    console.error('[LocationPicker] 初始化地图失败:', e)
    ElMessage.error('地图加载失败，请检查网络')
  }
}

function onDialogClosed() {
  destroyMap()
  clearSearchResults()
  searchKeyword.value = ''
}

function ensureSearchPlugins(): Promise<void> {
  if (geocoder && placeSearch) return Promise.resolve()
  const AMap = (window as any).AMap
  if (!AMap) return Promise.reject(new Error('AMap SDK 未加载'))
  return new Promise((resolve, reject) => {
    AMap.plugin(['AMap.Geocoder', 'AMap.PlaceSearch'], () => {
      try {
        geocoder = new AMap.Geocoder({ city: '全国' })
        placeSearch = new AMap.PlaceSearch({
          city: '全国',
          citylimit: false,
          pageSize: 20,
          pageIndex: 1,
          extensions: 'all',
        })
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}
// ── 地图初始化 ──
function initMap() {
  if (map) return
  const AMap = (window as any).AMap
  if (!AMap) return

  // 默认中心：当前坐标 或 西安
  const center: [number, number] = (props.longitude && props.latitude)
    ? [Number(props.longitude), Number(props.latitude)]
    : [108.9, 34.3]

  map = new AMap.Map('picker-map-canvas', {
    center,
    zoom: props.longitude && props.latitude ? 15 : 13,
    resizeEnable: true,
    viewMode: '2D',
  })

  // 加载逆地理编码 + 地点搜索插件
  void ensureSearchPlugins().catch(error => console.error('[LocationPicker] 地图插件加载失败:', error))

  // 如果有初始坐标，则显示标记
  if (props.longitude && props.latitude) {
    addOrUpdatePickMarker(Number(props.longitude), Number(props.latitude))
  }

  // 点击地图
  map.on('click', (e: any) => {
    if (pickMode.value) {
      handleMapPick(e.lnglat.getLng(), e.lnglat.getLat())
    }
  })
}

// ── 切换地图类型 ──
function switchMapType(value: unknown) {
  if (value !== 'vector' && value !== 'satellite') return
  const type = value
  if (!map) return
  const AMap = (window as any).AMap
  if (type === 'vector') {
    map.setLayers([new AMap.TileLayer()])
  } else {
    map.setLayers([new AMap.TileLayer.Satellite()])
  }
}

// ── 选点模式 ──
function enterPickMode() {
  pickMode.value = true
}

function cancelPickMode() {
  pickMode.value = false
}

// ── 处理地图选点 ──
function handleMapPick(lng: number, lat: number) {
  form.value.longitude = lng.toFixed(6)
  form.value.latitude = lat.toFixed(6)
  addOrUpdatePickMarker(lng, lat)
  reverseGeocode(lng, lat)
  pickMode.value = false
}

function addOrUpdatePickMarker(lng: number, lat: number) {
  const AMap = (window as any).AMap
  if (!AMap || !map) return

  if (pickMarker) {
    pickMarker.setPosition([lng, lat])
  } else {
    pickMarker = new AMap.Marker({
      position: [lng, lat],
      content: `<div style="
        width:32px;height:32px;
        border-radius:50% 50% 50% 0;
        background:#3B82F6;
        border:3px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
      "><div style="
        width:10px;height:10px;
        background:#fff;
        border-radius:50%;
        transform:rotate(45deg);
      "></div></div>`,
      offset: new AMap.Pixel(-16, -32),
      draggable: true,
      cursor: 'move',
    })
    pickMarker.on('dragend', (ev: any) => {
      const pos = ev.lnglat
      form.value.longitude = pos.getLng().toFixed(6)
      form.value.latitude = pos.getLat().toFixed(6)
      reverseGeocode(pos.getLng(), pos.getLat())
    })
    map.add(pickMarker)
  }
  map.setCenter([lng, lat])
}

// ── 逆地理编码 ──
function reverseGeocode(lng: number, lat: number) {
  if (!geocoder) return
  geocoder.getAddress([lng, lat], (status: string, result: any) => {
    if (status === 'complete' && result.info === 'OK' && result.regeocode) {
      const addr = result.regeocode.formattedAddress || ''
      form.value.address = addr
    }
  })
}

// ── 文字搜索 ──
async function searchPlace() {
  const keyword = searchKeyword.value.trim()
  if (!keyword) { ElMessage.warning('请输入搜索关键词'); return }
  searchLoading.value = true
  searchNoResult.value = false
  try {
    await ensureSearchPlugins()
    placeSearch.search(keyword, (status: string, result: any) => {
      searchLoading.value = false
      if (status === 'complete' && result.info === 'OK') {
        const pois = result.poiList?.pois || []
        searchResults.value = pois
        searchNoResult.value = pois.length === 0
      } else {
        searchResults.value = []
        searchNoResult.value = true
        ElMessage.warning('未找到地点：' + (result?.info || '请更换关键词'))
      }
    })
  } catch (error) {
    searchLoading.value = false
    searchResults.value = []
    searchNoResult.value = true
    console.error('[LocationPicker] 地点搜索失败:', error)
    ElMessage.warning('地点搜索服务暂不可用，请稍后重试')
  }
}

function clearSearchResults() {
  searchResults.value = []
  searchNoResult.value = false
}

function selectSearchResult(poi: any) {
  if (!poi.location) return
  const location = poi.location
  const lng = typeof location.getLng === 'function' ? location.getLng() : Number(location.lng)
  const lat = typeof location.getLat === 'function' ? location.getLat() : Number(location.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
  form.value.longitude = lng.toFixed(6)
  form.value.latitude = lat.toFixed(6)
  form.value.address = [poi.name, poi.address].filter(Boolean).join(' - ')
  clearSearchResults()
  searchKeyword.value = ''
  if (map) {
    map.setZoomAndCenter(15, [lng, lat])
    handleMapPick(lng, lat)
  }
  ElMessage.success(`已选择: ${poi.name}`)
}

// ── 保存 ──
async function save() {
  const lng = parseFloat(form.value.longitude)
  const lat = parseFloat(form.value.latitude)
  if (isNaN(lng) || isNaN(lat)) {
    ElMessage.warning('请填写有效的经纬度')
    return
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    ElMessage.warning('经纬度范围无效')
    return
  }

  // 添加设备场景（未创建设备，仅本地同步）
  if (props.deviceId.startsWith('add_')) {
    emit('saved', { longitude: lng, latitude: lat, address: form.value.address })
    emit('update:modelValue', false)
    return
  }

  saving.value = true
  try {
    await http.put(`/system/gb28181/devices/${props.deviceId}/location`, {
      longitude: lng,
      latitude: lat,
      address: form.value.address,
    })
    ElMessage.success('位置保存成功')
    emit('saved', { longitude: lng, latitude: lat, address: form.value.address })
    emit('update:modelValue', false)
  } catch (e: any) {
    console.error('[LocationPicker] 保存位置失败:', e)
    ElMessage.error(e?.response?.data?.message || '保存位置失败')
  } finally {
    saving.value = false
  }
}

// ── 监听外部 props 变化 ──
watch(() => [props.longitude, props.latitude, props.address], () => {
  if (map && props.longitude && props.latitude) {
    addOrUpdatePickMarker(Number(props.longitude), Number(props.latitude))
  }
})
</script>

<style scoped>
.location-picker {
  display: flex;
  gap: 12px;
  height: 500px;
}

.picker-map {
  flex: 1;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f7fa;
}

.picker-map-canvas {
  width: 100%;
  height: 100%;
}

.pick-mode-active :deep(.amap-container) {
  cursor: crosshair !important;
}

.pick-mode-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(59, 130, 246, 0.95);
  color: #fff;
  padding: 10px 20px;
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
  font-size: 14px;
  font-weight: 500;
  animation: pick-pulse 2s infinite;
}
.pick-mode-banner .el-button {
  color: rgba(255, 255, 255, 0.85);
}
.pick-mode-banner .el-button:hover {
  color: #fff;
}
@keyframes pick-pulse {
  0%, 100% { box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 4px 30px rgba(59, 130, 246, 0.7); }
}

.map-type-control {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 4px;
  padding: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.picker-form {
  width: 360px;
  flex-shrink: 0;
  overflow-y: auto;
}

.coord-inputs {
  display: flex;
  gap: 8px;
  width: 100%;
}
.coord-inputs .el-input {
  flex: 1;
}

.action-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-box {
  position: relative;
  width: 100%;
}
.search-results-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 320px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  margin-top: 4px;
}
.search-results-dropdown.no-result {
  padding: 16px;
}
.search-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: #909399;
  border-bottom: 1px solid #e4e7ed;
  background: rgba(0, 0, 0, 0.02);
}
.search-result-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  transition: background 0.15s;
}
.search-result-item:hover {
  background: rgba(59, 130, 246, 0.06);
}
.result-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  display: flex;
  align-items: center;
}
.result-address {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  padding-left: 20px;
}
.empty-search {
  text-align: center;
  color: #8c8c8c;
  font-size: 13px;
}
</style>