<template>
  <div class="image-upload" :class="{ 'is-dragover': isDragOver }">
    <!-- ── 已上传图片列表 ── -->
    <div v-if="files.length > 0" class="upload-preview-list">
      <div
        v-for="(item, idx) in files"
        :key="item.uid ?? idx"
        class="upload-preview-item"
        :class="{ 'is-error': item.status === 'error', 'is-uploading': item.status === 'uploading' }"
      >
        <!-- 缩略图 -->
        <div class="preview-thumb" @click="handlePreview(item)">
          <img
            v-if="item.previewUrl"
            :src="item.previewUrl"
            :alt="item.name"
            loading="lazy"
          />
          <el-icon v-else class="preview-placeholder"><PictureFilled /></el-icon>

          <!-- 压缩进度遮罩 -->
          <div v-if="item.status === 'compressing'" class="preview-overlay">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span class="overlay-text">压缩中</span>
          </div>

          <!-- 上传进度遮罩 -->
          <div v-else-if="item.status === 'uploading'" class="preview-overlay">
            <el-progress
              :percentage="item.uploadPercent ?? 0"
              :stroke-width="4"
              :show-text="false"
              color="#409EFF"
            />
            <span class="overlay-text">{{ item.uploadPercent ?? 0 }}%</span>
          </div>
        </div>

        <!-- 信息栏 -->
        <div class="preview-info">
          <span class="preview-name" :title="item.name">{{ item.name }}</span>
          <span class="preview-size">
            <template v-if="item.compressedSize">
              {{ formatFileSize(item.compressedSize) }}
              <span v-if="item.compressionRatio && item.compressionRatio > 0.05" class="compress-ratio">
                (-{{ (item.compressionRatio * 100).toFixed(0) }}%)
              </span>
            </template>
            <template v-else>{{ formatFileSize(item.size) }}</template>
          </span>
        </div>

        <!-- 操作 -->
        <div class="preview-actions">
          <el-button
            v-if="item.status === 'error'"
            size="small"
            type="danger"
            link
            @click="handleRetry(item, idx)"
          >
            <el-icon><RefreshRight /></el-icon>
          </el-button>
          <el-button size="small" type="danger" link @click="handleRemove(idx)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- ── 上传区域 ── -->
    <div
      v-if="files.length < maxCount"
      class="upload-dropzone"
      @click="triggerFileInput"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        :accept="accept"
        :multiple="maxCount > 1"
        class="upload-input-hidden"
        @change="handleFileChange"
      />

      <div class="dropzone-content">
        <el-icon class="dropzone-icon"><UploadFilled /></el-icon>
        <p class="dropzone-text">
          拖拽图片到此处，或 <em>点击上传</em>
        </p>
        <p class="dropzone-hint">
          支持 {{ acceptStr }}，单张 ≤{{ formatFileSize(maxSize) }}
          <template v-if="enableCompression">，自动压缩至 ≤{{ formatFileSize(compressionTarget) }}</template>
        </p>
      </div>
    </div>

    <!-- ── 压缩设置（可展开） ── -->
    <div v-if="showSettings && enableCompression" class="upload-settings">
      <el-collapse>
        <el-collapse-item title="压缩设置">
          <div class="settings-grid">
            <el-form label-width="90px" size="small">
              <el-form-item label="输出格式">
                <el-radio-group v-model="compressFormat">
                  <el-radio value="webp">WebP (推荐)</el-radio>
                  <el-radio value="jpeg">JPEG</el-radio>
                  <el-radio value="original">保持原格式</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="最大宽度">
                <el-input-number
                  v-model="compressMaxWidth"
                  :min="320"
                  :max="4096"
                  :step="320"
                  controls-position="right"
                />
              </el-form-item>
            </el-form>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ImageUpload — 图片上传组件 v7.0
 *
 * 全链路图片优化第一层接入点：
 *  - 拖拽/点击上传
 *  - 前端 Canvas 压缩（可配置）
 *  - 压缩进度 + 上传进度双轨道
 *  - 多文件管理（预览/删除/重试）
 *  - 错误隔离（单张失败不影响其他）
 */
import { ref, computed, watch } from 'vue'
import {
  UploadFilled,
  PictureFilled,
  Loading,
  Delete,
  RefreshRight,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { compressImage, formatFileSize, type CompressResult } from '@/utils/imageCompress'

// ─── Props ──────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    /** 已上传的文件列表（v-model） */
    modelValue?: UploadFileItem[]
    /** 最大文件数量 */
    maxCount?: number
    /** 单文件最大字节数（原始文件） */
    maxSize?: number
    /** 允许的文件类型 */
    accept?: string
    /** 是否启用前端压缩 */
    enableCompression?: boolean
    /** 目标输出大小（字节），仅提示用 */
    compressionTarget?: number
    /** 是否展示压缩设置面板 */
    showSettings?: boolean
    /** 自定义上传函数（返回 URL） */
    uploadFn?: (file: File) => Promise<string>
  }>(),
  {
    modelValue: () => [],
    maxCount: 9,
    maxSize: 20 * 1024 * 1024, // 20MB
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    enableCompression: true,
    compressionTarget: 512 * 1024, // 512KB
    showSettings: false,
  }
)

// ─── Emits ──────────────────────────────────────────────

const emit = defineEmits<{
  'update:modelValue': [files: UploadFileItem[]]
  'upload-success': [item: UploadFileItem, index: number]
  'upload-error': [item: UploadFileItem, error: Error, index: number]
  'preview': [item: UploadFileItem]
}>()

// ─── 类型 ───────────────────────────────────────────────

export interface UploadFileItem {
  uid: string
  name: string
  size: number
  type: string
  status: 'idle' | 'compressing' | 'uploading' | 'done' | 'error'
  /** 上传后 URL */
  url?: string
  /** 预览 URL */
  previewUrl?: string
  /** 压缩后大小 */
  compressedSize?: number
  /** 压缩率 */
  compressionRatio?: number
  /** 上传进度 0-100 */
  uploadPercent?: number
  /** 原始 File 对象 */
  raw: File
  /** 压缩后 File（用于实际上传） */
  compressed?: File
  /** 错误信息 */
  error?: string
}

// ─── 状态 ───────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement>()
const isDragOver = ref(false)
const files = ref<UploadFileItem[]>([...props.modelValue])

// 压缩设置
const compressFormat = ref<'webp' | 'jpeg' | 'original'>('webp')
const compressMaxWidth = ref(1920)

// ─── 计算属性 ───────────────────────────────────────────

const acceptStr = computed(() => {
  return props.accept
    .split(',')
    .map((s) => s.replace('image/', '').toUpperCase())
    .join('/')
})

// ─── 双向绑定 ───────────────────────────────────────────

watch(
  () => props.modelValue,
  (val) => {
    if (JSON.stringify(val) !== JSON.stringify(files.value)) {
      files.value = [...val]
    }
  },
  { deep: true }
)

watch(
  files,
  (val) => {
    emit('update:modelValue', [...val])
  },
  { deep: true }
)

// ─── 方法 ───────────────────────────────────────────────

function triggerFileInput() {
  fileInputRef.value?.click()
}

/** 生成唯一 ID */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** 过滤并添加文件 */
async function addFiles(fileList: FileList | File[]) {
  const incoming = Array.from(fileList) as File[]

  // 过滤非图片
  const images = incoming.filter((f) => f.type.startsWith('image/'))
  if (images.length < incoming.length) {
    ElMessage.warning('已过滤非图片文件')
  }

  // 超量截断
  const remaining = props.maxCount - files.value.length
  if (images.length > remaining) {
    ElMessage.warning(`最多上传 ${props.maxCount} 张，已截断`)
  }
  const toAdd = images.slice(0, remaining)

  // 超尺寸检查
  const oversized = toAdd.filter((f) => f.size > props.maxSize)
  if (oversized.length > 0) {
    ElMessage.error(`${oversized.map((f) => f.name).join(', ')} 超过 ${formatFileSize(props.maxSize)} 限制`)
    return
  }

  // 逐个处理（压缩 + 上传）
  for (const file of toAdd) {
    const item: UploadFileItem = {
      uid: uid(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'idle',
      previewUrl: URL.createObjectURL(file),
      raw: file,
    }

    files.value.push(item)
    const idx = files.value.length - 1

    // 启动处理流水线
    processFile(item, idx)
  }
}

/** 处理单文件：压缩 → 上传 */
async function processFile(item: UploadFileItem, idx: number) {
  try {
    if (props.enableCompression) {
      // ── 阶段1：压缩 ──
      item.status = 'compressing'

      const result: CompressResult = await compressImage(item.raw, {
        outputFormat:
          compressFormat.value === 'original' ? 'original' : compressFormat.value,
        maxWidth: compressMaxWidth.value,
      })

      item.compressedSize = result.compressedSize
      item.compressionRatio = result.compressionRatio
      item.compressed = new File([result.blob], item.name.replace(/\.[^.]+$/, '') + '.' + result.format, {
        type: result.blob.type,
      })

      // 更新预览（可能变为 WebP）
      if (result.previewUrl && result.format !== 'png') {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
        item.previewUrl = result.previewUrl
      }

      console.log(
        `[ImageUpload] ${item.name}: ${formatFileSize(item.size)} → ${formatFileSize(result.compressedSize)} (-${(result.compressionRatio * 100).toFixed(0)}%, ${result.elapsed.toFixed(0)}ms)`
      )
    }

    // ── 阶段2：上传 ──
    item.status = 'uploading'

    if (props.uploadFn) {
      const uploadFile = item.compressed ?? item.raw
      item.url = await props.uploadFn(uploadFile)
    }

    item.status = 'done'
    item.uploadPercent = 100
    emit('upload-success', item, idx)
  } catch (err: any) {
    item.status = 'error'
    item.error = err?.message ?? '上传失败'
    console.error(`[ImageUpload] ${item.name} failed:`, err)
    emit('upload-error', item, err, idx)
  }
}

/** 重试 */
function handleRetry(item: UploadFileItem, idx: number) {
  item.status = 'idle'
  item.error = undefined
  processFile(item, idx)
}

/** 删除 */
function handleRemove(idx: number) {
  const item = files.value[idx]
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
  files.value.splice(idx, 1)
}

/** 预览 */
function handlePreview(item: UploadFileItem) {
  emit('preview', item)
}

// ─── 文件输入/拖拽事件 ─────────────────────────────────

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addFiles(input.files)
    input.value = '' // 重置以便重复选择同一文件
  }
}

function handleDrop(e: DragEvent) {
  isDragOver.value = false
  if (e.dataTransfer?.files?.length) {
    addFiles(e.dataTransfer.files)
  }
}
</script>

<style scoped>
/* ================================================================
   ImageUpload — 图片上传组件样式
   ================================================================ */

.image-upload {
  --iu-radius: 8px;
  --iu-border: 1px dashed var(--el-border-color);
  --iu-bg: var(--el-fill-color-blank);
  --iu-hover-border: var(--el-color-primary);
  --iu-hover-bg: var(--el-color-primary-light-9);
}

/* ── 预览列表 ── */
.upload-preview-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.upload-preview-item {
  position: relative;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--iu-radius);
  overflow: hidden;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.upload-preview-item:hover {
  border-color: var(--el-color-primary-light-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
.upload-preview-item.is-error {
  border-color: var(--el-color-danger);
}
.upload-preview-item.is-uploading {
  border-color: var(--el-color-primary-light-5);
}

/* 缩略图 */
.preview-thumb {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 比例 */
  background: var(--el-fill-color-light);
  cursor: pointer;
  overflow: hidden;
}
.preview-thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--el-text-color-placeholder);
}

/* 进度遮罩 */
.preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  gap: 6px;
}
.preview-overlay .el-progress {
  width: 80%;
}
.overlay-text {
  color: #fff;
  font-size: 12px;
}

/* 信息栏 */
.preview-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  gap: 4px;
}
.preview-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.preview-size {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.compress-ratio {
  color: var(--el-color-success);
  margin-left: 2px;
}

/* 操作 */
.preview-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}
.upload-preview-item:hover .preview-actions {
  opacity: 1;
}

/* ── 拖拽区域 ── */
.upload-dropzone {
  border: var(--iu-border);
  border-radius: var(--iu-radius);
  background: var(--iu-bg);
  padding: 32px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.upload-dropzone:hover,
.is-dragover .upload-dropzone {
  border-color: var(--iu-hover-border);
  background: var(--iu-hover-bg);
}

.dropzone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.dropzone-icon {
  font-size: 40px;
  color: var(--el-text-color-placeholder);
}
.is-dragover .dropzone-icon {
  color: var(--el-color-primary);
}
.dropzone-text {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.dropzone-text em {
  color: var(--el-color-primary);
  font-style: normal;
}
.dropzone-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.upload-input-hidden {
  display: none;
}

/* ── 设置面板 ── */
.upload-settings {
  margin-top: 12px;
}
.settings-grid {
  padding: 8px 0;
}
</style>
