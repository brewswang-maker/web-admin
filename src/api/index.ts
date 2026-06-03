/**
 * 华盾AI智能视频盒子 v7.0 - API层统一导出
 * api/index.ts — 所有API模块集中导出
 *
 * 🆕 新增导出：
 * - ApiErrorCode, ApiError, getErrorMessage — 统一错误处理
 * - TIMEOUT_PRESETS, API_VERSION — 超时预设与版本号
 * - streamHttp, recordingHttp, modelHttp, pipelineHttp, ptzHttp — 新客户端
 * - scene3dModelHttp, scene3d 模型 CRUD — 3D 场景模型资源
 */

// ── HTTP 客户端 ──
export {
  http,
  deviceHttp,
  alarmHttp,
  channelHttp,
  statsHttp,
  aiHttp,
  otaHttp,
  situationHttp,
  exportHttp,
  federationHttp,
  platformHttp,
  streamHttp,
  recordingHttp,
  modelHttp,
  pipelineHttp,
  ptzHttp,
  scene3dModelHttp,
  // 错误处理
  ApiError,
  ApiErrorCode,
  getErrorMessage,
  // 超时配置
  TIMEOUT_PRESETS,
  // 版本信息
  API_VERSION,
} from './http'

// ── 业务 API 模块 ──
export { userApi } from './user'

export { deviceApi } from './device'

export { alarmApi } from './alarm'

export { channelApi } from './channel'

export { statisticsApi } from './statistics'
export type { ScoreResponse, AlarmTrendResponse, DeviceHealthResponse, AgentActivityResponse, OnlineRateResponse, ResourceUsageResponse, ProjectAlarmResponse } from './statistics'

export { aiApi } from './ai'
export type { ChatMessage, ChatRequest, ChatResponse, ChatSession, AgentCallResult } from './ai'

export { otaApi } from './ota'
export type { FirmwareItem, FirmwareStatus, OTATask, TaskStatus, CreateTaskRequest, UploadFirmwareRequest } from './ota'

export { situationApi } from './situation'
export type { SituationOverview, MapDevicePoint, MapCluster, SituationAlarmStream, SituationAgentStatus } from './situation'

export { exportApi } from './export'
export type { ExportTask, ExportStatus, CreateExportRequest } from './export'

export { federationApi } from './federation'
export type { FederationStatus, FederationTask, FederationTaskStatus, AccuracyPoint, BoxContribution, CreateFederationTaskRequest } from './federation'

export { openPlatformApi } from './open-platform'
export type { APIKeyItem, CreateAPIKeyRequest, WebhookItem, CreateWebhookRequest, WebhookDelivery, APIEndpoint } from './open-platform'

export { rbacApi } from './rbac'
export type { Role, Permission, CreateRoleRequest, UpdateRoleRequest, Team, CreateTeamRequest } from './rbac'

export { getStreams, getStream, getStreamPlayUrl, getMultiUrls, exchangeSDP, stopStream, addProxy, getZLMStatus } from './stream'
export type { StreamInfo, ZLMStatus, MultiPlayUrls } from './stream'

export { getRecordings, playRecording, stopPlayback, downloadRecording, deleteRecording, controlPlayback } from './recording'
export type { RecordingSegment } from './recording'

export { getModels, uploadModel, activateModel, deactivateModel, deleteModel, getTpuUsage } from './model'
export type { ModelInfo } from './model'

export { getPipelines, getPipeline, savePipeline, updatePipeline, deletePipeline, startPipeline, stopPipeline } from './pipeline'
export type { Pipeline, PipelineNode, PipelineConnection } from './pipeline'

export { ptzControl, ptzStop, ptzAbsolute, getPresets, setPreset, deletePreset } from './ptz'
export type { PTZParams } from './ptz'

export { linkageApi } from './linkage'
export type { LinkageRule, LinkageAction, LinkageLog, LinkageRuleQuery, LinkageLogQuery, TimeCondition, SpatialCondition, SourceCondition, MergeCondition } from './linkage'

// ── 3D 场景模型资源 ──
export {
  getScene3DModels,
  getScene3DModelById,
  uploadScene3DModel,
  updateScene3DModel,
  deleteScene3DModel,
  getScene3DModelDownload,
  getScene3DModelCachePolicy,
  invalidateScene3DModelCache,
  getScene3DModelLodChain,
  getBestLodModel,
  batchDeleteScene3DModels,
  batchUpdateCachePolicy,
} from './scene3d-model'
export type {
  Scene3DModelMeta,
  GetScene3DModelsParams,
  UploadScene3DModelParams,
  UpdateScene3DModelParams,
  Scene3DModelDownload,
  Model3DCachePolicy,
  Model3DFormat,
  Model3DCompression,
  Model3DCategory,
  Model3DStatus,
  Model3DCacheStrategy,
  Model3DCacheHeaders,
} from '@/types/scene3d-model'

// ── 兼容层 ──
import { alarmApi } from './alarm'
import type { AlarmQuery, AlarmHandleForm } from '@/types/alarm'

/** @deprecated 使用 alarmApi.getList 代替 */
export async function getAlarms(params?: Record<string, any>) {
  const res = await alarmApi.getList(params as AlarmQuery)
  const data = (res.data as any).data ?? res.data
  return data
}

/** @deprecated 使用 alarmApi.handle 代替 */
export async function handleAlarm(id: string, action: string) {
  const form: AlarmHandleForm = { status: action as any, note: '' }
  return alarmApi.handle(id, form)
}

// ── 新增模块 ──
export { default as agentApi } from './agent'
export { default as algorithmsApi } from './algorithms'
export { default as configApi } from './config'
export { default as logsApi } from './logs'
export { default as systemApi } from './system'
export { default as faceApi } from './face'
export type {
  FaceRecord,
  FaceDatabaseStats,
  FaceMatchResult,
  FaceAlarmEvent,
  FaceDatabaseResponse,
  PaginatedRecords
} from './face'
