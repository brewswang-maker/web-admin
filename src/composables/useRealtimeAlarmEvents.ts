/**
 * @file useRealtimeAlarmEvents.ts — 场景页实时告警刷新共享 composable
 *
 * [FIX realtime-push 2026-09-06] 用户六方向之 2: 首页与各应用场景的报警事件
 *   必须事件发生即实时刷新, 无需手动 F5。
 *
 * 现状缺口 (grep 实锚): large-event/school/gas-station/hotel-unattended/screening
 *   各场景页告警列表均仅 onMounted 拉取一次, 无任何 WS 订阅。
 *
 * 方案: useGlobalAlarm 单例 (App.vue 启动, 无限重连 + 断线补拉) 对 alarm 类
 *   消息派发 window 'linkage-ws-event' — 本 composable 监听该事件, 去抖触发
 *   调用方刷新回调。零新增 WS 连接 (复用全局单例), 页面卸载自动清理。
 *
 * [FIX handle-refresh 2026-09-10] 处警后状态同步: 处置成功 (弹窗
 *   useAlarmPopup / 行内 useAlarmRowActions) 只回写当前对象, 各场景事件
 *   列表/KPI 停留处置前快照 (status 仍 unhandled) — 同一 handler 追加监听
 *   'alarm-handled' 广播 (两路径处置成功后均派发), 去抖重拉即拿到后端回填的
 *   治理字段 (status/disposition/ticket_id)。
 *
 * 刷新语义: 去抖重拉 (而非逐页插入) — 各场景页自带过滤/归一逻辑 (类型集/
 *   时间窗/自定义展示), 插入逻辑逐页复制易漏过滤导致串显; 重拉与
 *   DashboardView.subscribe('alarm') 去抖重拉同范式, 告警量级 (秒级间隔)
 *   下开销可忽略。
 *
 * @example
 *   // 场景页内:
 *   useRealtimeAlarmEvents(() => loadAlarms())
 */
import { onMounted, onUnmounted } from 'vue'

export function useRealtimeAlarmEvents(onAlarm: () => void, debounceMs = 800) {
  let timer: number | undefined
  const handler = () => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      try {
        onAlarm()
      } catch (e) {
        console.warn('[useRealtimeAlarmEvents] refresh callback failed', e)
      }
    }, debounceMs)
  }
  onMounted(() => {
    window.addEventListener('linkage-ws-event', handler as EventListener)
    window.addEventListener('alarm-handled', handler as EventListener)
  })
  onUnmounted(() => {
    window.removeEventListener('linkage-ws-event', handler as EventListener)
    window.removeEventListener('alarm-handled', handler as EventListener)
    if (timer) window.clearTimeout(timer)
  })
}
