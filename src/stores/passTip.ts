/**
 * 通行提示状态管理 (pinia store)
 * stores/passTip.ts — 人脸分组通行事件 (face_pass_*) 顶部滚动提示 + 语音播报
 *
 * [v2.2 2026-09-19] 员工通道分组事件配套: 后端通行模板 (staff/whitelist/vip/custom)
 *   经 WEB_POPUP 帧推送, useGlobalAlarm.handleAlarm 将这四类分流至此 store —
 *   不进告警列表、不弹告警窗, 改为 PassTipBar 顶部滚动提示 + speechSynthesis
 *   语音播报 (设备端 TTS_BROADCAST 实际为 800Hz 警报音, 不适配欢迎语义)。
 * [FIX face-pass-称谓 2026-09-20] 白名单 TTS 原模板「白名单客人{name}通行」用词
 *   不准 (白名单多为内部员工/已授权访客), 按分组分型修订; 且 personName 兜底原
 *   统一「客人」→ 按类型映射 (白名单人员/VIP客人/员工/自定义组人员)。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 通行提示条目 */
export interface PassTipItem {
  id: string
  type: string                       // face_pass_whitelist | face_pass_vip | face_pass_staff | face_pass_custom
  personName: string                 // enroll_name (底库姓名), 空则按类型兜底 (见 PASS_TIP_NAME_FALLBACK)
  channelName: string
  createdAt: number                  // ms
}

/** 类型 → 提示文案 (滚动条) */
export const PASS_TIP_LABEL: Record<string, string> = {
  face_pass_whitelist: '白名单通行',
  face_pass_vip: 'VIP 到访',
  face_pass_staff: '员工通行',
  face_pass_custom: '自定义组通行',
}

/** 类型 → 播报文本 ({name} 占位; name 为空时模板自带角色名词, 朗读仍自然) */
export const PASS_TIP_TTS: Record<string, string> = {
  // [FIX face-pass-称谓 2026-09-20] 原「白名单客人{name}通行」→ 语义不准 (白名单≠客人)
  face_pass_whitelist: '白名单人员{name}通行，欢迎光临',
  face_pass_vip: 'VIP客人{name}到访，欢迎光临',
  face_pass_staff: '员工{name}通行',
  face_pass_custom: '自定义组人员{name}通行',
  // face_pass_visitor 不在 PASS_TIP_TYPES 分流 (保持原有告警列表展示); 模板仅为语义兜底
  face_pass_visitor: '访客{name}通行',
}

/** [FIX face-pass-称谓 2026-09-20] 底库姓名缺失时的类型化兜底称呼 (替代原笼统「客人」) */
export const PASS_TIP_NAME_FALLBACK: Record<string, string> = {
  face_pass_whitelist: '白名单人员',
  face_pass_vip: 'VIP客人',
  face_pass_staff: '员工',
  face_pass_custom: '自定义组人员',
  face_pass_visitor: '访客',
}

/** 四类通行事件分流白名单 (与 useGlobalAlarm 引用保持同源) */
export const PASS_TIP_TYPES = new Set(Object.keys(PASS_TIP_LABEL))

const MAX_QUEUE = 5              // 队列上限 (旧的丢弃)
const DUPE_WINDOW_MS = 30_000    // 同类型+同人员去重窗口
const TTS_WINDOW_MS = 30_000     // 同类型播报节流窗口

export const usePassTipStore = defineStore('passTip', () => {
  const queue = ref<PassTipItem[]>([])
  /** 静音开关 (仅关 TTS, 滚动提示保留); localStorage 记忆 */
  const muted = ref(localStorage.getItem('passTipMuted') === '1')

  const lastSeen = new Map<string, number>()   // "type:person" → ts (去重)
  const lastTtsAt = new Map<string, number>()  // type → ts (播报节流)

  function setMuted(v: boolean) {
    muted.value = v
    localStorage.setItem('passTipMuted', v ? '1' : '0')
  }

  /** 语音播报 (Web Speech API, zh-CN; 静音/不支持/后台节流时静默) */
  function speak(text: string) {
    if (muted.value) return
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.rate = 1
      synth.speak(u)
    } catch { /* 浏览器不支持/自动播放策略限制时静默 */ }
  }

  /**
   * 入队一条通行提示 (useGlobalAlarm.handleAlarm 分流调用)。
   * 同类型+同人员 DUPE_WINDOW_MS 内去重; 入队即按类型节流播报。
   * @returns 是否实际入队 (false = 去重窗口内被丢弃)
   */
  function push(item: { type: string; personName?: string; channelName?: string; createdAt?: number }): boolean {
    if (!PASS_TIP_TYPES.has(item.type)) return false
    // [FIX face-pass-称谓 2026-09-20] 展示名按类型兜底; TTS 用原始名 (空则模板词自足)
    const rawName = (item.personName || '').trim()
    const name = rawName || PASS_TIP_NAME_FALLBACK[item.type] || '人员'
    const now = Date.now()
    const dupeKey = `${item.type}:${name}`
    const seen = lastSeen.get(dupeKey)
    if (seen && now - seen < DUPE_WINDOW_MS) return false
    lastSeen.set(dupeKey, now)
    if (lastSeen.size > 200) {
      // 防长驻泄漏: 超阈值清理过期项
      for (const [k, ts] of lastSeen) if (now - ts > DUPE_WINDOW_MS) lastSeen.delete(k)
    }

    queue.value.push({
      id: `tip-${now}-${Math.random().toString(36).slice(2, 8)}`,
      type: item.type,
      personName: name,
      channelName: item.channelName || '',
      createdAt: item.createdAt ?? now,
    })
    if (queue.value.length > MAX_QUEUE) queue.value.splice(0, queue.value.length - MAX_QUEUE)

    // 播报 (类型级节流; 高峰同类型 30s 播一次, 滚动条仍逐条展示)
    const ttsAt = lastTtsAt.get(item.type)
    if (!ttsAt || now - ttsAt >= TTS_WINDOW_MS) {
      lastTtsAt.set(item.type, now)
      speak((PASS_TIP_TTS[item.type] || '{name}通行').replace('{name}', rawName))
    }
    return true
  }

  /** 滚动条展示完一条后移除 (PassTipBar 调用) */
  function dismiss(id: string) {
    queue.value = queue.value.filter(q => q.id !== id)
  }

  return { queue, muted, setMuted, push, dismiss }
})
