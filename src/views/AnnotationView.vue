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
        <div class="project-list">
          <div
            v-for="proj in projects"
            :key="proj.id"
            class="project-item"
            :class="{ active: activeProjectId === proj.id }"
            @click="selectProject(proj.id)"
          >
            <div class="project-info">
              <span class="project-name">{{ proj.name }}</span>
              <span class="project-meta">{{ proj.sampleCount }} 张</span>
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
          <el-empty v-if="projects.length === 0" description="暂无项目" :image-size="48" />
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
            <el-select v-model="labelFilter" style="width: 120px" @change="updateFilteredSamples">
              <el-option label="全部" value="all" />
              <el-option label="已标注" value="labeled" />
              <el-option label="未标注" value="unlabeled" />
            </el-select>
            <el-select v-model="categoryFilter" style="width: 140px" clearable placeholder="类别筛选">
              <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-upload
              :auto-upload="false"
              :show-file-list="false"
              accept="image/*"
              :on-change="handleUpload"
              multiple
            >
              <el-button type="primary" plain size="default">上传图片</el-button>
            </el-upload>
          </div>
          <div class="toolbar-right">
            <el-button :disabled="selectedSamples.length === 0" @click="batchDelete">
              批量删除 ({{ selectedSamples.length }})
            </el-button>
            <el-button :disabled="selectedSamples.length === 0" type="success" @click="batchExport">
              批量导出
            </el-button>
          </div>
        </div>
      </el-card>

      <!-- Sample Grid -->
      <div class="sample-grid" v-loading="loading">
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
        <el-empty v-if="filteredSamples.length === 0 && !loading" description="暂无样本数据" />
      </div>
    </div>

    <!-- ===== Create Project Dialog ===== -->
    <el-dialog v-model="showCreateDialog" title="新建标注项目" width="420px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="项目名称">
          <el-input v-model="newProjectName" placeholder="输入项目名称" />
        </el-form-item>
        <el-form-item label="标注类别">
          <el-input v-model="newProjectCategories" placeholder="逗号分隔，如: person,car,fire" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

// ── Types ──
interface Project {
  id: string
  name: string
  sampleCount: number
  categories: string[]
}
interface Sample {
  id: string
  filename: string
  labeled: boolean
  label: string
  category: string
  boxes: { x: number; y: number; w: number; h: number }[]
}

// ── Mock Data ──
const projects = ref<Project[]>([
  { id: 'p1', name: '周界入侵检测', sampleCount: 6, categories: ['person', 'vehicle'] },
  { id: 'p2', name: '安全帽识别', sampleCount: 3, categories: ['helmet', 'no_helmet'] },
  { id: 'p3', name: '烟火检测', sampleCount: 4, categories: ['fire', 'smoke'] },
])
const activeProjectId = ref('p1')

const sampleStore: Record<string, Sample[]> = {
  p1: [
    { id: 's1', filename: 'cam01_001.jpg', labeled: true, label: 'person', category: 'person', boxes: [{ x: 30, y: 40, w: 60, h: 80 }] },
    { id: 's2', filename: 'cam01_002.jpg', labeled: true, label: 'vehicle', category: 'vehicle', boxes: [{ x: 100, y: 20, w: 80, h: 50 }] },
    { id: 's3', filename: 'cam02_001.jpg', labeled: false, label: '', category: '', boxes: [] },
    { id: 's4', filename: 'cam02_002.jpg', labeled: true, label: 'person', category: 'person', boxes: [{ x: 50, y: 30, w: 40, h: 90 }] },
    { id: 's5', filename: 'cam03_001.jpg', labeled: false, label: '', category: '', boxes: [] },
    { id: 's6', filename: 'cam03_002.jpg', labeled: true, label: 'vehicle', category: 'vehicle', boxes: [{ x: 10, y: 60, w: 120, h: 70 }] },
  ],
  p2: [
    { id: 's7', filename: 'site_a_001.jpg', labeled: true, label: 'helmet', category: 'helmet', boxes: [{ x: 40, y: 10, w: 35, h: 30 }] },
    { id: 's8', filename: 'site_a_002.jpg', labeled: false, label: '', category: '', boxes: [] },
    { id: 's9', filename: 'site_b_001.jpg', labeled: true, label: 'no_helmet', category: 'no_helmet', boxes: [{ x: 60, y: 15, w: 40, h: 35 }] },
  ],
  p3: [
    { id: 's10', filename: 'zone1_fire.jpg', labeled: true, label: 'fire', category: 'fire', boxes: [{ x: 70, y: 50, w: 90, h: 60 }] },
    { id: 's11', filename: 'zone1_smoke.jpg', labeled: true, label: 'smoke', category: 'smoke', boxes: [{ x: 20, y: 30, w: 110, h: 50 }] },
    { id: 's12', filename: 'zone2_001.jpg', labeled: false, label: '', category: '', boxes: [] },
    { id: 's13', filename: 'zone2_002.jpg', labeled: false, label: '', category: '', boxes: [] },
  ],
}

// ── State ──
const loading = ref(false)
const labelFilter = ref('all')
const categoryFilter = ref('')
const selectedSamples = ref<string[]>([])
const showCreateDialog = ref(false)
const newProjectName = ref('')
const newProjectCategories = ref('')

// ── Computed ──
const currentSamples = computed(() => sampleStore[activeProjectId.value] || [])
const categories = computed(() => {
  const proj = projects.value.find(p => p.id === activeProjectId.value)
  return proj?.categories || []
})

const filteredSamples = computed(() => {
  let list = currentSamples.value
  if (labelFilter.value === 'labeled') list = list.filter(s => s.labeled)
  else if (labelFilter.value === 'unlabeled') list = list.filter(s => !s.labeled)
  if (categoryFilter.value) list = list.filter(s => s.category === categoryFilter.value)
  return list
})

const statCards = computed(() => {
  const all = currentSamples.value
  return [
    { label: '总数', value: all.length, color: '#6366F1' },
    { label: '已标注', value: all.filter(s => s.labeled).length, color: '#10B981' },
    { label: '未标注', value: all.filter(s => !s.labeled).length, color: '#F59E0B' },
    { label: '正样本', value: all.filter(s => s.label && s.label !== 'no_helmet').length, color: '#3B82F6' },
    { label: '负样本', value: all.filter(s => s.label === 'no_helmet').length, color: '#EF4444' },
    { label: '选中', value: selectedSamples.value.length, color: '#8B5CF6' },
  ]
})

// ── Actions ──
function selectProject(id: string) {
  activeProjectId.value = id
  selectedSamples.value = []
  labelFilter.value = 'all'
  categoryFilter.value = ''
}

function toggleSelect(id: string) {
  const idx = selectedSamples.value.indexOf(id)
  if (idx >= 0) selectedSamples.value.splice(idx, 1)
  else selectedSamples.value.push(id)
}

function deleteProject(id: string) {
  ElMessageBox.confirm('确定删除该项目及其所有样本?', '删除项目', { type: 'warning' }).then(() => {
    projects.value = projects.value.filter(p => p.id !== id)
    delete sampleStore[id]
    if (activeProjectId.value === id && projects.value.length > 0) {
      selectProject(projects.value[0].id)
    }
    ElMessage.success('已删除')
  }).catch(() => {})
}

function createProject() {
  if (!newProjectName.value.trim()) { ElMessage.warning('请输入项目名称'); return }
  const id = 'p' + Date.now()
  const cats = newProjectCategories.value.split(',').map(c => c.trim()).filter(Boolean)
  projects.value.push({ id, name: newProjectName.value.trim(), sampleCount: 0, categories: cats })
  sampleStore[id] = []
  showCreateDialog.value = false
  newProjectName.value = ''
  newProjectCategories.value = ''
  selectProject(id)
  ElMessage.success('项目已创建')
}

function handleUpload(file: any) {
  const id = 's' + Date.now() + Math.random().toString(36).slice(2, 6)
  const sample: Sample = { id, filename: file.name, labeled: false, label: '', category: '', boxes: [] }
  if (!sampleStore[activeProjectId.value]) sampleStore[activeProjectId.value] = []
  sampleStore[activeProjectId.value].push(sample)
  const proj = projects.value.find(p => p.id === activeProjectId.value)
  if (proj) proj.sampleCount++
  ElMessage.success(`已添加: ${file.name}`)
}

function batchDelete() {
  ElMessageBox.confirm(`删除 ${selectedSamples.value.length} 个样本?`, '批量删除', { type: 'warning' }).then(() => {
    const samples = sampleStore[activeProjectId.value]
    if (samples) {
      sampleStore[activeProjectId.value] = samples.filter(s => !selectedSamples.value.includes(s.id))
      const proj = projects.value.find(p => p.id === activeProjectId.value)
      if (proj) proj.sampleCount = sampleStore[activeProjectId.value].length
    }
    selectedSamples.value = []
    ElMessage.success('已删除')
  }).catch(() => {})
}

function batchExport() {
  const count = selectedSamples.value.length
  ElMessage.success(`已导出 ${count} 个样本标注`)
}

function updateFilteredSamples() { /* filter is reactive via computed */ }

// ── Canvas placeholder drawing ──
const COLORS: Record<string, string> = {
  person: '#3B82F6', vehicle: '#F59E0B', fire: '#EF4444',
  smoke: '#9CA3AF', helmet: '#10B981', no_helmet: '#EF4444',
}

function drawPlaceholder(canvas: HTMLCanvasElement, sample: Sample) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width, h = canvas.height
  // background
  ctx.fillStyle = '#1E293B'
  ctx.fillRect(0, 0, w, h)
  // grid
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 0.5
  for (let i = 0; i < w; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke() }
  for (let i = 0; i < h; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke() }
  // bounding boxes
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
  // filename watermark
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

/* ── Sidebar ── */
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

/* ── Main Content ── */
.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

/* ── Stats ── */
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

/* ── Toolbar ── */
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

/* ── Sample Grid ── */
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
