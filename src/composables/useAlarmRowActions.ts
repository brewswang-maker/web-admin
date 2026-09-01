/**
 * composables/useAlarmRowActions.ts — 告警行级操作共享逻辑 (2026-09-01)
 *
 * 供各场景事件列表复用 (周界/安检/无人值守/大型活动): 用户决策
 * 「点击详情直接打开报警弹窗 + 处理报警等操作, 其他场景处理一样」。
 * 详情统一走全局 AlarmPopup (对齐 AlarmsView 1b UX 决策: 与告警中心/
 * 首页实时条目同一套弹窗, 含快照/实时流/回放/AI 研判/操作按钮)。
 * 处理动作对齐 AlarmsView handleFalse/handleIgnore 范式: confirm → PUT
 * /alarms/:id/handle → 行内状态回写。
 */
import { showAlarmPopup } from './useAlarmPopup'
import { alarmApi } from '@/api/alarm'
import { ElMessage, ElMessageBox } from 'element-plus'

export type AlarmRowHandleStatus = 'confirmed' | 'false_alarm' | 'ignored'

export function useAlarmRowActions() {
  /** 详情: 打开全局报警弹窗 (row 需含 id, 内部自行 normalize) */
  function openAlarmPopup(row: any) {
    return showAlarmPopup(row)
  }

  /** 处理单条告警: status 语义 confirmed=确认告警 / false_alarm=标记误报 / ignored=忽略 */
  async function handleAlarmRow(
    row: any,
    status: AlarmRowHandleStatus,
    /** 操作成功后的行内回写 (可选; 不传则仅提示) */
    onDone?: (id: string, status: AlarmRowHandleStatus) => void,
  ) {
    const desc = row?.description || row?.title || row?.type || '该告警'
    const CONF: Record<AlarmRowHandleStatus, { title: string; btn: string; msg: string; ok: string }> = {
      confirmed: { title: '确认告警', btn: '确认', msg: `确认告警「${desc}」为真实事件?`, ok: '已确认' },
      false_alarm: { title: '标记误报', btn: '标记误报', msg: `将告警「${desc}」标记为误报?`, ok: '已标记为误报' },
      ignored: { title: '忽略告警', btn: '忽略', msg: `忽略告警「${desc}」? 忽略后不再提醒。`, ok: '已忽略' },
    }
    const c = CONF[status]
    try {
      await ElMessageBox.confirm(c.msg, c.title, { confirmButtonText: c.btn, cancelButtonText: '取消', type: 'warning' })
    } catch {
      return // 用户取消
    }
    try {
      await alarmApi.handle(row.id, { status, note: '' })
      onDone?.(row.id, status)
      ElMessage.success(c.ok)
    } catch (e) {
      ElMessage.error('操作失败: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return { openAlarmPopup, handleAlarmRow }
}
