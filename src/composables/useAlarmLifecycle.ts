/**
 * @file useAlarmLifecycle.ts — 告警生命周期操作共享 composable (场景页对齐)
 *
 * [场景页对齐 2026-09-11] AlarmsView.vue P0-13 操作范式的场景页版:
 *   - 未完结态「处警」→ DisposeDialog; 已完结态「详情」→ AlarmPopup
 *   - 「更多」菜单: 关闭/升级/转派/标记误报/复核标注/忽略/证据链/详情
 *   - 复核标注 (false_alarm_feedback) + 证据链 (alarm evidence + 设备录像)
 *
 * 实现与 AlarmsView.vue 同款; 与基准的差异仅在刷新语义 — AlarmsView 服务端
 * 分页命令后 fetchAlarms() 重拉, 场景页为前端内存行回写 (与 onHandled 同范式,
 * 不重拉整表), 通过 onMutated 回调由调用方决定是否补拉。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { alarmApi } from '@/api/alarm'
import { screeningApi, type AlarmFeedbackItem } from '@/api/screening'
import { queryRecordings, toLocalISOString, recordUrlCandidates, type DeviceRecording } from '@/api/recording'
import { recordingHttp } from '@/api/http'
import type { AlarmEvidence } from '@/types/alarm'
import { useAuthStore } from '@/stores/auth'
import { showAlarmPopup } from '@/composables/useAlarmPopup'
import { getSnapshotUrl } from '@/composables/useAlarmTableHelpers'

export function useAlarmLifecycle(onMutated?: () => void) {
  const router = useRouter()

  // ── [P0-10] 规范处警对话框 ──
  const disposeDialogVisible = ref(false)
  const disposeTarget = ref<any>(null)
  function openDisposeDialog(row: any) {
    disposeTarget.value = row
    disposeDialogVisible.value = true
  }

  // ── 详情: 全局 AlarmPopup (与告警中心/首页同一套) ──
  function handleDetail(row: any) {
    showAlarmPopup(row)
  }

  /** 处置弹窗提交成功 (DisposeDialog @submitted) — 行状态交由弹窗广播
   *  'alarm-handled' + 各页 useRealtimeAlarmEvents 去抖重拉, 此处仅补拉回调 */
  function onDisposeSubmitted() {
    onMutated?.()
  }

  // ── [P0-3] 工单流转 ──
  async function handleAck(row: any) {
    ElMessageBox.confirm(`确认收到告警：「${row.description || row.title}」?`, '确认告警', {
      confirmButtonText: '确认收到',
      cancelButtonText: '取消',
      type: 'warning',
    }).then(async () => {
      try {
        await alarmApi.acknowledge(row.id)
        row.status = 'acknowledged'
        ElMessage.success('已确认收到')
        onMutated?.()
      } catch {
        ElMessage.error('操作失败')
      }
    }).catch(() => {})
  }

  async function handleCloseAlarm(row: any) {
    ElMessageBox.confirm(`确认关闭告警：「${row.description || row.title}」?`, '关闭告警', {
      confirmButtonText: '确认关闭',
      cancelButtonText: '取消',
      type: 'success',
    }).then(async () => {
      try {
        await alarmApi.close(row.id, '人工关闭')
        row.status = 'closed'
        ElMessage.success('已关闭')
        onMutated?.()
      } catch {
        ElMessage.error('操作失败')
      }
    }).catch(() => {})
  }

  // 标记误报
  async function handleFalse(row: any) {
    ElMessageBox.confirm(`将告警「${row.description || row.title}」标记为误报?`, '标记误报', {
      confirmButtonText: '标记误报',
      cancelButtonText: '取消',
      type: 'info',
    }).then(async () => {
      try {
        await alarmApi.handle(row.id, { status: 'false_alarm', note: '' })
        row.status = 'false_alarm'
        row.handledBy = useAuthStore().user?.name || '当前用户'
        ElMessage.success('已标记为误报')
        onMutated?.()
      } catch {
        ElMessage.error('操作失败')
      }
    }).catch(() => {})
  }

  // 忽略告警
  async function handleIgnore(row: any) {
    ElMessageBox.confirm(`忽略此告警?`, '忽略告警', {
      confirmButtonText: '忽略',
      cancelButtonText: '取消',
    }).then(async () => {
      try {
        await alarmApi.handle(row.id, { status: 'ignored', note: '' })
        row.status = 'ignored'
        ElMessage.success('已忽略')
        onMutated?.()
      } catch {
        ElMessage.error('操作失败')
      }
    }).catch(() => {})
  }

  // ── 复核标注 (false_alarm_feedback) ──
  const reviewVisible = ref(false)
  const reviewSubmitting = ref(false)
  const reviewTarget = ref<any>(null)
  const reviewVerdict = ref('true_positive')
  const reviewNote = ref('')
  const verdictMap = ref(new Map<string, string>())

  function verdictText(v?: string | null) {
    return v === 'true_positive' ? '真实' : v === 'false_positive' ? '误报' : '存疑'
  }

  /** 拉复核明细建 alarm_id→verdict 映射 (dropdown 回显), 失败不阻断列表 */
  async function loadFeedbackMap() {
    try {
      const resp = await screeningApi.queryFeedback({ limit: 500 })
      const items = resp.data?.data || []
      verdictMap.value = new Map(items.map((it: AlarmFeedbackItem) => [it.alarm_id, it.verdict]))
    } catch { /* 明细不可达时 dropdown 显示「复核标注」原文案 */ }
  }

  function openReview(row: any) {
    reviewTarget.value = row
    reviewVerdict.value = verdictMap.value.get(row.id) || 'true_positive'
    reviewNote.value = ''
    reviewVisible.value = true
  }

  async function submitReview() {
    if (!reviewTarget.value) return
    reviewSubmitting.value = true
    try {
      await screeningApi.submitFeedback({
        alarm_id: reviewTarget.value.id,
        verdict: reviewVerdict.value,
        note: reviewNote.value.trim(),
      })
      verdictMap.value.set(reviewTarget.value.id, reviewVerdict.value)
      verdictMap.value = new Map(verdictMap.value)  // 重赋触发响应式
      reviewVisible.value = false
      ElMessage.success(`已复核: ${verdictText(reviewVerdict.value)}`)
    } catch (e: any) {
      ElMessage.error(`复核提交失败: ${e?.message || e}`)
    } finally {
      reviewSubmitting.value = false
    }
  }

  // ── 证据链 ──
  const showEvidenceDialog = ref(false)
  const evidenceLoading = ref(false)
  const evidenceData = ref<AlarmEvidence | null>(null)
  const evidenceAlarmId = ref('')
  const evidenceAlarmRow = ref<any>(null)
  const deviceRecordings = ref<DeviceRecording[]>([])
  const recordingsLoading = ref(false)
  const analyzeLoading = ref(false)

  async function showEvidence(row: any) {
    evidenceAlarmId.value = row.id
    evidenceAlarmRow.value = row
    showEvidenceDialog.value = true
    evidenceLoading.value = true
    evidenceData.value = null
    deviceRecordings.value = []
    recordingsLoading.value = true
    try {
      const ev = await alarmApi.getEvidence(row.id)
      if (ev) {
        // [FIX rec-layer2 2026-09-11] 证据 videoClipUrl 是绝对单层 (http://host/record/rtp/...)
        //   → 补双层同源候选, 修复事件面板证据视频 404 黑屏 (同弹窗直显根因)
        if (ev.videoClipUrl) ev.videoClipUrl = recordUrlCandidates(ev.videoClipUrl)[0] || ev.videoClipUrl
        evidenceData.value = ev
      } else {
        const clip = row.videoClipUrl ? recordUrlCandidates(row.videoClipUrl)[0] || row.videoClipUrl : row.videoClipUrl
        evidenceData.value = { snapshotUrl: getSnapshotUrl(row), videoClipUrl: clip }
      }
    } catch {
      const clip = row.videoClipUrl ? recordUrlCandidates(row.videoClipUrl)[0] || row.videoClipUrl : row.videoClipUrl
      evidenceData.value = { snapshotUrl: getSnapshotUrl(row), videoClipUrl: clip }
    } finally {
      evidenceLoading.value = false
    }

    // 自动查询告警设备在报警时间前后的录像
    // [FIX evidence-AI 2026-08-18] 从证据 video_clip URL 提取 ZLM 流名 (gb_131...)
    //   传入, 避免 channel_id (国标 340 开头) 与实际流名 (设备注册 131 开头) 不匹配
    const clipUrl = evidenceData.value?.videoClipUrl || row.videoClipUrl || ''
    // [FIX rec-layer2 2026-09-11] clipUrl 可能是绝对 URL / 双层形态 → 宽容匹配
    //   提取流名 (原 ^/record/rtp/ 形态在绝对 URL 下永不命中, stream_name 丢失)
    const streamMatch = clipUrl.match(/\/record\/(?:record\/)?rtp\/([^/]+)\//)
    if (row.deviceId) {
      try {
        const alarmTime = new Date(row.createdAt)
        const start = new Date(alarmTime.getTime() - 3600_000)
        const end = new Date(alarmTime.getTime() + 3600_000)
        deviceRecordings.value = await queryRecordings({
          device_id: row.deviceId,
          channel_id: row.channelId || undefined,
          stream_name: streamMatch ? streamMatch[1] : undefined,
          start_time: toLocalISOString(start),
          end_time: toLocalISOString(end),
        })
      } catch (e) {
        console.warn('[useAlarmLifecycle] 查询设备录像失败:', e)
      } finally {
        recordingsLoading.value = false
      }
    } else {
      recordingsLoading.value = false
    }
  }

  async function playEvidenceRecording(rec: DeviceRecording) {
    try {
      const { data } = await recordingHttp.post(`/${rec.id}/play`, {
        device_id: rec.device_id,
        channel_id: rec.channel_id,
        start_time: rec.start_time,
        end_time: rec.end_time,
      })
      const result = data?.data || data
      if (result?.urls) {
        const url = result.urls.flv || result.urls.hls || result.urls.wsFlv || ''
        if (url) {
          window.open(url, '_blank')
        } else {
          ElMessage.warning('无可用播放地址')
        }
      } else {
        ElMessage.warning('设备不支持回放')
      }
    } catch (e: any) {
      ElMessage.error('回放失败: ' + (e.message || ''))
    }
  }

  function goToRecording(recordingId: string) {
    showEvidenceDialog.value = false
    // [T5-P5 2026-09-06 同 AlarmsView] 回放页带全告警上下文
    const row = evidenceAlarmRow.value
    const t = row?.createdAt ? new Date(row.createdAt).getTime() : Date.now()
    router.push({
      name: 'Recording',
      query: {
        recordingId,
        alarmId: evidenceAlarmId.value,
        channelId: row?.channelId || '',
        deviceId: row?.deviceId || '',
        time: String(t),
      },
    })
  }

  async function doAnalyze() {
    analyzeLoading.value = true
    try {
      const res = await alarmApi.analyzeAlarm(evidenceAlarmId.value)
      const analysis = (res as any)?.data?.data?.analysis ?? (res as any)?.data?.data
      if (analysis && evidenceData.value) {
        evidenceData.value = { ...evidenceData.value, aiAnalysis: analysis }
      }
      ElMessage.success('AI 分析完成')
    } catch {
      ElMessage.error('AI 分析失败')
    } finally {
      analyzeLoading.value = false
    }
  }

  // ── [P0-13] 「更多」菜单命令分发 (同 AlarmsView handleLifecycleCommand) ──
  async function handleLifecycleCommand(cmd: string, row: any) {
    switch (cmd) {
      case 'review':
        openReview(row)
        break
      case 'escalate':
        ElMessageBox.confirm(`升级此告警到更高优先级?`, '升级告警', {
          confirmButtonText: '升级',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(async () => {
          try {
            await alarmApi.escalate(row.id)
            row.status = 'escalated'
            ElMessage.success('已升级')
            onMutated?.()
          } catch { ElMessage.error('操作失败') }
        }).catch(() => {})
        break
      case 'reassign':
        ElMessageBox.prompt('请输入转派目标人', '转派告警', {
          confirmButtonText: '转派',
          cancelButtonText: '取消',
          inputPlaceholder: '处理人用户名...',
        }).then(async ({ value }) => {
          try {
            await alarmApi.reassign(row.id, value)
            row.status = 'reassigned'
            ElMessage.success(`已转派给 ${value}`)
            onMutated?.()
          } catch { ElMessage.error('操作失败') }
        }).catch(() => {})
        break
      case 'false_alarm':
        handleFalse(row)
        break
      case 'close':
        handleCloseAlarm(row)
        break
      case 'ignore':
        handleIgnore(row)
        break
      case 'evidence':
        showEvidence(row)
        break
      case 'detail':
        handleDetail(row)
        break
    }
  }

  return {
    // 处置
    disposeDialogVisible, disposeTarget, openDisposeDialog, onDisposeSubmitted,
    // 详情
    handleDetail,
    // 生命周期
    handleAck, handleCloseAlarm, handleFalse, handleIgnore, handleLifecycleCommand,
    // 复核标注
    reviewVisible, reviewSubmitting, reviewTarget, reviewVerdict, reviewNote,
    verdictMap, verdictText, loadFeedbackMap, openReview, submitReview,
    // 证据链
    showEvidenceDialog, evidenceLoading, evidenceData, evidenceAlarmId, evidenceAlarmRow,
    deviceRecordings, recordingsLoading, analyzeLoading,
    showEvidence, playEvidenceRecording, goToRecording, doAnalyze,
  }
}
