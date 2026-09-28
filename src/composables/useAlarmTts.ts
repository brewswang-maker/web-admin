/**
 * composables/useAlarmTts.ts — 关键内容语音播报 (TTS) 管理器
 *
 * [FEAT voice-input 2026-09-28] PoC: 统一播报队列, 补齐存量 TTS 零散实现的
 *   工程缺口 (useGlobalAlarm.speakAlarm 每告警即播 + cancel 打断; passTip.speak
 *   无队列)。与存量并存, 不改其行为 (红线: PoC 不动存量文件)。
 * 需求映射 (语音助手方案 1.2):
 *   - 队列管理: 多条告警顺序播报, 队列上限防堆积 (溢出丢最旧 normal);
 *   - 高优先级抢占: priority='high' 立即打断当前播报并前插;
 *   - 节流: 同类型 N 分钟内不重复 (默认 3 分钟);
 *   - 可打断: bargeIn() — 用户开始说话时清空队列并停止当前播报;
 *   - 可配置: 开关/音量/语速/白名单 (localStorage 持久化, 空白名单=全部);
 *   - Chrome 兼容: speechSynthesis ~15s 自动暂停 bug 的 resume 定时器
 *     (与 useGlobalAlarm 同思路, 注释见该文件 L692)。
 * 播报出声位置: 打开 web-admin 的电脑音箱 (Web Speech API, 系统级 TTS);
 *   盒子本体无喇叭 (历史结论, 见人脸欢迎播报路径决策), 现场真语音走
 *   Phase-2 盒子 sherpa-onnx TTS + Line-out 外接音箱。
 */

import { ref, computed, watch, onUnmounted } from 'vue'

export type TtsPriority = 'normal' | 'high'

export interface TtsItem {
  /** 唯一 id (去重/日志) */
  id: string
  /** 播报文本 (自动剥离 HTML/Markdown 标记, 截断 maxLen) */
  text: string
  /** 事件类型 key (节流与白名单判据; 空=不受限) */
  type?: string
  /** high = 抢占当前播报 */
  priority?: TtsPriority
}

export interface TtsConfig {
  enabled: boolean
  /** 0.01 ~ 1.0 */
  volume: number
  /** 0.5 ~ 2.0 */
  rate: number
  /** 同类型节流分钟数 (0=不节流) */
  throttleMinutes: number
  /** 事件类型白名单 (空=全部播报) */
  whitelist: string[]
  /** 单条播报最大字符数 */
  maxLen: number
}

const CFG_KEY = 'shield_voice_tts_v1'

const DEFAULT_CFG: TtsConfig = {
  enabled: false,
  volume: 1.0,
  rate: 1.0,
  throttleMinutes: 3,
  whitelist: [],
  maxLen: 200,
}

function loadCfg(): TtsConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) }
  } catch { /* 损坏即用默认 */ }
  return { ...DEFAULT_CFG }
}

/** 剥离 HTML 标签与 Markdown 记号, 供 TTS 朗读 */
export function stripForSpeech(text: string, maxLen: number): string {
  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*`_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain
}

export function useAlarmTts() {
  const config = ref<TtsConfig>(loadCfg())
  watch(config, (v) => {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(v)) } catch { /* 存储满时忽略 */ }
  }, { deep: true })

  const queue = ref<TtsItem[]>([])
  const speaking = ref(false)
  const current = ref<TtsItem | null>(null)
  /** 统计: 已播/节流跳过/队列溢出丢弃 (demo 观测用) */
  const stats = ref({ spoken: 0, skippedThrottle: 0, dropped: 0 })

  const QUEUE_MAX = 10
  /** 同类型上次播报时刻 (ms epoch) */
  const lastSpokeAt = new Map<string, number>()
  let resumeTimer: ReturnType<typeof setInterval> | null = null

  const supported = computed(() => typeof window !== 'undefined' && 'speechSynthesis' in window)

  function enqueue(item: TtsItem) {
    if (!supported.value || !config.value.enabled) return
    const text = stripForSpeech(item.text, config.value.maxLen)
    if (!text) return

    // 白名单: 空表=全部播报; 非空=仅白名单内 type
    const { whitelist, throttleMinutes } = config.value
    const type = item.type ?? ''
    if (whitelist.length && type && !whitelist.includes(type)) return

    // 节流: 同类型 N 分钟内不重复
    if (throttleMinutes > 0 && type) {
      const last = lastSpokeAt.get(type) ?? 0
      if (Date.now() - last < throttleMinutes * 60_000) {
        stats.value.skippedThrottle++
        return
      }
    }

    const entry: TtsItem = { ...item, text }
    if (item.priority === 'high') {
      // 高优先级抢占: 打断当前 + 清空低优先级排队 + 前插
      window.speechSynthesis.cancel()
      queue.value = queue.value.filter(q => q.priority === 'high')
      queue.value.unshift(entry)
      queue.value = queue.value.slice(0, QUEUE_MAX)
      speaking.value = false
      speakNext()
      return
    }

    if (queue.value.length >= QUEUE_MAX) {
      // 溢出丢最旧 normal, 保留 high
      const idx = queue.value.findIndex(q => q.priority !== 'high')
      if (idx >= 0) { queue.value.splice(idx, 1); stats.value.dropped++ }
      else return
    }
    queue.value.push(entry)
    if (!speaking.value) speakNext()
  }

  function speakNext() {
    if (!supported.value) return
    const next = queue.value.shift()
    if (!next) { current.value = null; speaking.value = false; clearResume(); return }
    current.value = next
    speaking.value = true

    const u = new SpeechSynthesisUtterance(next.text)
    u.lang = 'zh-CN'
    u.volume = Math.min(1, Math.max(0.01, config.value.volume))
    u.rate = Math.min(2, Math.max(0.5, config.value.rate))
    u.pitch = 1.0
    const zh = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('zh'))
    if (zh) u.voice = zh
    u.onend = () => {
      if (next.type) lastSpokeAt.set(next.type, Date.now())
      stats.value.spoken++
      speakNext()
    }
    u.onerror = () => {
      // 单条失败不阻塞队列 (引擎异常/被打断), 继续下一条
      speakNext()
    }

    try {
      window.speechSynthesis.speak(u)
      startResume() // Chrome 15s 自动暂停 bug 兜底
    } catch {
      speakNext()
    }
  }

  function startResume() {
    if (resumeTimer) return
    resumeTimer = setInterval(() => {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      } else if (!window.speechSynthesis.speaking && !queue.value.length) {
        clearResume()
      }
    }, 10_000)
  }

  function clearResume() {
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null }
  }

  /** 打断: 用户开始说话/手动静音时, 清空队列并停止当前播报 */
  function bargeIn() {
    queue.value = []
    current.value = null
    speaking.value = false
    clearResume()
    if (supported.value) window.speechSynthesis.cancel()
  }

  /** 试听 (设置面板; 不走队列/节流) */
  function preview(text: string) {
    if (!supported.value) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(stripForSpeech(text, config.value.maxLen))
    u.lang = 'zh-CN'
    u.volume = config.value.volume
    u.rate = config.value.rate
    window.speechSynthesis.speak(u)
  }

  onUnmounted(() => {
    clearResume()
    if (supported.value) window.speechSynthesis.cancel()
  })

  return {
    config,
    queue,
    speaking,
    current,
    stats,
    supported,
    enqueue,
    bargeIn,
    preview,
  }
}
