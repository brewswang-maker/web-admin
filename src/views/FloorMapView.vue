<template>
  <div class="floormap-view">
    <!-- ═══ 左侧: 地图卡片列表 (场景筛选 + 楼层/建筑元数据; 华为 IVS 楼层切换对标) ═══ -->
    <aside class="floormap-view__side">
      <div class="floormap-view__side-head">
        <span class="floormap-view__side-title">平面图库</span>
        <el-button type="primary" size="small" @click="openCreate">新建</el-button>
      </div>
      <el-select
        v-model="sceneFilter"
        class="floormap-view__scene-filter"
        placeholder="全部场景"
        clearable
        size="small"
      >
        <el-option
          v-for="s in FLOOR_MAP_SCENES"
          :key="s.value"
          :value="s.value"
          :label="s.label"
        />
      </el-select>
      <div class="floormap-view__cards">
        <div
          v-for="m in filteredMaps"
          :key="m.id"
          class="floormap-view__card"
          :class="{ 'is-active': m.id === selectedId }"
          @click="selectMap(m.id)"
        >
          <div class="floormap-view__card-thumb">
            <img v-if="m.image_path" :src="floorMapApi.getImageUrl(m)" alt="" >
            <svg v-else viewBox="0 0 48 48" width="30" height="30">
              <rect x="5" y="8" width="38" height="30" fill="none" stroke="#3A5A8C" stroke-width="2" />
              <path d="M5 18h38M17 18v20" stroke="#3A5A8C" stroke-width="2" />
            </svg>
          </div>
          <div class="floormap-view__card-info">
            <div class="floormap-view__card-name">{{ m.name }}</div>
            <div class="floormap-view__card-meta">
              <span v-if="m.building">{{ m.building }}</span>
              <span v-if="m.floor">{{ m.floor }}</span>
            </div>
            <div class="floormap-view__card-tags">
              <el-tag v-if="m.scene_tag" size="small" type="info">{{ sceneTagLabel(m.scene_tag) }}</el-tag>
              <el-tag size="small">{{ m.cameras.length }} 设备</el-tag>
            </div>
          </div>
        </div>
        <el-empty v-if="!filteredMaps.length" description="暂无平面图" :image-size="60" />
      </div>
    </aside>

    <!-- ═══ 右侧: 编辑器 ═══ -->
    <section class="floormap-view__main">
      <template v-if="selectedMap">
        <!-- 元数据工具条 -->
        <div class="floormap-view__toolbar">
          <el-input v-model="form.name" class="floormap-view__ipt" placeholder="名称" size="small" />
          <el-input v-model="form.building" class="floormap-view__ipt" placeholder="建筑" size="small" />
          <el-input v-model="form.floor" class="floormap-view__ipt floormap-view__ipt--s" placeholder="楼层" size="small" />
          <el-select v-model="form.scene_tag" class="floormap-view__ipt floormap-view__ipt--s" placeholder="场景" size="small" clearable>
            <el-option v-for="s in FLOOR_MAP_SCENES" :key="s.value" :value="s.value" :label="s.label" />
          </el-select>
          <el-input-number
            v-model="form.scale_m_per_px"
            :min="0.001" :max="5" :step="0.01" :precision="3"
            class="floormap-view__ipt--num"
            size="small"
          />
          <span class="floormap-view__unit">米/像素</span>
          <div class="floormap-view__toolbar-spacer" />
          <!-- [P0-2] 栅格吸附开关 (默认开; 密集落点防重叠) -->
          <span class="floormap-view__snap">
            <el-switch v-model="snapEnabled" size="small" />
            吸附
          </span>
          <el-upload
            :show-file-list="false"
            :http-request="onUploadImage"
            accept=".svg,.png,.jpg,.jpeg"
          >
            <el-button size="small" :loading="uploading">上传底图</el-button>
          </el-upload>
          <el-button size="small" type="primary" :loading="savingMeta" @click="saveMeta">保存</el-button>
          <el-button size="small" type="danger" plain @click="removeMap">删除</el-button>
        </div>

        <!-- 画布 + 绑定面板 -->
        <div class="floormap-view__editor">
          <div class="floormap-view__canvas-wrap">
            <FloorMapCanvas
              :map="selectedMap"
              :bindings="selectedMap.cameras"
              :editable="true"
              :channel-labels="channelLabels"
              :channel-online="channelOnline"
              :snap-to-grid="snapEnabled"
              :alarm-channels="alarmChannels"
              @canvas-click="onCanvasClick"
              @binding-move="onBindingMove"
            />
            <div v-if="pendingChannel" class="floormap-view__pending-tip">
              正在放置: {{ pendingDesc }} — 点击画布落点
              <el-button link size="small" @click="pendingChannel = ''">取消</el-button>
            </div>

            <!-- [UX] 地图上显眼的添加入口: 类型网格 → 选通道/输编号 → 点画布 (宇视工具箱对标)
                 与右侧面板共享 pendingType/pendingChannel 状态, 两条路径均可落点 -->
            <div class="floormap-view__add-kit">
              <div class="floormap-view__add-kit-head">＋ 添加设备</div>
              <div class="floormap-view__add-kit-grid">
                <button
                  v-for="t in FLOOR_MAP_DEVICE_TYPES"
                  :key="t.value"
                  type="button"
                  class="floormap-view__add-kit-type"
                  :class="{ 'is-active': pendingType === t.value }"
                  :title="t.label"
                  @click="pendingType = t.value"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" :fill="deviceIconMeta(t.value).color" />
                    <path :d="deviceIconMeta(t.value).path" fill="#fff" />
                  </svg>
                  <span>{{ t.label }}</span>
                </button>
              </div>
              <div class="floormap-view__add-kit-pick">
                <el-select
                  v-if="pendingType === 'camera'"
                  v-model="pendingChannel"
                  placeholder="选择通道"
                  size="small"
                  filterable
                  clearable
                >
                  <el-option
                    v-for="ch in channelOptions"
                    :key="chKey(ch)"
                    :value="chKey(ch)"
                    :label="ch.name || chKey(ch)"
                  />
                </el-select>
                <el-input
                  v-else
                  v-model="pendingChannel"
                  :placeholder="`${deviceTypeLabel(pendingType)} 编号`"
                  size="small"
                  clearable
                />
              </div>
              <div class="floormap-view__add-kit-hint">
                {{ pendingChannel ? '点击地图落点（自动吸附栅格）' : '选类型后选通道/输编号' }}
              </div>
            </div>
          </div>

          <!-- 设备绑定面板 ([P0-1] 通用化: 类型下拉 → 摄像头选通道 / 其他输设备编号; 宇视对标) -->
          <div class="floormap-view__panel">
            <div class="floormap-view__panel-head">
              <span>设备绑定</span>
              <el-select
                v-model="pendingType"
                size="small"
                class="floormap-view__panel-select"
              >
                <el-option
                  v-for="t in FLOOR_MAP_DEVICE_TYPES"
                  :key="t.value"
                  :value="t.value"
                  :label="t.label"
                />
              </el-select>
            </div>
            <div class="floormap-view__panel-pick">
              <el-select
                v-if="pendingType === 'camera'"
                v-model="pendingChannel"
                placeholder="选择通道后点画布落点"
                size="small"
                filterable
                class="floormap-view__panel-pick-ipt"
              >
                <el-option
                  v-for="ch in channelOptions"
                  :key="chKey(ch)"
                  :value="chKey(ch)"
                  :label="ch.name || chKey(ch)"
                />
              </el-select>
              <el-input
                v-else
                v-model="pendingChannel"
                :placeholder="`${deviceTypeLabel(pendingType)} 设备编号`"
                size="small"
                clearable
                class="floormap-view__panel-pick-ipt"
              />
            </div>
            <div class="floormap-view__bindings">
              <div v-for="b in selectedMap.cameras" :key="b.id" class="floormap-view__binding">
                <div class="floormap-view__binding-row">
                  <span class="floormap-view__binding-name">{{ bindingName(b) }}</span>
                  <el-tag
                    size="small"
                    :type="b.device_type === 'camera' ? 'primary' : 'warning'"
                    effect="plain"
                  >
                    {{ deviceTypeLabel(b.device_type) }}
                  </el-tag>
                  <el-tag v-if="b.is_primary" size="small" type="success">主图</el-tag>
                  <div class="floormap-view__binding-spacer" />
                  <el-button link size="small" type="danger" @click="removeBinding(b)">解绑</el-button>
                </div>
                <!-- camera: 朝向/半径/主图 (存量); 其他类型: 显示名 + 主图 -->
                <div
                  v-if="b.device_type === 'camera'"
                  class="floormap-view__binding-row floormap-view__binding-row--ctrl"
                >
                  <span class="floormap-view__binding-label">朝向</span>
                  <el-input-number
                    :model-value="b.fov_yaw" :min="-360" :max="360" :step="15"
                    size="small" controls-position="right"
                    @change="(v: number | undefined) => updateBinding(b, { fov_yaw: v ?? 0 })"
                  />
                  <span class="floormap-view__binding-label">半径m</span>
                  <el-input-number
                    :model-value="b.fov_radius_m" :min="1" :max="500" :step="5"
                    size="small" controls-position="right"
                    @change="(v: number | undefined) => updateBinding(b, { fov_radius_m: v ?? 20 })"
                  />
                  <div class="floormap-view__binding-spacer" />
                  <span class="floormap-view__binding-label">主图</span>
                  <el-switch
                    :model-value="b.is_primary"
                    size="small"
                    @change="(v: string | number | boolean) => updateBinding(b, { is_primary: !!v })"
                  />
                </div>
                <div v-else class="floormap-view__binding-row floormap-view__binding-row--ctrl">
                  <span class="floormap-view__binding-label">名称</span>
                  <el-input
                    :model-value="b.label"
                    size="small"
                    placeholder="显示名"
                    class="floormap-view__binding-ipt"
                    @change="(v: string) => updateBinding(b, { label: v })"
                  />
                  <div class="floormap-view__binding-spacer" />
                  <span class="floormap-view__binding-label">主图</span>
                  <el-switch
                    :model-value="b.is_primary"
                    size="small"
                    @change="(v: string | number | boolean) => updateBinding(b, { is_primary: !!v })"
                  />
                </div>
              </div>
              <el-empty
                v-if="!selectedMap.cameras.length"
                description="暂无绑定 — 选设备后点击画布"
                :image-size="48"
              />
            </div>
            <div v-if="gpsHint" class="floormap-view__gps-hint">{{ gpsHint }}</div>
          </div>
        </div>
      </template>
      <el-empty v-else description="选择或新建平面图" class="floormap-view__placeholder" />
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * [FLOOR-MAP 2026-09-03] 平面图管理页 (/maps)
 *
 * 三层联动·管理层: 平面图 CRUD + 底图上传 (SVG/PNG/JPG) + 摄像头点位/FOV 绑定。
 * 左侧卡片列表 (场景筛选) + 右侧编辑器 (元数据表单 + FloorMapCanvas 编辑模式 +
 * 绑定面板)。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { http } from '@/api/http'
import { floorMapApi } from '@/api/floorMap'
import { channelApi } from '@/api/channel'
import { useFloorMap } from '@/composables/useFloorMap'
import FloorMapCanvas from '@/components/map/FloorMapCanvas.vue'
import {
  FLOOR_MAP_DEVICE_TYPES,
  FLOOR_MAP_SCENES,
  deviceIconMeta,
  deviceTypeLabel,
  sceneTagLabel,
  type CameraMapBinding,
  type FloorMapDeviceType,
  type FloorMapWithCameras,
} from '@/types/floorMap'
import type { ChannelItem } from '@/types/device'

const { maps, loadMaps, invalidateMaps } = useFloorMap()

const sceneFilter = ref('')
const selectedId = ref(0)
const uploading = ref(false)
const savingMeta = ref(false)
const pendingChannel = ref('')
/** [P0-1] 待落点设备类型 (camera=选通道; 其他=输设备编号) */
const pendingType = ref<FloorMapDeviceType>('camera')
/** [P0-2] 栅格吸附开关 (默认开) */
const snapEnabled = ref(true)
watch(pendingType, () => { pendingChannel.value = '' })
const pendingDesc = computed(() =>
  pendingType.value === 'camera'
    ? (channelLabels.value[pendingChannel.value] || pendingChannel.value)
    : `${deviceTypeLabel(pendingType.value)} ${pendingChannel.value}`
)

const filteredMaps = computed(() =>
  sceneFilter.value ? maps.value.filter((m) => m.scene_tag === sceneFilter.value) : maps.value
)
const selectedMap = computed(() => maps.value.find((m) => m.id === selectedId.value) || null)

// ── 通道下拉 + 在线态/名称映射 (ChannelItem.status → 在线点) ──
const channels = ref<ChannelItem[]>([])
// [FIX 2026-09-04] channels API 实测字段 channel_id/status:"online",
//   与 ChannelItem 类型声明 (id/status:"active") 不符 → 键取值双兼容,
//   否则名称/在线态映射键全为 undefined (色环恒灰真机验证发现)
function chKey(ch: ChannelItem): string {
  return String((ch as any).channel_id || ch.id || '')
}
const channelOptions = computed(() =>
  channels.value.filter((ch) => !selectedMap.value?.cameras.some((b) => b.channel_id === chKey(ch)))
)
const channelLabels = computed<Record<string, string>>(() => {
  const o: Record<string, string> = {}
  for (const ch of channels.value) o[chKey(ch)] = ch.name || chKey(ch)
  return o
})
const channelOnline = computed<Record<string, boolean>>(() => {
  const o: Record<string, boolean> = {}
  for (const ch of channels.value) {
    // status 值域双兼容: "active" (类型声明) / "online" (API 实测)
    o[chKey(ch)] = ch.status === 'active' || ch.status === 'online'
  }
  return o
})
function shortCh(ch: string): string {
  return ch.length > 18 ? `${ch.slice(0, 10)}…${ch.slice(-4)}` : ch
}
// [P0-1] 绑定项显示名: 非摄像头用 label, 摄像头走通道名
function bindingName(b: CameraMapBinding): string {
  if (b.device_type && b.device_type !== 'camera') return b.label || b.channel_id
  return channelLabels.value[b.channel_id] || shortCh(b.channel_id)
}

// ── [P0-3] 告警状态注入 (30s 轮询近 24h 告警 → 色环红闪; 海康告警源定位对标) ──
const alarmChannels = ref<Record<string, boolean>>({})
let alarmTimer: number | undefined
async function loadAlarmChannels() {
  try {
    const res = await http.get('/alarms', { params: { page: 1, page_size: 200 } })
    const d = (res.data as any)?.data ?? res.data
    const items = Array.isArray(d?.items) ? d.items : []
    const o: Record<string, boolean> = {}
    const dayAgo = Date.now() - 24 * 3600 * 1000
    for (const a of items) {
      const ch = String(a.channel_id_str || a.channel_id || '')
      const ts = Number(a.timestamp) || 0
      if (ch && ts >= dayAgo) o[ch] = true
    }
    alarmChannels.value = o
  } catch (e) {
    console.warn('[FloorMapView] load alarm channels failed:', e)
  }
}

// GPS 建议落点提示: 待落点通道带 GPS 时提示 (简化 — 不自动落点)
const gpsHint = computed(() => {
  if (!pendingChannel.value) return ''
  const ch = channels.value.find((c) => c.id === pendingChannel.value)
  const meta = (ch?.metadata || {}) as Record<string, unknown>
  const lat = meta.gps_lat ?? meta.latitude
  const lng = meta.gps_lng ?? meta.longitude
  return lat && lng ? `该通道带 GPS (${lat}, ${lng}), 可参考实际安装位置落点` : ''
})

// ── 元数据表单 ──
const form = reactive({ name: '', building: '', floor: '', scene_tag: '', scale_m_per_px: 0.05 })
watch(selectedMap, (m) => {
  if (m) {
    form.name = m.name
    form.building = m.building
    form.floor = m.floor
    form.scene_tag = m.scene_tag
    form.scale_m_per_px = m.scale_m_per_px
  }
})

function selectMap(id: number) {
  selectedId.value = id
  pendingChannel.value = ''
}

async function openCreate() {
  try {
    const { value: name } = await ElMessageBox.prompt('平面图名称 (如: 教学楼A-1F)', '新建平面图', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/, inputErrorMessage: '名称不能为空',
    })
    const created = await floorMapApi.createMap({ name: name.trim() })
    await loadMaps(true)
    selectedId.value = created.id
    ElMessage.success(`已创建「${created.name}」, 请上传底图`)
  } catch { /* 取消 */ }
}

async function saveMeta() {
  if (!selectedMap.value || !form.name.trim()) {
    ElMessage.warning('名称不能为空')
    return
  }
  savingMeta.value = true
  try {
    await floorMapApi.updateMap(selectedMap.value.id, {
      name: form.name.trim(),
      building: form.building,
      floor: form.floor,
      scene_tag: form.scene_tag,
      scale_m_per_px: form.scale_m_per_px,
    })
    await loadMaps(true)
    ElMessage.success('已保存')
  } catch (e) {
    console.warn('[FloorMapView] saveMeta failed:', e)
    ElMessage.error('保存失败')
  } finally {
    savingMeta.value = false
  }
}

async function onUploadImage(opts: UploadRequestOptions) {
  if (!selectedMap.value) return
  uploading.value = true
  try {
    await floorMapApi.uploadImage(selectedMap.value.id, opts.file as File)
    await loadMaps(true)
    ElMessage.success('底图已上传')
  } catch (e) {
    console.warn('[FloorMapView] uploadImage failed:', e)
    ElMessage.error('底图上传失败 (支持 SVG/PNG/JPG)')
  } finally {
    uploading.value = false
  }
}

async function removeMap() {
  if (!selectedMap.value) return
  try {
    await ElMessageBox.confirm(
      `删除「${selectedMap.value.name}」及其摄像头绑定? 图片文件一并删除。`,
      '删除平面图',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await floorMapApi.deleteMap(selectedMap.value.id)
    selectedId.value = 0
    invalidateMaps()
    await loadMaps(true)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ── 绑定交互: 点击落点 / 拖拽微调 / 参数编辑 ──
async function onCanvasClick(x: number, y: number) {
  if (!selectedMap.value || !pendingChannel.value) return
  try {
    await floorMapApi.upsertBinding(selectedMap.value.id, {
      channel_id: pendingChannel.value,
      device_type: pendingType.value,
      // 非摄像头默认显示名 = 设备编号 (可后续在列表改名)
      label: pendingType.value === 'camera' ? '' : pendingChannel.value,
      pos_x: x,
      pos_y: y,
    })
    pendingChannel.value = ''
    await loadMaps(true)
    ElMessage.success('已绑定')
  } catch (e) {
    console.warn('[FloorMapView] bind failed:', e)
    ElMessage.error('绑定失败')
  }
}

async function onBindingMove(b: CameraMapBinding, x: number, y: number) {
  if (!selectedMap.value) return
  try {
    await floorMapApi.upsertBinding(b.map_id, {
      channel_id: b.channel_id,
      device_type: b.device_type,
      label: b.label,
      pos_x: x,
      pos_y: y,
      fov_yaw: b.fov_yaw,
      fov_radius_m: b.fov_radius_m,
      is_primary: b.is_primary,
    })
    await loadMaps(true)
  } catch (e) {
    console.warn('[FloorMapView] move failed:', e)
  }
}

async function updateBinding(b: CameraMapBinding, patch: Partial<CameraMapBinding>) {
  if (!selectedMap.value) return
  try {
    await floorMapApi.upsertBinding(b.map_id, {
      channel_id: b.channel_id,
      device_type: patch.device_type ?? b.device_type,
      label: patch.label ?? b.label,
      pos_x: b.pos_x,
      pos_y: b.pos_y,
      fov_yaw: patch.fov_yaw ?? b.fov_yaw,
      fov_radius_m: patch.fov_radius_m ?? b.fov_radius_m,
      is_primary: patch.is_primary ?? b.is_primary,
    })
    await loadMaps(true)
  } catch (e) {
    console.warn('[FloorMapView] updateBinding failed:', e)
    ElMessage.error('更新失败')
  }
}

async function removeBinding(b: CameraMapBinding) {
  try {
    await floorMapApi.deleteBinding(b.map_id, b.channel_id)
    await loadMaps(true)
    ElMessage.success('已解绑')
  } catch (e) {
    console.warn('[FloorMapView] removeBinding failed:', e)
    ElMessage.error('解绑失败')
  }
}

onMounted(async () => {
  await loadMaps(true)
  if (maps.value.length) selectedId.value = maps.value[0].id
  try {
    const res = await channelApi.getList({ page: 1, pageSize: 500 })
    const d = (res.data as any)?.data ?? res.data
    // [FIX 2026-09-04] channels API 实测返回 data.channels[] (非 items);
    //   原取值链得到对象非数组 → 映射循环零次, 名称/在线点从未生效
    channels.value = d?.items ?? d?.channels ?? (Array.isArray(d) ? d : [])
  } catch (e) {
    console.warn('[FloorMapView] load channels failed:', e)
  }
  // [P0-3] 告警状态轮询 (30s)
  loadAlarmChannels()
  alarmTimer = window.setInterval(loadAlarmChannels, 30000)
})
onBeforeUnmount(() => {
  if (alarmTimer) clearInterval(alarmTimer)
})
</script>

<style scoped>
.floormap-view {
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
}

/* ── 左侧列表 ── */
.floormap-view__side {
  width: 264px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.floormap-view__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.floormap-view__side-title {
  color: #B7CDE6;
  font-size: 14px;
  font-weight: 600;
}
.floormap-view__scene-filter { width: 100%; }
.floormap-view__cards {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.floormap-view__card {
  display: flex;
  gap: 10px;
  padding: 8px;
  border: 1px solid #2A3F66;
  border-radius: 6px;
  background: rgba(31, 45, 74, 0.45);
  cursor: pointer;
  transition: border-color 0.15s;
}
.floormap-view__card:hover { border-color: #3294ED; }
.floormap-view__card.is-active {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.12);
}
.floormap-view__card-thumb {
  width: 72px;
  height: 54px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid #3A5A8C;
  background: #0a1a35;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.floormap-view__card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.floormap-view__card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.floormap-view__card-name {
  color: #E8F1FA;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__card-meta {
  display: flex;
  gap: 6px;
  color: #8aa3c7;
  font-size: 11px;
}
.floormap-view__card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* ── 右侧编辑器 ── */
.floormap-view__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.floormap-view__placeholder { margin: auto; }
.floormap-view__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.floormap-view__ipt { width: 150px; }
.floormap-view__ipt--s { width: 110px; }
.floormap-view__ipt--num { width: 118px; }
.floormap-view__unit { color: #8aa3c7; font-size: 12px; }
.floormap-view__toolbar-spacer { flex: 1; }

.floormap-view__editor {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.floormap-view__canvas-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  border: 1px solid #2A3F66;
  border-radius: 6px;
  overflow: hidden;
}
.floormap-view__pending-tip {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  padding: 4px 12px;
  background: rgba(249, 58, 85, 0.18);
  border: 1px solid #F93A55;
  border-radius: 4px;
  color: #F93A55;
  font-size: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── [UX] 地图添加设备工具箱 (浮于画布右上; 宇视工具箱对标) ── */
.floormap-view__add-kit {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 7;
  width: 196px;
  padding: 10px 10px 8px;
  background: rgba(10, 22, 40, 0.88);
  border: 1px solid #2A3F66;
  border-radius: 8px;
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.floormap-view__add-kit-head {
  font-size: 13px;
  font-weight: 600;
  color: #DCE7F5;
  letter-spacing: 0.5px;
}
.floormap-view__add-kit-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.floormap-view__add-kit-type {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  background: rgba(42, 63, 102, 0.35);
  border: 1px solid transparent;
  border-radius: 6px;
  color: #B9C7DB;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.floormap-view__add-kit-type:hover {
  background: rgba(42, 63, 102, 0.6);
}
.floormap-view__add-kit-type.is-active {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.18);
  color: #EAF2FC;
}
.floormap-view__add-kit-type span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__add-kit-pick :deep(.el-select),
.floormap-view__add-kit-pick :deep(.el-input) {
  width: 100%;
}
.floormap-view__add-kit-hint {
  font-size: 11px;
  color: #7E93B4;
  text-align: center;
}

/* ── [UX] 地图添加设备工具箱 (浮于画布右上; 宇视工具箱对标) ── */
.floormap-view__add-kit {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 7;
  width: 196px;
  padding: 10px 10px 8px;
  background: rgba(10, 22, 40, 0.88);
  border: 1px solid #2A3F66;
  border-radius: 8px;
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.floormap-view__add-kit-head {
  font-size: 13px;
  font-weight: 600;
  color: #DCE7F5;
  letter-spacing: 0.5px;
}
.floormap-view__add-kit-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.floormap-view__add-kit-type {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  background: rgba(42, 63, 102, 0.35);
  border: 1px solid transparent;
  border-radius: 6px;
  color: #B9C7DB;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.floormap-view__add-kit-type:hover {
  background: rgba(42, 63, 102, 0.6);
}
.floormap-view__add-kit-type.is-active {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.18);
  color: #EAF2FC;
}
.floormap-view__add-kit-type span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__add-kit-pick :deep(.el-select),
.floormap-view__add-kit-pick :deep(.el-input) {
  width: 100%;
}
.floormap-view__add-kit-hint {
  font-size: 11px;
  color: #7E93B4;
  text-align: center;
}

/* ── 绑定面板 ── */
.floormap-view__panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #2A3F66;
  border-radius: 6px;
  background: rgba(31, 45, 74, 0.35);
  min-height: 0;
}
.floormap-view__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #2A3F66;
  color: #B7CDE6;
  font-size: 13px;
  font-weight: 600;
}
.floormap-view__panel-select { width: 140px; }
.floormap-view__panel-pick { padding: 8px 10px 0; }
.floormap-view__panel-pick-ipt { width: 100%; }
.floormap-view__binding-ipt { width: 120px; }
.floormap-view__snap {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #8aa3c7;
  font-size: 12px;
}
.floormap-view__bindings {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.floormap-view__binding {
  padding: 6px 8px;
  border: 1px solid #2A3F66;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.floormap-view__binding-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.floormap-view__binding-row--ctrl { flex-wrap: wrap; }
.floormap-view__binding-name {
  color: #E8F1FA;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__binding-label { color: #8aa3c7; font-size: 11px; }
.floormap-view__binding-spacer { flex: 1; }
.floormap-view__gps-hint {
  padding: 6px 10px;
  border-top: 1px solid #2A3F66;
  color: #00E5FF;
  font-size: 11px;
}
</style>
