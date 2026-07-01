<template>
  <div class="annotation-page">
    <!-- ===== Left Sidebar: Project List ===== -->
    <div class="sidebar">
      <el-card shadow="never" class="sidebar-card">
        <template #header>
          <div class="sidebar-header">
            <span class="sidebar-title">标注项目</span>
            <el-button type="primary" size="small" @click="showCreateDialog = true">
              + 新建
            </el-button>
          </div>
        </template>
        <div class="project-list" v-loading="projectsLoading">
          <div
            v-for="proj in projects"
            :key="proj.id"
            class="project-item"
            :class="{ active: activeProjectId === proj.id }"
            @click="selectProject(proj.id)"
          >
            <div class="project-info">
              <span class="project-name">{{ proj.name }}</span>
              <span class="project-meta">{{ proj.sample_count }} 张</span>
            </div>
            <el-button
              type="danger"
              size="small"
              link
              @click.stop="deleteProject(proj.id)"
            >
              删除
            </el-button>
          </div>
          <el-empty v-if="!projectsLoading && projects.length === 0" description="暂无项目,点击右上角新建" :image-size="48" />
        </div>
      </el-card>
    </div>

    <!-- ===== Main Content ===== -->
    <div class="main-content">
      <!-- Stats Bar -->
      <el-row :gutter="12" class="stats-row">
        <el-col :span="4" v-for="s in statCards" :key="s.label">
          <div class="stat-chip" :style="{ borderLeftColor: s.color }">
            <span class="stat-val" :style="{ color: s.color }">{{ s.value }}</span>
            <span class="stat-lbl">{{ s.label }}</span>
          </div>
        </el-col>
      </el-row>

      <!-- Toolbar -->
      <el-card shadow="never" class="toolbar-card">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-select v-model="labelFilter" style="width: 120px" @change="loadSamples">
              <el-option label="全部" value="all" />
              <el-option label="已标注" value="labeled" />
              <el-option label="未标注" value="unlabeled" />
            </el-select>
            <el-select v-model="categoryFilter" style="width: 140px" clearable placeholder="类别筛选" @change="loadSamples">
              <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-upload
              :auto-upload="true"
              :show-file-list="false"
              accept="image/*"
              :http-request="handleUpload"
              multiple
            >
              <el-button type="primary" plain size="default" :loading="uploading">上传图片</el-button>
            </el-upload>
          </div>
          <div class="toolbar-right">
            <el-button :disabled="selectedSamples.length === 0" @click="batchDelete" :loading="batchBusy">
              批量删除 ({{ selectedSamples.length }})
            </el-button>
            <el-button :disabled="selectedSamples.length === 0" type="success" @click="batchExport">
              批量导出
            </el-button>
          </div>
        </div>
      </el-card>

      <!-- Sample Grid -->
      <div class="sample-grid" v-loading="samplesLoading">
        <div
          v-for="sample in filteredSamples"
          :key="sample.id"
          class="sample-card"
          :class="{ selected: selectedSamples.includes(sample.id) }"
          @click="toggleSelect(sample.id)"
        >
          <div class="sample-thumb">
            <canvas
              :ref="(el: any) => { if (el) drawPlaceholder(el as HTMLCanvasElement, sample) }"
              class="sample-canvas"
              width="220"
              height="160"
            />
          </div>
          <div class="sample-footer">
            <span class="sample-name">{{ sample.filename }}</span>
            <el-tag
              :type="sample.labeled ? 'success' : 'info'"
              size="small"
              effect="light"
            >
              {{ sample.labeled ? sample.label : '未标注' }}
            </el-tag>
          </div>
        </div>
        <el-empty v-if="!samplesLoading && filteredSamples.length === 0 && activeProjectId !== null" description="暂无样本数据,点击上方上传" />
        <el-empty v-if="activeProjectId === null && !samplesLoading" description="请选择或新建左侧项目" />
      </div>
    </div>

    <!-- ===== Create Project Dialog ===== -->
    <el-dialog v-model="showCreateDialog" title="新建标注项目" width="420px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="项目名称">
          <el-input v-model="newProjectName" placeholder="输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="newProjectDescription" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item label="标注类别">
          <el-input v-model="newProjectCategories" placeholder="逗号分隔，如: person,car,fire" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creatingProject" @click="createProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { annotationApi, type AnnotationProject, type AnnotationSample, type BoundingBox } from '@/api/annotation'

// ── Types (view-local aliases) ──
type Project = AnnotationProject
type Sample = AnnotationSample

// ── State ──
const projects = ref<Project[]>([])
const projectsLoading = ref(false)
const activeProjectId = ref<number | null>(null)

const samples = ref<Sample[]>([])
const samplesLoading = ref(false)

const labelFilter = ref<'all' | 'labeled' | 'unlabeled'>('all')
const categoryFilter = ref<string>('')
const selectedSamples = ref<number[]>([])
const uploading = ref(false)
const batchBusy = ref(false)

const showCreateDialog = ref(false)
const newProjectName = ref('')
const newProjectDescription = ref('')
const newProjectCategories = ref('')
const creatingProject = ref(false)

// ── Computed ──
const categories = computed<string[]>(() => {
  const proj = projects.value.find(p => p.id === activeProjectId.value)
  if (!proj) return []
  try {
    const cats = typeof proj.categories === 'string' ? JSON.parse(proj.categories) : proj.categories
    return Array.isArray(cats) ? cats : []
  } catch {
    return []
  }
})

const filteredSamples = computed<Sample[]>(() => {
  let list = samples.value
  if (labelFilter.value === 'labeled') list = list.filter(s => s.labeled)
  else if (labelFilter.value === 'unlabeled') list = list.filter(s => !s.labeled)
  if (categoryFilter.value) list = list.filter(s => s.category === categoryFilter.value)
  return list
})

const statCards = computed(() => {
  const all = samples.value
  const negLabelSet = new Set(['no_helmet', 'negative', 'no_smoke', 'fire_false', 'helmet_violation'])
  return [
    { label: '总数', value: all.length, color: '#6366F1' },
    { label: '已标注', value: all.filter(s => s.labeled).length, color: '#10B981' },
    { label: '未标注', value: all.filter(s => !s.labeled).length, color: '#F59E0B' },
    { label: '正样本', value: all.filter(s => s.label && !negLabelSet.has(s.label)).length, color: '#3B82F6' },
    { label: '负样本', value: all.filter(s => negLabelSet.has(s.label)).length, color: '#EF4444' },
    { label: '选中', value: selectedSamples.value.length, color: '#8B5CF6' },
  ]
})

// ── Lifecycle ──
onMounted(async () => {
  await loadProjects()
})

watch(activeProjectId, (id) => {
  if (id !== null) {
    loadSamples()
  } else {
    samples.value = []
    selectedSamples.value = []
  }
})

// ── API calls ──
async function loadProjects() {
  projectsLoading.value = true
  try {
    const { data } = await annotationApi.listProjects()
    const payload = (data?.data ?? data) as any
    projects.value = payload?.items ?? []
    if (projects.value.length > 0 && activeProjectId.value === null) {
      activeProjectId.value = projects.value[0].id
    }
  } catch (e: any) {
    ElMessage.error(`加载项目失败: ${e?.message ?? e}`)
    projects.value = []
  } finally {
    projectsLoading.value = false
  }
}

async function loadSamples() {
  if (activeProjectId.value === null) return
  samplesLoading.value = true
  selectedSamples.value = []
  try {
    const { data } = await annotationApi.listSamples(activeProjectId.value, {
      category: categoryFilter.value || undefined,
      labelFilter: labelFilter.value,
    })
    // boxes_json string -> boxes array
    const samplePayload = (data?.data ?? data) as any
    samples.value = (samplePayload?.items ?? []).map((s: any) => {
      let boxes: BoundingBox[] = []
      if (typeof s.boxes === 'string' && s.boxes) {
        try { boxes = JSON.parse(s.boxes) } catch { boxes = [] }
      } else if (Array.isArray(s.boxes)) {
        boxes = s.boxes
      }
      return { ...s, boxes } as Sample
    })
  } catch (e: any) {
    ElMessage.error(`加载样本失败: ${e?.message ?? e}`)
    samples.value = []
  } finally {
    samplesLoading.value = false
  }
}

async function createProject() {
  const name = newProjectName.value.trim()
  if (!name) { ElMessage.warning('请输入项目名称'); return }
  creatingProject.value = true
  try {
    const cats = newProjectCategories.value.split(',').map(c => c.trim()).filter(Boolean)
    const { data } = await annotationApi.createProject({
      name,
      description: newProjectDescription.value.trim(),
      categories: cats,
    })
    ElMessage.success('项目已创建')
    showCreateDialog.value = false
    newProjectName.value = ''
    newProjectDescription.value = ''
    newProjectCategories.value = ''
    await loadProjects()
    const createdId = (data?.data ?? data) as any
    if (createdId?.id) activeProjectId.value = createdId.id
  } catch (e: any) {
    ElMessage.error(`创建失败: ${e?.message ?? e}`)
  } finally {
    creatingProject.value = false
  }
}

async function deleteProject(id: number) {
  try {
    await ElMessageBox.confirm('确定删除该项目及其所有样本?', '删除项目', { type: 'warning' })
  } catch { return }
  try {
    await annotationApi.deleteProject(id)
    ElMessage.success('已删除')
    if (activeProjectId.value === id) activeProjectId.value = null
    await loadProjects()
    if (projects.value.length > 0 && activeProjectId.value === null) {
      activeProjectId.value = projects.value[0].id
    }
  } catch (e: any) {
    ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
}

async function handleUpload(req: any) {
  if (activeProjectId.value === null) {
    ElMessage.warning('请先选择项目')
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    if (req?.file) fd.append('file', req.file)
    else if (req?.raw) fd.append('file', req.raw)
    else return
    await annotationApi.addSample(activeProjectId.value, fd)
    ElMessage.success('已上传')
    await loadSamples()
    // 更新项目 sample_count
    await loadProjects()
  } catch (e: any) {
    ElMessage.error(`上传失败: ${e?.message ?? e}`)
  } finally {
    uploading.value = false
  }
}

async function batchDelete() {
  if (selectedSamples.value.length === 0) return
  try {
    await ElMessageBox.confirm(`删除 ${selectedSamples.value.length} 个样本?`, '批量删除', { type: 'warning' })
  } catch { return }
  batchBusy.value = true
  let ok = 0, fail = 0
  for (const sid of selectedSamples.value) {
    try {
      await annotationApi.deleteSample(sid)
      ok++
    } catch {
      fail++
    }
  }
  batchBusy.value = false
  if (ok > 0) ElMessage.success(`已删除 ${ok} 个${fail > 0 ? `,失败 ${fail} 个` : ''}`)
  else ElMessage.error('删除失败')
  await loadSamples()
  await loadProjects()
}

function batchExport() {
  const items = samples.value.filter(s => selectedSamples.value.includes(s.id))
  if (items.length === 0) return
  const blob = new Blob([JSON.stringify(items.map(s => ({
    filename: s.filename,
    category: s.category,
    label: s.label,
    boxes: s.boxes,
  })), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `annotations-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${items.length} 个标注`)
}

// ── UI handlers ──
function selectProject(id: number) {
  activeProjectId.value = id
  selectedSamples.value = []
  labelFilter.value = 'all'
  categoryFilter.value = ''
}

function toggleSelect(id: number) {
  const idx = selectedSamples.value.indexOf(id)
  if (idx >= 0) selectedSamples.value.splice(idx, 1)
  else selectedSamples.value.push(id)
}

// ── Canvas placeholder drawing ──
const COLORS: Record<string, string> = {
  person: '#3B82F6', vehicle: '#F59E0B', fire: '#EF4444',
  smoke: '#9CA3AF', helmet: '#10B981', no_helmet: '#EF4444',
}

function drawPlaceholder(canvas: HTMLCanvasElement, sample: Sample) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  ctx.fillStyle = '#1E293B'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 0.5
  for (let i = 0; i < w; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke() }
  for (let i = 0; i < h; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke() }
  const color = COLORS[sample.label] || '#6366F1'
  for (const box of sample.boxes) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(box.x, box.y, box.w, box.h)
    ctx.fillStyle = color + '20'
    ctx.fillRect(box.x, box.y, box.w, box.h)
    if (sample.label) {
      ctx.fillStyle = color
      ctx.font = '11px sans-serif'
      ctx.fillText(sample.label, box.x + 3, box.y - 4)
    }
  }
  ctx.fillStyle = '#64748B'
  ctx.font = '10px monospace'
  ctx.fillText(sample.filename, 6, h - 6)
}
</script>

<style scoped>
.annotation-page {
  display: flex;
  gap: 16px;
  padding: 20px 24px;
  max-width: var(--content-max-width, 1440px);
  margin: 0 auto;
  height: calc(100vh - 80px);
  animation: fadeIn 0.3s ease;
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
}

.sidebar-card {
  border-radius: var(--radius-xl, 12px);
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-weight: var(--font-semibold, 600);
  font-size: var(--text-base, 14px);
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--radius-md, 6px);
  cursor: pointer;
  transition: background 0.15s;
}

.project-item:hover {
  background: var(--app-surface-hover);
}

.project-item.active {
  background: var(--color-primary-50, #F0F7FF);
  border: 1px solid var(--color-primary-200, #BFDBFE);
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-name {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-medium, 500);
  color: var(--app-text-primary);
}

.project-meta {
  font-size: var(--text-xs, 12px);
  color: var(--app-text-secondary);
}

.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.stats-row {
  flex-shrink: 0;
}

.stat-chip {
  background: var(--app-surface);
  border-radius: var(--radius-md, 6px);
  padding: 10px 14px;
  border-left: 3px solid;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-val {
  font-size: 20px;
  font-weight: var(--font-bold, 700);
  font-family: var(--font-number);
  line-height: 1;
}

.stat-lbl {
  font-size: var(--text-xs, 12px);
  color: var(--app-text-secondary);
}

.toolbar-card {
  flex-shrink: 0;
  border-radius: var(--radius-lg, 8px);
}

.toolbar-card :deep(.el-card__body) {
  padding: 10px 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.sample-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
  padding: 4px 0;
}

.sample-card {
  background: var(--app-surface);
  border: 2px solid transparent;
  border-radius: var(--radius-lg, 8px);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sample-card:hover {
  border-color: var(--color-primary-200, #BFDBFE);
  box-shadow: var(--shadow-card-hover);
}

.sample-card.selected {
  border-color: var(--color-primary-500, #3B82F6);
  box-shadow: 0 0 0 1px var(--color-primary-500, #3B82F6);
}

.sample-thumb {
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0F172A;
}

.sample-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.sample-footer {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.sample-name {
  font-size: var(--text-xs, 12px);
  color: var(--app-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>