/**
 * 录像上传离线识别 API — /api/v1/offline/*
 *
 * [FEAT offline-analysis 2026-09-21] v1.0 对接后端 OfflineAnalysisService
 * (设计稿: docs/plans/录像上传离线识别_v1.0.md)。
 *
 * 分片协议: raw binary (application/octet-stream), 4MB 分片;
 *   失败单片重试 3 次; 断点续传经 status 端点恢复位图;
 *   合并由 complete 触发 (后端 ffprobe 预检)。
 * 契约: HTTP 200 + {code, message, data}, code=0 即成功 (http.ts 拦截器统一
 *   reject 非零业务码, 业务侧只处理 resolve 分支); 泛型 = ApiResponse<T>,
 *   消费口径 resp.data.data (与 alarm.ts 等一致, 拦截器不剥离 envelope)。
 *   [FIX offline-analysis 2026-09-21] 初版误按 "resp.data 即 T" 消费,
 *   真机验收任务列表恒空 (envelope 未剥离) —— 必须双层取 data。
 */
import { http } from './http'
import type { ApiResponse } from '@/types/common'

// ============================================================
// 类型 (与后端 taskToJson/sessionToJson 序列化口径一致)
// ============================================================

/** 任务状态 (与后端 TaskState 枚举同构) */
export type OfflineTaskState =
  | 'UPLOADED'
  | 'QUEUED'
  | 'PRECHECK'
  | 'ANALYZING'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface OfflineTask {
  task_id: string
  upload_id: string
  name: string
  filename: string
  filesize: number
  event_types: string[]
  target_fps: number
  state: OfflineTaskState
  /** 0-100; -1 = 未知 (时长探测不到时) */
  progress: number
  message: string
  duration_s: number
  codec: string
  width: number
  height: number
  /** 虚拟通道 id (9801-9899); 详情页按此聚合关联告警 */
  channel_id: number
  created_at_ms: number
  started_at_ms: number
  finished_at_ms: number
  /** detail=true 附加 */
  rule_id?: string
  stream_id?: string
  rtp_port?: number
  algo_plugins?: string
  file_path?: string
}

export interface UploadInitParams {
  filename: string
  filesize: number
  total_chunks: number
  chunk_size: number
}

export interface UploadInitData {
  upload_id: string
  received_chunks: number[]
  done: boolean
}

export interface UploadChunkData {
  upload_id: string
  received_chunks: number[]
  done: boolean
}

export interface UploadStatusData {
  upload_id: string
  filename: string
  filesize: number
  total_chunks: number
  chunk_size: number
  completed: boolean
  file_path: string
  duration_s: number
  codec: string
  width: number
  height: number
  created_at_ms: number
  received_chunks: number[]
}

export interface UploadCompleteData {
  upload_id: string
  file_path: string
  duration_s: number
  codec: string
  width: number
  height: number
}

export interface TaskCreateParams {
  upload_id: string
  name: string
  event_types: string[]
  target_fps?: number
}

export interface TaskListData {
  tasks: OfflineTask[]
  total: number
}

// ============================================================
// REST 封装
// ============================================================

/** 上传初始化 → upload_id */
export function initUpload(params: UploadInitParams) {
  return http.post<ApiResponse<UploadInitData>>('/offline/uploads/init', params)
}

/** 单分片 raw binary 上传 */
export function uploadChunk(uploadId: string, index: number, data: Blob) {
  return http.post<ApiResponse<UploadChunkData>>(
    `/offline/uploads/${uploadId}/chunks/${index}`,
    data,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
      // 大分片经 vicap 隧道可能慢; 放宽单分片超时
      timeoutMs: 60_000,
    },
  )
}

/** 断点续传查询 → 已收分片位图 */
export function getUploadStatus(uploadId: string) {
  return http.get<ApiResponse<UploadStatusData>>(`/offline/uploads/${uploadId}/status`)
}

/** 合并 + ffprobe 预检 (失败 code=1002, 拦截器已 reject) */
export function completeUpload(uploadId: string) {
  return http.post<ApiResponse<UploadCompleteData>>(
    `/offline/uploads/${uploadId}/complete`,
    {},
  )
}

/** 创建分析任务 */
export function createTask(params: TaskCreateParams) {
  return http.post<ApiResponse<{ task_id: string }>>('/offline/tasks', params)
}

/** 任务列表 (created_at 降序) */
export function listTasks() {
  return http.get<ApiResponse<TaskListData>>('/offline/tasks')
}

/** 任务详情 */
export function getTask(taskId: string) {
  return http.get<ApiResponse<OfflineTask>>(`/offline/tasks/${taskId}`)
}

/** 取消任务 (排队中出队; 运行中杀 ffmpeg) */
export function cancelTask(taskId: string) {
  return http.post<ApiResponse<{ task_id: string; state: string }>>(
    `/offline/tasks/${taskId}/cancel`,
    {},
  )
}

/** 删除任务记录 (purge=true 连带删上传文件与虚拟通道) */
export function deleteTask(taskId: string, purge = false) {
  return http.delete<ApiResponse<{ task_id: string; purged: boolean }>>(
    `/offline/tasks/${taskId}`,
    { params: purge ? { purge: 1 } : undefined },
  )
}

// ============================================================
// 分片上传封装 (File.slice + 2 并发 + 单片重试 3 + 断点续传)
// ============================================================

/** 单分片大小 4MB (< http_server max_body_size_mb 默认 10MB) */
export const OFFLINE_CHUNK_SIZE = 4 * 1024 * 1024

/** 允许的封装扩展名 (前端预检; 后端 ffprobe 兜底) */
export const OFFLINE_ALLOWED_EXT = ['mp4', 'mov', 'avi', 'mkv', 'ts'] as const

/** 上传进度回调载荷 */
export interface UploadProgressInfo {
  phase: 'uploading' | 'merging' | 'done'
  uploadedChunks: number
  totalChunks: number
  percent: number
}

interface UploadCallbacks {
  onProgress?: (info: UploadProgressInfo) => void
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * 完整上传流程: init → 2 并发分片 (单片失败重试 3, 指数退避) → complete(合并+预检)
 * @throws Error 任一分片重试耗尽或合并预检失败 (message 取后端 message)
 */
export async function uploadVideoFile(
  file: File,
  callbacks?: UploadCallbacks,
  chunkSize = OFFLINE_CHUNK_SIZE,
): Promise<UploadCompleteData> {
  const onProgress = callbacks?.onProgress
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))

  const initResp = await initUpload({
    filename: file.name,
    filesize: file.size,
    total_chunks: totalChunks,
    chunk_size: chunkSize,
  })
  const uploadId = initResp.data.data.upload_id

  // 断点续传: 会话若已有位图 (例如页面刷新后重试同会话), 跳过已收分片
  const received = new Set<number>()
  try {
    const st = await getUploadStatus(uploadId)
    for (const idx of st.data.data.received_chunks) received.add(idx)
  } catch {
    // status 查询失败不阻断 (全新会话必然空位图)
  }

  let doneCount = received.size
  const reportProgress = () => {
    onProgress?.({
      phase: 'uploading',
      uploadedChunks: doneCount,
      totalChunks,
      percent: totalChunks > 0 ? Math.round((doneCount / totalChunks) * 100) : 0,
    })
  }
  reportProgress()

  // 2 并发 worker 池 (vicap 隧道带宽有限, 2 并发已饱和)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < totalChunks) {
      const idx = nextIndex++
      if (received.has(idx)) continue
      const blob = file.slice(idx * chunkSize, Math.min((idx + 1) * chunkSize, file.size))
      let lastErr: unknown = null
      let ok = false
      for (let retry = 0; retry < 3 && !ok; retry++) {
        try {
          const resp = await uploadChunk(uploadId, idx, blob)
          ok = true
          received.add(idx)
          doneCount++
          reportProgress()
          if (resp.data.data.done && doneCount < totalChunks) {
            // 理论不可达 (done 意味收满), 防御: 直接跳出
            return
          }
        } catch (err) {
          lastErr = err
          await sleep(1000 * (retry + 1)) // 指数退避 1s/2s/3s
        }
      }
      if (!ok) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error(`分片 ${idx} 上传失败 (已重试 3 次)`)
      }
    }
  }
  await Promise.all([worker(), worker()])

  onProgress?.({
    phase: 'merging',
    uploadedChunks: doneCount,
    totalChunks,
    percent: 100,
  })
  const complete = await completeUpload(uploadId)
  onProgress?.({ phase: 'done', uploadedChunks: totalChunks, totalChunks, percent: 100 })
  return complete.data.data
}
