<template>
  <div class="scene-edit-panel">
    <div class="edit-header">
      <span class="edit-title">3D 位置编辑</span>
      <el-button size="small" type="danger" plain @click="$emit('exit')">退出编辑</el-button>
    </div>

    <div v-if="!selectedDevice" class="edit-empty">
      <el-icon :size="32"><PointerIcon /></el-icon>
      <p>点击或拖拽场景中的设备进行编辑</p>
    </div>

    <template v-else>
      <div class="device-info">
        <div class="device-name">{{ selectedDevice.name }}</div>
        <div class="device-id" v-if="selectedDevice.businessId">ID: {{ selectedDevice.businessId }}</div>
      </div>

      <el-form label-width="60px" size="small" class="edit-form">
        <el-form-item label="X 坐标">
          <el-input-number
            v-model="editData.x"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Y 高度">
          <el-input-number
            v-model="editData.y"
            :step="0.5"
            :precision="1"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Z 坐标">
          <el-input-number
            v-model="editData.z"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="朝向">
          <el-input-number
            v-model="editData.rotation"
            :step="0.1"
            :precision="2"
            controls-position="right"
            style="width: 100%"
          />
          <span class="hint">弧度 ({{ (editData.rotation * 180 / Math.PI).toFixed(0) }}°)</span>
        </el-form-item>
        <el-form-item label="视场角">
          <el-slider
            v-model="editData.fov"
            :min="30"
            :max="120"
            :step="1"
            show-input
            :show-input-controls="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="归属">
          <el-select v-model="editData.buildingId" placeholder="选择归属建筑" clearable style="width: 100%">
            <el-option
              v-for="b in buildings"
              :key="b.name"
              :label="b.name"
              :value="b.name"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="edit-actions">
        <el-button size="small" @click="resetPosition" :disabled="saving">重置</el-button>
        <el-button size="small" type="warning" plain @click="clearPlacement" :disabled="saving || !isManual">恢复自动</el-button>
        <el-button size="small" type="primary" @click="savePlacement" :loading="saving">保存</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Pointer as PointerIcon } from '@element-plus/icons-vue'
import { sceneApi } from '@/api/scene'

interface EditDevice {
  id: string
  name: string
  businessId?: string
  x: number
  y: number
  z: number
  rotation: number
  fov: number
  buildingId?: string
  isManual?: boolean
}

const props = defineProps<{
  selectedDevice: EditDevice | null
  buildings: Array<{ name: string }>
}>()

const emit = defineEmits<{
  'device-updated': [deviceId: string, data: { x: number; y: number; z: number; rotation: number; fov: number }]
  'device-cleared': [deviceId: string]
  'exit': []
}>()

const saving = ref(false)
const isManual = ref(false)

const editData = reactive({
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  fov: 65,
  buildingId: '' as string,
})

// Sync selected device to form
watch(() => props.selectedDevice, (dev) => {
  if (dev) {
    editData.x = dev.x
    editData.y = dev.y
    editData.z = dev.z
    editData.rotation = dev.rotation || 0
    editData.fov = dev.fov || 65
    editData.buildingId = dev.buildingId || ''
    isManual.value = !!dev.isManual
  }
}, { immediate: true })

async function savePlacement() {
  if (!props.selectedDevice?.businessId) {
    ElMessage.warning('演示设备无法保存位置')
    return
  }
  saving.value = true
  try {
    await sceneApi.updatePlacement(props.selectedDevice.businessId, {
      sceneX: editData.x,
      sceneY: editData.y,
      sceneZ: editData.z,
      rotation: editData.rotation,
      fov: editData.fov,
      buildingId: editData.buildingId || undefined,
    })
    ElMessage.success('设备位置已保存')
    emit('device-updated', props.selectedDevice.id, {
      x: editData.x,
      y: editData.y,
      z: editData.z,
      rotation: editData.rotation,
      fov: editData.fov,
    })
  } catch (err) {
    ElMessage.error('保存失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    saving.value = false
  }
}

async function clearPlacement() {
  if (!props.selectedDevice?.businessId) return
  saving.value = true
  try {
    await sceneApi.clearPlacement(props.selectedDevice.businessId)
    ElMessage.success('已恢复自动映射')
    isManual.value = false
    emit('device-cleared', props.selectedDevice.id)
  } catch (err) {
    ElMessage.error('清除失败: ' + (err instanceof Error ? err.message : '未知错误'))
  } finally {
    saving.value = false
  }
}

function resetPosition() {
  if (props.selectedDevice) {
    editData.x = props.selectedDevice.x
    editData.y = props.selectedDevice.y
    editData.z = props.selectedDevice.z
    editData.rotation = props.selectedDevice.rotation || 0
    editData.fov = props.selectedDevice.fov || 65
  }
}
</script>

<style scoped>
.scene-edit-panel {
  width: 280px;
  background: rgba(15, 20, 35, 0.95);
  border: 1px solid rgba(100, 150, 255, 0.2);
  border-radius: 8px;
  padding: 16px;
  color: #E8EAED;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-title {
  font-size: 15px;
  font-weight: 600;
  color: #8ab4f8;
}

.edit-empty {
  text-align: center;
  padding: 32px 0;
  color: rgba(255, 255, 255, 0.4);
}

.edit-empty p {
  margin-top: 8px;
  font-size: 12px;
}

.device-info {
  background: rgba(26, 115, 232, 0.1);
  border-radius: 6px;
  padding: 8px 12px;
}

.device-name {
  font-weight: 600;
  font-size: 14px;
}

.device-id {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

.edit-form {
  margin-top: 4px;
}

.edit-form :deep(.el-form-item__label) {
  color: rgba(255, 255, 255, 0.6);
}

.hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  margin-left: 8px;
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
