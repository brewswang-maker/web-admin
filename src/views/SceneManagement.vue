<template>
  <div class="scene-management">
    <div class="sm-header">
      <h2>3D 场景管理</h2>
      <div class="sm-actions">
        <el-button type="primary" size="small" @click="addScene">新建场景</el-button>
        <el-button size="small" @click="saveConfig" :loading="saving" :disabled="loadFailed">保存配置</el-button>
      </div>
    </div>
    <div class="sm-body">
      <div class="sm-scene-list">
        <div class="sm-section-title">场景方案</div>
        <div v-for="scene in scenes" :key="scene.id" :class="['scene-item', { active: scene.id === activeSceneId }]" @click="selectScene(scene.id)">
          <span class="scene-item-name">{{ scene.name }}</span>
          <span class="scene-item-meta">{{ scene.buildings.length }} 栋建筑</span>
        </div>
      </div>
      <div class="sm-editor" v-if="activeScene">
        <div class="sm-section-title">{{ activeScene.name }} — 建筑列表<el-button size="small" type="primary" plain @click="addBuilding">+ 添加建筑</el-button></div>
        <el-scrollbar class="building-list-scroll">
          <div v-for="(b, idx) in activeScene.buildings" :key="idx" class="building-edit-row">
            <el-input v-model="b.name" size="small" placeholder="名称" style="width: 100px" />
            <el-input-number v-model="b.x" size="small" :step="1" style="width: 80px" />
            <el-input-number v-model="b.z" size="small" :step="1" style="width: 80px" />
            <el-input-number v-model="b.w" size="small" :step="1" :min="1" style="width: 70px" />
            <el-input-number v-model="b.d" size="small" :step="1" :min="1" style="width: 70px" />
            <el-input-number v-model="b.h" size="small" :step="1" :min="1" style="width: 70px" />
            <el-color-picker v-model="b.color" size="small" />
            <el-button size="small" type="danger" link @click="removeBuilding(idx)">删除</el-button>
          </div>
        </el-scrollbar>
      </div>
      <div class="sm-preview">
        <div class="sm-section-title">实时预览
          <div style="display:flex;gap:6px">
            <el-upload :show-file-list="false" :before-upload="onGroundImageUpload" accept="image/*">
              <el-button size="small" type="primary" plain>P2-1 CAD底图</el-button>
            </el-upload>
            <el-button size="small" :type="drawBuildingMode ? 'warning' : 'primary'" plain @click="drawBuildingMode = !drawBuildingMode">
              {{ drawBuildingMode ? '退出绘制' : 'P2-2 画建筑' }}
            </el-button>
          </div>
        </div>
        <Scene3D
          v-if="activeScene?.buildings?.length || groundImageUrl"
          ref="previewScene3dRef"
          :key="activeSceneId"
          class="preview-3d"
          :devices="[]"
          :buildings="previewBuildings"
          :ground-image-url="groundImageUrl"
          :draw-building-mode="drawBuildingMode"
          :show-mini-map="false"
          :initial-camera="activeScene?.camera"
          @building-create="onBuildingCreate"
        />
        <div v-else class="preview-empty">暂无建筑数据</div>
        <!-- [CAM-POSE 2026-09-16] 初始视角设置: 进入 3D 场景(大屏/全屏)时的固定相机位姿,
             存 scene_config.json scenes[].camera; 可在预览里拖好视角后点"用当前预览视角"捕获 -->
        <div class="sm-camera-card">
          <div class="sm-section-title">初始视角
            <span class="sm-camera-badge" :class="{ custom: camCustomized }">{{ camCustomized ? '已自定义' : '默认位姿' }}</span>
          </div>
          <div class="sm-camera-row">
            <span class="sm-camera-label">位置</span>
            <el-input-number v-model="camForm.px" size="small" :controls="false" style="width:72px" @change="camCustomized = true" />
            <el-input-number v-model="camForm.py" size="small" :controls="false" style="width:72px" @change="camCustomized = true" />
            <el-input-number v-model="camForm.pz" size="small" :controls="false" style="width:72px" @change="camCustomized = true" />
          </div>
          <div class="sm-camera-row">
            <span class="sm-camera-label">目标</span>
            <el-input-number v-model="camForm.tx" size="small" :controls="false" style="width:72px" @change="camCustomized = true" />
            <el-input-number v-model="camForm.ty" size="small" :controls="false" style="width:72px" @change="camCustomized = true" />
            <el-input-number v-model="camForm.tz" size="small" :controls="false" style="width:72px" @change="camCustomized = true" />
          </div>
          <div class="sm-camera-row">
            <el-button size="small" type="primary" plain @click="captureCamFromPreview">用当前预览视角</el-button>
            <el-button size="small" @click="resetCamForm">恢复默认</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { sceneApi, type SceneConfig, type SceneScheme, type SceneCamera } from '@/api/scene'
import type { Building3DNode } from '@/components/scene3d/types/scene3d'
import Scene3D from '@/components/Scene3D.vue'

const saving = ref(false)
/** [FIX 2026-09-16] 配置加载失败标志: 失败时页面仅展示默认模板, 禁止保存以免全量 PUT 覆盖设备场景数据 */
const loadFailed = ref(false)
const scenes = ref<SceneConfig[]>([])
const activeSceneId = ref('default')
const activeScene = computed(() => scenes.value.find(s => s.id === activeSceneId.value) || scenes.value[0] || null)
/** SceneBuilding 与 Building3DNode 字段同名同义（tiers 类型宽度不同），双重断言对齐 */
const previewBuildings = computed(() => (activeScene.value?.buildings || []) as unknown as Building3DNode[])

onMounted(async () => {
  try {
    const res = await sceneApi.getConfig()
    const config = res.data?.data as SceneScheme
    if (config?.scenes?.length) {
      scenes.value = config.scenes
      activeSceneId.value = config.activeSceneId || config.scenes[0].id
      loadFailed.value = false
    } else {
      scenes.value = [createDefaultScene()]
      loadFailed.value = true
    }
  } catch {
    // [FIX 2026-09-16] 加载失败不再静默降级: 标记失败态并提示 (曾导致隧道波动时默认模板覆盖设备体育场场景)
    scenes.value = [createDefaultScene()]
    loadFailed.value = true
    ElMessage.warning('场景配置加载失败，已禁止保存以避免覆盖设备数据；请刷新页面重试')
  }
  syncCamForm()
})

function createDefaultScene(): SceneConfig {
  return {
    id: 'default', name: '默认厂区',
    buildings: [
      { id: 'b1', name: '1号车间', x: -20, z: -15, w: 24, d: 16, h: 8, color: '#1A73E8' },
      { id: 'b2', name: '2号车间', x: 15, z: -15, w: 20, d: 14, h: 7, color: '#0F9D58' },
      { id: 'b3', name: '仓库', x: -25, z: 15, w: 18, d: 12, h: 6, color: '#F4B400' },
      { id: 'b4', name: '办公楼', x: 20, z: 15, w: 16, d: 12, h: 12, color: '#7C3AED' },
      { id: 'b5', name: '配电房', x: 35, z: -5, w: 8, d: 8, h: 4, color: '#666666' },
      { id: 'b6', name: '门卫室', x: 0, z: 42, w: 6, d: 4, h: 3, color: '#888888' },
    ],
    fences: [
      { x: -55, y: 0, z: 0, width: 0.3, height: 3, depth: 100 },
      { x: 55, y: 0, z: 0, width: 0.3, height: 3, depth: 100 },
      { x: 0, y: 0, z: -48, width: 110, height: 3, depth: 0.3 },
      { x: 0, y: 0, z: 48, width: 110, height: 3, depth: 0.3 },
    ],
    ground: { width: 120, height: 100 },
  }
}

function selectScene(id: string) { activeSceneId.value = id; syncCamForm() }
function addScene() {
  const id = 'scene-' + Date.now()
  scenes.value.push({ id, name: '新场景', buildings: [], ground: { width: 120, height: 100 } })
  activeSceneId.value = id
  syncCamForm()
}
function addBuilding() {
  if (!activeScene.value) return
  activeScene.value.buildings.push({ id: 'b-' + Date.now(), name: '新建筑', x: 0, z: 0, w: 10, d: 10, h: 5, color: '#1A73E8' })
}
function removeBuilding(idx: number) { activeScene.value?.buildings.splice(idx, 1) }
async function saveConfig() {
  // [FIX 2026-09-16] 加载失败时禁止保存(全量 PUT 会覆盖设备真实场景)
  if (loadFailed.value) {
    ElMessage.error('场景配置未成功加载，禁止保存以避免覆盖设备数据；请刷新页面重试')
    return
  }
  applyCamForm()
  saving.value = true
  try {
    await sceneApi.saveConfig({ version: '1.0.0', activeSceneId: activeSceneId.value, scenes: scenes.value })
    ElMessage.success('场景配置已保存')
  } catch (err) { ElMessage.error('保存失败') } finally { saving.value = false }
}

// ── [CAM-POSE 2026-09-16] 初始视角设置 ──
/** 初始视角 = 进入 3D 场景(大屏/全屏)时的固定相机位姿；存 scene_config.json
 *  scenes[].camera（后端透传存取）；缺省时 Scene3D 内部兜底同一默认位姿 */
/** 默认位姿（与 Scene3D.vue DEFAULT_CAM_POSE 保持一致: 体育场调校值） */
const CAM_DEFAULT: SceneCamera = { position: [45, 35, 55], target: [0, 5, 0] }
/** 表单缓冲（camera 缺省时也能直接编辑; 保存/捕获时再写回场景） */
const camForm = reactive({
  px: CAM_DEFAULT.position[0], py: CAM_DEFAULT.position[1], pz: CAM_DEFAULT.position[2],
  tx: CAM_DEFAULT.target[0], ty: CAM_DEFAULT.target[1], tz: CAM_DEFAULT.target[2],
})
const camCustomized = ref(false)

/** 切换/加载场景后同步表单（已保存 camera → 回显; 无 → 默认位姿） */
function syncCamForm() {
  const c = activeScene.value?.camera
  camCustomized.value = !!c
  camForm.px = c?.position?.[0] ?? CAM_DEFAULT.position[0]
  camForm.py = c?.position?.[1] ?? CAM_DEFAULT.position[1]
  camForm.pz = c?.position?.[2] ?? CAM_DEFAULT.position[2]
  camForm.tx = c?.target?.[0] ?? CAM_DEFAULT.target[0]
  camForm.ty = c?.target?.[1] ?? CAM_DEFAULT.target[1]
  camForm.tz = c?.target?.[2] ?? CAM_DEFAULT.target[2]
}

/** 捕获当前预览视角填入表单（预览里拖动相机调好位置后点击） */
function captureCamFromPreview() {
  const pose = previewScene3dRef.value?.getCameraPose?.()
  if (!pose) { ElMessage.warning('预览场景未就绪，无法捕获视角'); return }
  const r1 = (n: number) => Math.round(n * 10) / 10
  camForm.px = r1(pose.position[0]); camForm.py = r1(pose.position[1]); camForm.pz = r1(pose.position[2])
  camForm.tx = r1(pose.target[0]); camForm.ty = r1(pose.target[1]); camForm.tz = r1(pose.target[2])
  camCustomized.value = true
  ElMessage.success('已捕获当前预览视角，点"保存配置"生效')
}

/** 恢复默认位姿（保存时移除本场景 camera 字段） */
function resetCamForm() {
  camCustomized.value = false
  camForm.px = CAM_DEFAULT.position[0]; camForm.py = CAM_DEFAULT.position[1]; camForm.pz = CAM_DEFAULT.position[2]
  camForm.tx = CAM_DEFAULT.target[0]; camForm.ty = CAM_DEFAULT.target[1]; camForm.tz = CAM_DEFAULT.target[2]
}

/** 表单写回场景（保存配置前调用）: 已自定义→写 camera 字段; 恢复默认→移除字段 */
function applyCamForm() {
  const s = activeScene.value
  if (!s) return
  if (!camCustomized.value) { delete s.camera; return }
  const r1 = (n: number) => Math.round(n * 10) / 10
  s.camera = {
    position: [r1(camForm.px), r1(camForm.py), r1(camForm.pz)],
    target: [r1(camForm.tx), r1(camForm.ty), r1(camForm.tz)],
  }
}

// P2-1: CAD 底图上传
const groundImageUrl = ref('')
const previewScene3dRef = ref<InstanceType<typeof Scene3D> | null>(null)
function onGroundImageUpload(file: File): boolean {
  const reader = new FileReader()
  reader.onload = (e) => {
    groundImageUrl.value = e.target?.result as string
    ElMessage.success('CAD底图已加载（仅本地预览，保存后需通过场景配置上传）')
  }
  reader.readAsDataURL(file)
  return false // 阻止自动上传
}

// P2-2: 建筑绘制模式
const drawBuildingMode = ref(false)
function onBuildingCreate(payload: { x: number; z: number; w: number; d: number }) {
  if (!activeScene.value) return
  const newBuilding = {
    id: 'b-' + Date.now(),
    name: '新建筑 ' + (activeScene.value.buildings.length + 1),
    x: Math.round(payload.x),
    z: Math.round(payload.z),
    w: Math.round(payload.w),
    d: Math.round(payload.d),
    h: 6,
    color: '#1A73E8',
  }
  activeScene.value.buildings.push(newBuilding)
  ElMessage.success('已创建建筑: ' + newBuilding.name + ' (' + newBuilding.w + 'x' + newBuilding.d + ')')
}
</script>

<style scoped>
.scene-management { display: flex; flex-direction: column; height: 100%; background: #0a0c10; color: #E8EAED; }
.sm-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid rgba(100,150,255,0.1); }
.sm-header h2 { font-size: 18px; color: #8ab4f8; margin: 0; }
.sm-body { display: flex; flex: 1; gap: 12px; padding: 12px; overflow: hidden; }
.sm-scene-list { width: 200px; }
.sm-section-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
.scene-item { padding: 8px 12px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
.scene-item:hover { background: rgba(26,115,232,0.1); }
.scene-item.active { background: rgba(26,115,232,0.2); border-color: rgba(26,115,232,0.4); }
.scene-item-name { display: block; font-size: 13px; }
.scene-item-meta { font-size: 11px; color: rgba(255,255,255,0.4); }
.sm-editor { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.building-list-scroll { flex: 1; overflow-y: auto; }
.building-edit-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid rgba(100,150,255,0.05); }
.sm-preview { width: 400px; display: flex; flex-direction: column; }
.preview-3d { flex: 1; border-radius: 8px; overflow: hidden; border: 1px solid rgba(100,150,255,0.15); }
.preview-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); }
.sm-camera-card { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(100,150,255,0.15); border-radius: 8px; background: rgba(26,115,232,0.06); }
.sm-camera-card .sm-section-title { margin-bottom: 6px; }
.sm-camera-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.sm-camera-label { font-size: 12px; color: rgba(255,255,255,0.55); width: 28px; }
.sm-camera-badge { font-size: 11px; font-weight: 400; padding: 1px 6px; border-radius: 3px; color: rgba(255,255,255,0.45); background: rgba(255,255,255,0.08); }
.sm-camera-badge.custom { color: #39C76F; background: rgba(57,199,111,0.15); }
</style>
