<template>
  <div class="channel-page">
    <!-- 返回栏 -->
    <div class="page-header">
      <div class="header-left">
        <template v-if="hasDeviceId">
          <el-button link @click="$router.push(`/devices/${deviceId}`)">
            <el-icon><ArrowLeft /></el-icon>返回设备详情
          </el-button>
          <el-divider direction="vertical" />
          <span class="device-label">
            <el-tag size="small" type="info">{{ device?.deviceType }}</el-tag>
            <strong>{{ device?.name }}</strong>
            <span class="ip">{{ device?.ip }}</span>
          </span>
        </template>
        <template v-else>
          <strong style="font-size:16px">通道管理</strong>
        </template>
      </div>
      <div class="header-right">
        <el-tag v-if="hasDeviceId" :type="deviceOnline ? 'success' : 'danger'" size="small" effect="dark">
          {{ deviceOnline ? '设备在线' : '设备离线' }}
        </el-tag>
        <el-tag v-else type="info" size="small">共 {{ filteredChannels.length }} 个通道</el-tag>
        <el-button size="small" style="margin-left:8px" @click="loadChannels">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索通道名称/ID..."
        size="small"
        clearable
        style="width:220px"
        @input="onFilterChange"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select
        v-if="!hasDeviceId"
        v-model="filterDeviceId"
        placeholder="按设备筛选"
        size="small"
        clearable
        filterable
        style="width:200px"
        @change="onFilterChange"
      >
        <el-option
          v-for="d in deviceOptions"
          :key="d.id"
          :label="d.name"
          :value="d.id"
        />
      </el-select>
      <el-select v-model="filterStatus" placeholder="按状态" size="small" clearable style="width:120px" @change="onFilterChange">
        <el-option label="在线" value="online" />
        <el-option label="离线" value="offline" />
      </el-select>
      <el-select v-model="filterProtocol" placeholder="按协议" size="small" clearable style="width:120px" @change="onFilterChange">
        <el-option label="GB28181" value="gb28181" />
        <el-option label="RTSP" value="rtsp" />
        <el-option label="ONVIF" value="onvif" />
      </el-select>
      <div class="flex-spacer" />
      <!-- 视图切换 -->
      <el-radio-group v-model="viewMode" size="small">
        <el-radio-button label="card"><el-icon><Grid /></el-icon> 卡片</el-radio-button>
        <el-radio-button label="table"><el-icon><List /></el-icon> 列表</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 批量操作栏 -->
    <transition name="el-zoom-in-top">
      <div v-if="viewMode === 'table' && selectedIds.length > 0" class="batch-bar">
        <span class="batch-info">已选 <strong>{{ selectedIds.length }}</strong> 个通道</span>
        <el-button size="small" type="danger" plain @click="handleBatchDelete">
          <el-icon><Delete /></el-icon>批量删除
        </el-button>
        <el-button size="small" type="success" plain @click="handleBatchEnable(true)">
          <el-icon><CircleCheck /></el-icon>批量启用
        </el-button>
        <el-button size="small" type="warning" plain @click="handleBatchEnable(false)">
          <el-icon><CircleClose /></el-icon>批量禁用
        </el-button>
        <el-button size="small" link @click="selectedIds = []">取消选择</el-button>
      </div>
    </transition>

    <!-- 加载状态 -->
    <div v-if="loading" style="text-align:center;padding:80px 0">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p style="color:#8c8c8c">加载通道信息...</p>
    </div>

    <!-- 空状态 -->
    <el-empty v-else-if="!filteredChannels.length" :description="hasDeviceId ? '该设备暂无通道' : '暂无通道数据'" />

    <!-- ====== 卡片视图 ====== -->
    <div v-else-if="viewMode === 'card'" class="channel-grid">
      <el-card v-for="ch in pagedChannels" :key="ch.id" shadow="hover" class="channel-card">
        <template #header>
          <div class="card-header">
            <div class="channel-identity">
              <span class="channel-no">CH{{ ch.channelNo }}</span>
              <span class="channel-name">{{ ch.name }}</span>
            </div>
            <div class="channel-status-badges">
              <el-tooltip :content="statusTooltip(ch.status)" placement="top">
                <el-tag :type="streamTagType(ch.status) as any" size="small" effect="dark">
                  {{ streamLabel(ch.status) }}
                </el-tag>
              </el-tooltip>
              <el-tooltip :content="ch.isRecording ? '录像中' : '未录像'" placement="top">
                <el-tag :type="ch.isRecording ? 'danger' : 'info'" size="small">
                  <el-icon style="margin-right:2px"><VideoCamera /></el-icon>{{ ch.isRecording ? 'REC' : '停止' }}
                </el-tag>
              </el-tooltip>
            </div>
          </div>
        </template>
        <div class="card-body">
          <el-descriptions :column="2" border size="small" title="基本信息">
            <el-descriptions-item label="通道号">{{ ch.channelNo }}</el-descriptions-item>
            <el-descriptions-item label="通道名称">{{ ch.name }}</el-descriptions-item>
            <el-descriptions-item label="分辨率">{{ ch.resolution || '-' }}</el-descriptions-item>
            <el-descriptions-item label="编码格式">
              <el-tag size="small" type="primary">{{ ch.codec || 'Unknown' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="帧率">{{ ch.fps ? ch.fps + ' fps' : '-' }}</el-descriptions-item>
            <el-descriptions-item label="码率">{{ ch.bitrate || '-' }}</el-descriptions-item>
            <el-descriptions-item label="RTSP 地址" :span="2">
              <span class="rtsp-url">{{ ch.rtspUrl || '-' }}</span>
            </el-descriptions-item>
          </el-descriptions>
          <el-descriptions :column="3" border size="small" title="性能指标" style="margin-top:12px">
            <el-descriptions-item label="码率">
              <span :class="['metric-value', bitrateClass(ch.bitrate)]">{{ ch.bitrate || '-' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="延迟">
              <span :class="['metric-value', ch.latency > 100 ? 'danger' : ch.latency > 50 ? 'warning' : '']">
                {{ ch.latency > 0 ? ch.latency + ' ms' : '-' }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="丢包率">
              <span :class="['metric-value', ch.packetLoss > 5 ? 'danger' : ch.packetLoss > 1 ? 'warning' : '']">
                {{ ch.packetLoss > 0 ? ch.packetLoss.toFixed(1) + '%' : '-' }}
              </span>
            </el-descriptions-item>
          </el-descriptions>
          <el-descriptions :column="1" border size="small" title="算法配置" style="margin-top:12px">
            <el-descriptions-item label="当前算法">
              <el-tag v-if="ch.algoPlugin && ch.algoPlugin !== '无'" size="small" type="warning">
                {{ ch.algoPlugin }}
                <el-icon style="margin-left:4px"><Setting /></el-icon>
              </el-tag>
              <span v-else style="color:#8c8c8c">未配置</span>
            </el-descriptions-item>
          </el-descriptions>
          <div class="channel-actions">
            <el-button size="small" type="primary" @click="handlePreview(ch)">
              <el-icon><VideoPlay /></el-icon>实时预览
            </el-button>
            <el-button size="small" @click="handleSnapshot(ch)">
              <el-icon><Picture /></el-icon>截图
            </el-button>
            <el-button size="small" :type="ch.isRecording ? 'danger' : ''" @click="handleRecordToggle(ch)">
              <el-icon><VideoCamera /></el-icon>{{ ch.isRecording ? '停止录像' : '开始录像' }}
            </el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => handleChannelCommand(cmd, ch)">
              <el-button size="small">
                更多<el-icon style="margin-left:4px"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="config">
                    <el-icon><Setting /></el-icon>参数配置
                  </el-dropdown-item>
                  <el-dropdown-item command="rename">
                    <el-icon><EditPen /></el-icon>重命名
                  </el-dropdown-item>
                  <el-dropdown-item command="detail">
                    <el-icon><View /></el-icon>通道详情
                  </el-dropdown-item>
                  <el-dropdown-item command="algo">
                    <el-icon><Cpu /></el-icon>算法插件
                  </el-dropdown-item>
                  <el-dropdown-item command="copyRtsp">
                    <el-icon><CopyDocument /></el-icon>复制 RTSP 地址
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon><Delete /></el-icon>删除通道
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-card>
    </div>

    <!-- ====== 表格视图 ====== -->
    <div v-else>
      <el-table
        :data="pagedChannels"
        stripe
        @selection-change="onSelectionChange"
        @row-dblclick="handleRowDblClick"
        @sort-change="onSortChange"
      >
        <el-table-column type="selection" width="45" />
        <el-table-column prop="channelNo" label="通道号" width="70" sortable="custom" />
        <el-table-column prop="name" label="通道名称" min-width="140" sortable="custom">
          <template #default="{ row }">
            <span class="table-name-cell" @dblclick.stop="startInlineRename(row)">{{ row.name }}</span>
            <el-icon v-if="row._renaming" style="margin-left:4px"><EditPen /></el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="deviceId" label="所属设备" width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="font-family:monospace;font-size:12px;color:#8c8c8c">{{ row.deviceId || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" sortable="custom">
          <template #default="{ row }">
            <el-tag :type="streamTagType(row.status) as any" size="small" effect="dark">
              {{ streamLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="codec" label="编码" width="80">
          <template #default="{ row }">
            <el-tag size="small" type="primary">{{ row.codec || 'Unknown' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="resolution" label="分辨率" width="100" />
        <el-table-column prop="fps" label="帧率" width="70" sortable="custom" />
        <el-table-column prop="algoPlugin" label="算法" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.algoPlugin && row.algoPlugin !== '无'" type="warning" size="small">{{ row.algoPlugin }}</el-tag>
            <span v-else style="color:#8c8c8c">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="handlePreview(row)">
              <el-icon><VideoPlay /></el-icon>预览
            </el-button>
            <el-button size="small" link type="primary" @click="handleDetail(row)">
              <el-icon><View /></el-icon>详情
            </el-button>
            <el-button size="small" link @click="startInlineRename(row)">
              <el-icon><EditPen /></el-icon>重命名
            </el-button>
            <el-button size="small" link type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div v-if="filteredChannels.length > 0" class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="filteredChannels.length"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        small
      />
    </div>

    <!-- 参数配置对话框 -->
    <el-dialog v-model="showConfigDialog" title="通道参数配置" width="480px">
      <el-form v-if="currentChannel" :model="configForm" label-width="100px">
        <el-form-item label="通道名称">
          <el-input v-model="configForm.name" />
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="configForm.resolution" style="width:100%">
            <el-option label="1920×1080 (1080P)" value="1920x1080" />
            <el-option label="1280×720 (720P)" value="1280x720" />
            <el-option label="704×576 (D1)" value="704x576" />
            <el-option label="352×288 (CIF)" value="352x288" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率 (FPS)">
          <el-input-number v-model="configForm.fps" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="编码格式">
          <el-select v-model="configForm.codec" style="width:100%">
            <el-option label="H.264" value="H.264" />
            <el-option label="H.265" value="H.265" />
            <el-option label="MJPEG" value="MJPEG" />
          </el-select>
        </el-form-item>
        <el-form-item label="码率上限">
          <el-select v-model="configForm.bitrate" style="width:100%">
            <el-option label="512 Kbps" value="512 Kbps" />
            <el-option label="1 Mbps" value="1 Mbps" />
            <el-option label="2 Mbps" value="2 Mbps" />
            <el-option label="4 Mbps" value="4 Mbps" />
            <el-option label="8 Mbps" value="8 Mbps" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用通道">
          <el-switch v-model="configForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveChannelConfig">保存配置</el-button>
      </template>
    </el-dialog>

    <!-- 快速重命名弹窗 -->
    <el-dialog v-model="showRenameDialog" title="通道重命名" width="360px">
      <el-input v-model="renameValue" placeholder="请输入新的通道名称" @keyup.enter="confirmRename" />
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="confirmRename">确定</el-button>
      </template>
    </el-dialog>

    <!-- 算法插件设置对话框 -->
    <el-dialog v-model="showAlgoDialog" title="算法插件设置" width="480px">
      <el-form v-if="currentChannel" label-width="100px">
        <el-form-item label="算法插件">
          <el-select v-model="algoForm.plugins" multiple placeholder="请选择算法（可多选）" style="width:100%">
            <el-option label="无（不启用算法）" value="无" />
            <el-option v-for="m in modelList" :key="m.id" :label="m.name_zh" :value="m.name_zh" />
          </el-select>
        </el-form-item>
        <el-form-item label="检测灵敏度">
          <el-slider v-model="algoForm.sensitivity" :min="1" :max="10" show-stops />
        </el-form-item>
        <el-form-item label="检测间隔(秒)">
          <el-input-number v-model="algoForm.interval" :min="1" :max="60" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAlgoDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAlgoConfig">应用插件</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDeviceStore } from '@/stores/device'
import { getDeviceChannels, updateChannel } from '@/api/devices'
import { channelApi } from '@/api/channel'
import { http } from '@/api/http'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Channel } from '@/types/device'

// ---- 算法列表 ----
const modelList = ref<any[]>([])

async function loadModelList() {
  try {
    const res = await fetch('/api/v1/models') as any
    const data = await res.json()
    modelList.value = data?.data?.models ?? []
  } catch { console.error('加载算法列表失败') }
}

const route = useRoute()
const router = useRouter()
const deviceStore = useDeviceStore()

const deviceId = computed(() => route.params.id as string)
const hasDeviceId = computed(() => !!deviceId.value && deviceId.value !== 'undefined')
const device = computed(() => deviceStore.currentDevice)
const deviceOnline = computed(() => device.value?.status === 'online')

// ---- 全部通道（加载后的原始数据） ----
const allChannels = ref<Channel[]>([])
const loading = ref(true)
const saving = ref(false)
const showConfigDialog = ref(false)
const showAlgoDialog = ref(false)
const showRenameDialog = ref(false)
const currentChannel = ref<Channel | null>(null)
const renameValue = ref('')

// ---- 筛选与搜索 ----
const searchKeyword = ref('')
const filterDeviceId = ref('')
const filterStatus = ref('')
const filterProtocol = ref('')

// ---- 视图模式 ----
const viewMode = ref<'card' | 'table'>('card')

// ---- 分页 ----
const currentPage = ref(1)
const pageSize = ref(20)

// ---- 批量选择 ----
const selectedIds = ref<string[]>([])

// ---- 排序 ----
const sortField = ref('')
const sortOrder = ref('')

// ---- 设备筛选选项 ----
const deviceOptions = ref<{ id: string; name: string }[]>([])

// ---- 配置表单 ----
const configForm = ref({ name: '', resolution: '1920x1080', fps: 25, codec: 'H.264' as Channel['codec'], bitrate: 0, enabled: true })
const algoForm = ref({ plugins: [] as string[], sensitivity: 5, interval: 5 })

// ---- 过滤后的通道 ----
const filteredChannels = computed(() => {
  let result = [...allChannels.value]
  // 关键词搜索
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    result = result.filter(ch =>
      (ch.name || '').toLowerCase().includes(kw) ||
      (ch.id || '').toLowerCase().includes(kw) ||
      (ch.deviceId || '').toLowerCase().includes(kw)
    )
  }
  // 设备筛选
  if (filterDeviceId.value) {
    result = result.filter(ch => ch.deviceId === filterDeviceId.value)
  }
  // 状态筛选
  if (filterStatus.value === 'online') {
    result = result.filter(ch => ch.status === 'active')
  } else if (filterStatus.value === 'offline') {
    result = result.filter(ch => ch.status !== 'active')
  }
  // 协议筛选
  if (filterProtocol.value) {
    result = result.filter(ch => (ch as any).protocol === filterProtocol.value)
  }
  // 排序
  if (sortField.value) {
    const field = sortField.value as keyof Channel
    const asc = sortOrder.value === 'ascending'
    result.sort((a, b) => {
      const va = a[field]
      const vb = b[field]
      if (typeof va === 'number' && typeof vb === 'number') {
        return asc ? va - vb : vb - va
      }
      const sa = String(va || '')
      const sb = String(vb || '')
      return asc ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
  }
  return result
})

const pagedChannels = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredChannels.value.slice(start, start + pageSize.value)
})

// ---- 兼容 channels 别名 (供模板使用) ----
const channels = computed(() => allChannels.value)

function onFilterChange() {
  currentPage.value = 1
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  sortField.value = prop || ''
  sortOrder.value = order || ''
}

// ---- 状态标签 ----
function streamTagType(s: string) {
  return s === 'streaming' || s === 'active' ? 'success' : s === 'error' ? 'danger' : 'info'
}
function streamLabel(s: string) {
  return s === 'streaming' || s === 'active' ? '在线' : s === 'error' ? '异常' : '离线'
}
function statusTooltip(s: string) {
  return s === 'streaming' || s === 'active' ? '通道正在推送视频流' : s === 'error' ? '通道发生错误，需检查' : '通道空闲，未推流'
}
function bitrateClass(bitrate: string | number) {
  if (!bitrate || bitrate === '-') return ''
  const val = parseFloat(String(bitrate))
  if (isNaN(val)) return ''
  return val > 4 ? 'warning' : ''
}

// ---- 数据加载 ----
async function loadChannels() {
  loading.value = true
  try {
    let items: any[] = []
    if (hasDeviceId.value) {
      await deviceStore.fetchDeviceDetail(deviceId.value)
      const chRes = await getDeviceChannels(deviceId.value) as any
      const chs: any[] = chRes?.data?.data ?? chRes?.data ?? chRes
      items = chs.length
        ? chs
        : (device.value as any)?.channels ?? []
    } else {
      const res = await channelApi.getList({
        page: 1,
        pageSize: 500,
        keyword: undefined,
      }) as any
      const raw = res?.data as any
      items = raw?.data?.channels ?? raw?.data?.items ?? raw?.data ?? []
    }

    allChannels.value = items.map((ch: any, idx: number) => ({
      id: String(ch.channel_id ?? ch.id ?? `ch_${idx}`),
      deviceId: String(ch.device_id ?? ch.deviceId ?? ''),
      channelNo: Number(ch.channelNo ?? ch.channel_no ?? idx + 1),
      name: String(ch.name || ch.channel_name || `通道 ${idx + 1}`),
      status: (ch.status === 'online' || ch.status === 'active') ? 'active'
            : (ch.status === 'error') ? 'error'
            : 'inactive',
      enabled: ch.enabled ?? true,
      codec: String(ch.codec || ch.encoding || 'H.264'),
      isRecording: Boolean(ch.isRecording ?? false),
      latency: Number(ch.latency ?? 0),
      packetLoss: Number(ch.packetLoss ?? 0),
      rtspUrl: String(ch.rtspUrl || ch.rtsp_url || ch.source_url || '-'),
      streamUrl: String(ch.streamUrl || ch.rtspUrl || ch.source_url || '-'),
      algoPlugin: String(ch.algoPlugin || ch.algo_plugin || '无'),
      bitrate: Number(ch.bitrate ?? 0),
      resolution: String(ch.resolution || '-'),
      fps: Number(ch.fps ?? 0),
      deviceType: String(ch.device_type || ch.deviceType || ''),
      vendor: String(ch.vendor || ''),
      model: String(ch.model || ''),
      protocol: String(ch.protocol || 'gb28181'),
      snapshotUrl: ch.snapshotUrl,
      metadata: (ch.metadata as Record<string, unknown>) || {},
    }))

    // 构建设备筛选选项
    const devMap = new Map<string, string>()
    for (const ch of allChannels.value) {
      if (ch.deviceId && !devMap.has(ch.deviceId)) {
        devMap.set(ch.deviceId, ch.deviceId)
      }
    }
    deviceOptions.value = Array.from(devMap.entries()).map(([id]) => ({ id, name: id }))

    // 恢复 selection
    if (viewMode.value === 'table') {
      // el-table 内部管理 selection
    }
  } catch {
    ElMessage.error('加载通道信息失败')
  } finally {
    loading.value = false
  }
}

// ---- 批量选择 ----
function onSelectionChange(rows: Channel[]) {
  selectedIds.value = rows.map(r => r.id)
}

// ---- 行操作 ----
function handlePreview(ch: Channel) {
  if (hasDeviceId.value) {
    router.push(`/live?deviceId=${deviceId.value}&channel=${ch.channelNo}`)
  } else {
    router.push(`/live?deviceId=${ch.deviceId}&channel=${ch.channelNo}`)
  }
}

function handleDetail(ch: Channel) {
  router.push(`/channels/${encodeURIComponent(ch.id)}`)
}

async function handleSnapshot(ch: Channel) {
  try {
    const res = await channelApi.captureSnapshot(ch.id) as any
    const url = res?.data?.data?.url || res?.data?.data?.snapshot_url
    if (url) {
      ElMessage.success('截图成功')
      window.open(url, '_blank')
    } else {
      ElMessage.warning('截图返回空')
    }
  } catch {
    ElMessage.error('截图失败，请确认通道正在推流')
  }
}

async function handleRecordToggle(ch: Channel) {
  const action = ch.isRecording ? '停止录像' : '开始录像'
  try {
    await ElMessageBox.confirm(`确认对通道 ${ch.name} ${action}？`, action)
    const endpoint = ch.isRecording ? `/api/v1/channels/${ch.id}/stop-record` : `/api/v1/channels/${ch.id}/start-record`
    await http.post(endpoint)
    ch.isRecording = !ch.isRecording
    ElMessage.success(`${action}指令已发送`)
  } catch { /* cancelled */ }
}

function handleChannelCommand(cmd: string, ch: Channel) {
  switch (cmd) {
    case 'config':
      currentChannel.value = ch
      configForm.value = {
        name: ch.name,
        resolution: ch.resolution || '1920x1080',
        fps: Number(ch.fps) || 25,
        codec: ch.codec || 'H.264',
        bitrate: Number(String(ch.bitrate).replace(/[^0-9.]/g, '')) || 2,
        enabled: (ch as any).enabled ?? true,
      }
      showConfigDialog.value = true
      break
    case 'rename':
      startInlineRename(ch)
      break
    case 'detail':
      handleDetail(ch)
      break
    case 'algo':
      currentChannel.value = ch
      algoForm.value = {
        plugins: (ch as any).algoPlugins?.length ? (ch as any).algoPlugins : (ch.algoPlugin && ch.algoPlugin !== '无' ? [ch.algoPlugin] : []),
        sensitivity: 5,
        interval: 5,
      }
      showAlgoDialog.value = true
      break
    case 'copyRtsp':
      navigator.clipboard.writeText(ch.rtspUrl).then(() => ElMessage.success('RTSP 地址已复制'))
        .catch(() => ElMessage.warning('复制失败，请手动复制'))
      break
    case 'delete':
      handleDelete(ch)
      break
  }
}

function handleRowDblClick(row: Channel) {
  handleDetail(row)
}

// ---- 删除单个 ----
async function handleDelete(ch: Channel) {
  try {
    await ElMessageBox.confirm(
      `确认删除通道「${ch.name}」？此操作不可撤销。`,
      '删除确认',
      { type: 'warning' }
    )
    await channelApi.remove(ch.id)
    ElMessage.success('通道已删除')
    await loadChannels()
  } catch { /* cancelled */ }
}

// ---- 批量删除 ----
async function handleBatchDelete() {
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${selectedIds.value.length} 个通道？此操作不可撤销。`,
      '批量删除确认',
      { type: 'warning' }
    )
    const res = await channelApi.batchDelete(selectedIds.value) as any
    const d = res?.data?.data ?? {}
    ElMessage.success(`批量删除完成（成功 ${d.deleted ?? 0}，失败 ${d.failed ?? 0}）`)
    selectedIds.value = []
    await loadChannels()
  } catch { /* cancelled */ }
}

// ---- 批量启用/禁用 ----
async function handleBatchEnable(enable: boolean) {
  if (!selectedIds.value.length) return
  try {
    const res = await channelApi.batchEnable(selectedIds.value, enable) as any
    const d = res?.data?.data ?? {}
    ElMessage.success(`${enable ? '批量启用' : '批量禁用'}完成（成功 ${d.updated ?? 0}，失败 ${d.failed ?? 0}）`)
    selectedIds.value = []
    await loadChannels()
  } catch {
    ElMessage.error('批量操作失败')
  }
}

// ---- 行内重命名 ----
// [docx#7/13b 2026-09-05] 通道名是告警列表设备列第一优先显示名 (enrich 链), 同样禁纯数字
function isValidChannelName(n: string): boolean {
  const v = (n || '').trim()
  if (!v) return false
  if (/^\d+$/.test(v)) {
    ElMessage.warning('通道名称禁止纯数字, 请使用可读名称 (如「大门口摄像头」)')
    return false
  }
  return true
}
function startInlineRename(ch: Channel) {
  currentChannel.value = ch
  renameValue.value = ch.name
  showRenameDialog.value = true
}

async function confirmRename() {
  if (!currentChannel.value) return
  if (!isValidChannelName(renameValue.value)) return
  saving.value = true
  try {
    await channelApi.rename(currentChannel.value.id, renameValue.value.trim())
    ElMessage.success('重命名成功')
    showRenameDialog.value = false
    await loadChannels()
  } catch {
    ElMessage.error('重命名失败')
  } finally {
    saving.value = false
  }
}

async function saveChannelConfig() {
  if (!currentChannel.value) return
  if (!isValidChannelName(configForm.value.name)) return  // [docx#13b] 禁纯数字
  saving.value = true
  try {
    await updateChannel(currentChannel.value.id, {
      name: configForm.value.name,
      resolution: configForm.value.resolution,
      fps: configForm.value.fps,
      codec: configForm.value.codec,
      bitrate: typeof configForm.value.bitrate === 'string' ? parseFloat(configForm.value.bitrate) : configForm.value.bitrate,
    } as any)
    ElMessage.success('通道配置已保存')
    showConfigDialog.value = false
    loadChannels()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function saveAlgoConfig() {
  if (!currentChannel.value) return
  saving.value = true
  try {
    const algoPlugins = algoForm.value.plugins.filter((p: string) => p !== '无')
    await updateChannel(currentChannel.value.id, {
      algoPlugin: algoPlugins[0] || '无',
    })
    ElMessage.success(`算法插件已应用（共${algoPlugins.length}个）`)
    showAlgoDialog.value = false
    loadChannels()
  } catch {
    ElMessage.error('应用失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => { loadModelList(); loadChannels() })
watch(() => route.params.id, () => loadChannels())
</script>

<style scoped>
.channel-page { padding: 0 4px; }

/* 头部 */
.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; padding: 12px 16px;
  background: var(--el-bg-color); border-radius: 8px;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.device-label { display: flex; align-items: center; gap: 8px; font-size: 15px; }
.device-label .ip { color: var(--el-text-color-secondary); font-size: 13px; font-family: monospace; }
.header-right { display: flex; gap: 8px; align-items: center; }

/* 筛选栏 */
.filter-bar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px; padding: 10px 16px;
  background: var(--el-bg-color); border-radius: 8px;
}
.flex-spacer { flex: 1; }

/* 批量操作栏 */
.batch-bar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px; padding: 8px 16px;
  background: var(--el-color-primary-light-9); border-radius: 8px;
  border: 1px solid var(--el-color-primary-light-7);
}
.batch-info { font-size: 13px; color: var(--el-text-color-regular); }
.batch-info strong { color: var(--el-color-primary); }

/* 通道卡片网格 */
.channel-grid { display: flex; flex-direction: column; gap: 16px; }
.channel-card { border-left: 3px solid var(--el-color-primary); }
.channel-card:hover { border-left-color: var(--el-color-success); }

.card-header { display: flex; justify-content: space-between; align-items: center; }
.channel-identity { display: flex; align-items: center; gap: 10px; }
.channel-no {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 24px; border-radius: 4px;
  background: var(--el-color-primary-light-9); color: var(--el-color-primary);
  font-weight: 700; font-size: 12px; font-family: monospace;
}
.channel-name { font-weight: 600; font-size: 15px; }
.channel-status-badges { display: flex; gap: 6px; }

.card-body { padding: 0 4px; }
.rtsp-url { font-family: monospace; font-size: 12px; color: var(--el-text-color-secondary); word-break: break-all; }

.metric-value { font-weight: 700; font-size: 14px; }
.metric-value.warning { color: var(--el-color-warning); }
.metric-value.danger { color: var(--el-color-danger); }

.channel-actions { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--el-border-color-lighter); }

/* 表格行 */
.table-name-cell { cursor: pointer; }
.table-name-cell:hover { color: var(--el-color-primary); }

/* 分页 */
.pagination-bar {
  display: flex; justify-content: flex-end;
  margin-top: 16px; padding: 8px 0;
}
</style>
