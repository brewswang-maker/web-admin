/**
 * composables/useVoiceInput.ts — AI 助手语音输入 (ASR) composable
 *
 * [FEAT voice-input 2026-09-28] PoC: 将 AIChatView 内 P2-2 骨架版语音输入
 * (裸 SpeechRecognition, 无 VAD/无降级/无回声消除约束) 升级为系统化双通道:
 *   ① webspeech — Web Speech API SpeechRecognition (Chrome/Edge), 在线流式
 *      识别, 边说边出字, 首字延迟低 (依赖浏览器厂商云端识别服务);
 *   ② edge — MediaRecorder 录音 + 能量 VAD 自动断句 → 上传盒子
 *      POST /api/v1/voice/asr (边端离线引擎: sherpa-onnx/whisper), 用于
 *      无 webspeech 环境 (Firefox/Safari) 或断网降级。正式版由 box-sdk
 *      提供该端点 (见 docs/plans/语音助手功能调研与实施方案_v1.0.md),
 *      PoC 阶段端点未部署时上传失败将报「离线识别通道未部署」。
 * 采集约束: echoCancellation/noiseSuppression/autoGainControl 全开
 *   (对应需求 AEC/ANS/AGC, 浏览器内置实现)。
 * 设计取舍: VAD 采用 AnalyserNode 均方能量阈值 + 迟滞, 不引入 silero-vad
 *   WASM 模型 (PoC 控制体积; 正式版可平滑替换, 接口不变)。
 */

import { ref, onUnmounted } from 'vue'
// [FIX roi-snapshot-401 2026-10-07] 裸 fetch 统一走 authedFetch 补 Bearer (不碰 Content-Type, FormData 边界仍由浏览器生成)
import { authedFetch } from '@/utils/authedFetch'

export type VoiceEngine = 'webspeech' | 'edge' | 'none'

export interface UseVoiceInputOptions {
  /** 收到最终识别文本 (webspeech final 或 edge 上传结果) */
  onFinal?: (text: string) => void
  /** 流式中间文本 (边说边出字; edge 通道无流式, 仅开始/结束两个状态) */
  onPartial?: (text: string) => void
  /** 识别语言 (默认 zh-CN) */
  lang?: string
  /** VAD 静音自动结束时长 ms (默认 1200) */
  quietMs?: number
  /** 有效语音最短时长 ms, 短于此判定未说话 (默认 400) */
  minSpeechMs?: number
  /** 单次录音上限 ms (默认 15000) */
  maxMs?: number
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const lang = options.lang ?? 'zh-CN'
  const quietMs = options.quietMs ?? 1200
  const minSpeechMs = options.minSpeechMs ?? 400
  const maxMs = options.maxMs ?? 15000

  const listening = ref(false)
  const partial = ref('')
  /** 实际生效的引擎 (start 时探测填充) */
  const engine = ref<VoiceEngine>('none')
  const error = ref('')

  // —— webspeech 通道 ——
  let recognition: any = null

  // —— edge 通道 (MediaRecorder + 能量 VAD) ——
  let mediaStream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let vadTimer: ReturnType<typeof setInterval> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let chunks: Blob[] = []
  let speechStartedAt = 0
  let hadSpeech = false

  /** 能力探测: webspeech 优先 (流式体验), 浏览器不支持则走 edge 通道 */
  function detectEngine(): VoiceEngine {
    const w = window as any
    if (w.SpeechRecognition || w.webkitSpeechRecognition) return 'webspeech'
    if (navigator.mediaDevices && typeof MediaRecorder !== 'undefined') return 'edge'
    return 'none'
  }

  function start() {
    if (listening.value) return
    error.value = ''
    partial.value = ''
    const e = detectEngine()
    engine.value = e
    if (e === 'none') {
      error.value = '当前浏览器不支持语音输入 (需 Chrome/Edge 或支持麦克风采样的浏览器)'
      options.onPartial?.('')
      return
    }
    if (e === 'webspeech') startWebspeech()
    else startEdge()
  }

  function stop() {
    if (engine.value === 'webspeech') {
      try { recognition?.stop() } catch { /* 已停止 */ }
    } else {
      finishEdgeRecording()
    }
  }

  /** 打断 (供 TTS barge-in 联动: 用户开始说话即停止播报) */
  function bargeIn() {
    if (engine.value === 'webspeech') {
      try { recognition?.abort() } catch { /* 忽略 */ }
    }
    stopEdge(true)
    listening.value = false
  }

  // ---- ① webspeech: 流式识别 (边说边出字) ----
  function startWebspeech() {
    const w = window as any
    const Cls = w.SpeechRecognition || w.webkitSpeechRecognition
    recognition = new Cls()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (ev: any) => {
      let interim = ''
      let final = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (interim) {
        partial.value = interim
        options.onPartial?.(interim)
      }
      if (final) {
        partial.value = ''
        options.onFinal?.(final.trim())
      }
    }
    recognition.onerror = (ev: any) => {
      // [FEAT voice-input 2026-09-28] network 错误自动降级 edge 通道:
      //   Chrome 在线识别断网时的兜底路径, 而非直接报错终止。
      if (ev?.error === 'network' && detectEngine() !== 'none') {
        engine.value = 'edge'
        startEdge()
        return
      }
      error.value = mapWebspeechError(ev?.error)
      listening.value = false
    }
    recognition.onend = () => {
      listening.value = false
    }

    try {
      recognition.start()
      listening.value = true
    } catch {
      error.value = '麦克风启动失败 (可能被占用或权限被拒)'
      listening.value = false
    }
  }

  function mapWebspeechError(code?: string): string {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return '麦克风权限被拒绝, 请在浏览器地址栏授权'
      case 'no-speech':
        return '未检测到语音'
      case 'audio-capture':
        return '未找到可用麦克风设备'
      default:
        return '语音识别错误: ' + (code ?? 'unknown')
    }
  }

  // ---- ② edge: 录音 + VAD 自动断句 → 盒子离线 ASR ----
  async function startEdge() {
    try {
      // AEC/ANS/AGC: 浏览器内置约束 (需求 1.1 噪声抑制/回声消除)
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      error.value = '麦克风权限被拒绝, 请在浏览器授权'
      listening.value = false
      return
    }

    chunks = []
    hadSpeech = false
    speechStartedAt = 0
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    recorder = new MediaRecorder(mediaStream, { mimeType: mime })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => { void uploadEdgeRecording() }
    recorder.start(250)

    // 能量 VAD: AnalyserNode 频域均方值 + 固定阈值迟滞
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const src = audioCtx.createMediaStreamSource(mediaStream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    let quietSince = 0

    vadTimer = setInterval(() => {
      if (!analyser) return
      analyser.getByteFrequencyData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length) / 255
      const now = performance.now()
      if (rms > 0.06) {
        if (!hadSpeech) { hadSpeech = true; speechStartedAt = now }
        quietSince = 0
      } else if (hadSpeech) {
        if (!quietSince) quietSince = now
        // 静音超时 → 自动结束 (VAD 断句, 免点击停止)
        if (now - quietSince >= quietMs) finishEdgeRecording()
      }
    }, 100)

    maxTimer = setTimeout(() => finishEdgeRecording(), maxMs)
    listening.value = true
  }

  function stopEdge(abandon: boolean) {
    if (vadTimer) { clearInterval(vadTimer); vadTimer = null }
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
    if (recorder && recorder.state !== 'inactive') {
      // abandon=true (打断) 时直接丢弃, 不触发上传
      if (abandon) recorder.onstop = null
      try { recorder.stop() } catch { /* 已停止 */ }
    }
    mediaStream?.getTracks().forEach(t => t.stop())
    mediaStream = null
    analyser = null
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
    if (abandon) chunks = []
  }

  function finishEdgeRecording() {
    if (!listening.value) return
    listening.value = false
    const spokeMs = speechStartedAt ? performance.now() - speechStartedAt : 0
    if (!hadSpeech || spokeMs < minSpeechMs) {
      stopEdge(true)
      error.value = '未检测到语音'
      return
    }
    stopEdge(false) // 正常结束 → onstop → uploadEdgeRecording
  }

  async function uploadEdgeRecording() {
    if (!chunks.length) return
    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
    options.onPartial?.('识别中…')
    try {
      // [FEAT voice-input 2026-09-28] 正式端点 /api/v1/voice/asr 由 box-sdk
      //   语音服务提供 (multipart audio → { code:0, data:{ text } })。
      //   PoC 阶段原生 fetch + multipart, 规避 axios 拦截器对 FormData 的
      //   Content-Type 二次包装; authedFetch 仅补 Bearer 不碰 Content-Type。正式版迁移 api/http.ts。
      const fd = new FormData()
      fd.append('audio', blob, 'speech.webm')
      const r = await authedFetch('/api/v1/voice/asr', { method: 'POST', body: fd })
      const j = await r.json()
      const text: string = j?.data?.text ?? ''
      if (j?.code === 0 && text) {
        options.onFinal?.(text.trim())
      } else {
        error.value = j?.message || '离线识别失败'
      }
    } catch {
      error.value = '离线识别通道未部署 (盒子 /api/v1/voice/asr 不可达)'
    } finally {
      options.onPartial?.('')
      chunks = []
    }
  }

  onUnmounted(() => {
    if (engine.value === 'webspeech') {
      try { recognition?.abort() } catch { /* 忽略 */ }
      recognition = null
    } else {
      stopEdge(true)
    }
    listening.value = false
  })

  return {
    listening,
    partial,
    engine,
    error,
    start,
    stop,
    bargeIn,
  }
}
