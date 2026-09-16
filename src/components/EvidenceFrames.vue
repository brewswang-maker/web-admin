<template>
  <!-- [ROI-GAP 2026-09-06] 多帧取证: 插件 EvidenceFrameCache 产出
       pre/mid/post_snapshot_url (AlarmDispatcher 落盘为 /snapshots/evidence/),
       双帧=双时刻对照 (尾随通过前/后、物品消失前/后等), 三帧=证据链
       (入侵 空场→触发→事后/攀爬 起始→攀爬中→翻越后)。仅真实数据存在时
       渲染 (宁缺毋假), data-evidence-count 供 DOM 探针验证。
       [EV-TRIPLE 2026-09-14] 语义分离后: pre=空场景/动作起始帧,
       mid=触发帧 (人/物必在场), post=触发后延时抓帧 (补位链回写, 触发
       瞬间不写) — 三帧硬区隔, 可对照还原事件来龙去脉。
       [EV-TS 2026-09-14] evidence_ts 帧时刻戳 → 相对时间角标 (T-12s/
       T+0/T+6s, 视频时间轴范式); post 未到时展示"采集中"占位。 -->
  <div v-if="frames.length || pendingPost" class="evidence-frames"
       :data-evidence-count="frames.length" :data-evidence-pending="pendingPost ? 1 : 0">
    <div class="ev-head">
      <span class="ev-title">{{ frames.length >= 3 ? '三帧证据链' : '双时刻取证' }}</span>
      <!-- [FIX snap3 2026-09-16 4.1] 快照不全角标 (三帧规范未凑满且非采集中) -->
      <span v-if="incomplete" class="ev-incomplete"
        :title="`三帧规范 (事前/触发/事后) 仅到 ${incomplete.present} 帧, 后端补帧未成功`"
      >快照不全 ({{ incomplete.present }}/3)</span>
      <span v-if="!compact" class="ev-sub">按时间先后对照, 点击可放大 ({{ algoHint }})</span>
    </div>
    <div class="ev-grid" :class="`ev-grid--${Math.min(frames.length + (pendingPost ? 1 : 0), 3)}`">
      <figure v-for="(f, i) in frames" :key="f.key" class="ev-cell" :data-evidence-key="f.key">
        <el-image
          :src="f.url" fit="cover" preview-teleported lazy
          :preview-src-list="frames.map(x => x.url)" :initial-index="i"
          class="ev-img"
        >
          <template #error>
            <div class="ev-img-error">取证帧加载失败</div>
          </template>
        </el-image>
        <figcaption class="ev-cap">
          {{ i + 1 }}. {{ f.label }}
          <span v-if="f.rel" class="ev-ts" :title="f.abs || undefined">{{ f.rel }}</span>
        </figcaption>
      </figure>
      <!-- [EV-TS] post 采集中占位: 三帧链 pre/mid 已到、post 由补位链
           延时回写 — 仅新鲜告警 (窗口内) 展示, 老告警/已失败不常驻 -->
      <figure v-if="pendingPost" class="ev-cell ev-cell--pending" data-evidence-key="post-pending">
        <div class="ev-img ev-img-pending">
          <span class="ev-spin" />
          <span>事后帧采集中</span>
        </div>
        <figcaption class="ev-cap">{{ frames.length + 1 }}. 事后</figcaption>
      </figure>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * EvidenceFrames — 告警多帧取证展示 (ROI 能力闭环 2026-09-06)
 *
 * 数据链: 插件 infer 内 EvidenceFrameCache.offer (节流 2s 编码 640 宽 JPEG)
 *   → report 前 fillMeta 写 metadata.pre/mid/post_snapshot_url (data URI)
 *   → AlarmDispatcher.persistEvidenceDataUris 落盘 /data/shield/snapshots/evidence/
 *   → metadata 换存 /snapshots/evidence/*.jpg 路径 → alarm_events.metadata 落库
 *   → REST/WS 透出 → 本组件 (详情抽屉 / 告警弹窗快照 Tab 双处复用)。
 *
 * 语义 (对标大华尾随双快照 / BriefCam 取证时间线):
 *   尾随=通过前/通过后 · 物品消失=消失前/消失后 · 遗留=遗留时/滞留确认
 *   攀爬=起始/攀爬中/翻越后 (≥3 帧证据链) · 入侵=入侵前/触发时刻
 *
 * 契约: 字段缺失/非字符串/非 data:image|/ 开头一律不渲染 (整块隐藏);
 *   老告警 (无取证帧字段) 自动不显示, 不伪造占位。
 */
import { computed } from 'vue'
import {
  buildEvidenceFrames, evidenceAlgoHint, evidenceCompleteness,
  isEvidencePostPending, type EvidenceFrameMeta,
} from '@/utils/evidenceFrames'

const props = defineProps<{
  /** normalize 后告警 metadata (取证帧字段来源) */
  metadata?: Record<string, unknown>
  /** 触发算法 id (语义标签适配; 缺省时兜底 metadata.algo_id) */
  algoId?: string
  /** 弹窗内紧凑模式 (隐藏说明行) */
  compact?: boolean
  /** [EV-TS 2026-09-14] 告警时刻 (ms) — evidence_ts 相对时间角标基准的
   *   退化值 (mid 缺失时用) + post 采集中占位的新鲜度窗口基准; 缺省不显示 */
  alarmTsMs?: number
}>()

// [EV-TRIPLE 2026-09-14] 帧语义/时间戳/构建逻辑已抽共享模块
//   src/utils/evidenceFrames.ts (弹窗画廊 AlarmPopup 同源复用防漂移)
type EvFrame = EvidenceFrameMeta

const frames = computed<EvFrame[]>(() =>
  buildEvidenceFrames(props.metadata, props.algoId, props.alarmTsMs))

/** [EV-TS] post 采集中占位 (共享判定): 有帧但 post 未到 + 告警新鲜
 *   (<20s 窗口) — evidence_update 帧到达后 post 写入 → 占位自然消失 */
const pendingPost = computed(() =>
  isEvidencePostPending(props.metadata, frames.value.length, props.alarmTsMs))

/** [FIX snap3 2026-09-16 4.1] 快照不全 (三帧规范): 有帧但 <3 且非采集中
 *   (补位链已放弃/抓帧失败) — 标题行显式标注; 与弹窗同源共享模块 */
const incomplete = computed(() => {
  const c = evidenceCompleteness(props.metadata, props.alarmTsMs)
  return (!c.complete && !c.pendingPost && c.present > 0) ? c : null
})

const algoHint = computed(() => evidenceAlgoHint(props.algoId, props.metadata))
</script>

<style scoped>
.evidence-frames {
  margin: 10px 0 4px;
}
.ev-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.ev-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
/* [FIX snap3 2026-09-16 4.1] 快照不全角标 (三帧规范未凑满且非采集中) */
.ev-incomplete {
  font-size: 11px;
  color: var(--el-color-warning);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 3px;
  padding: 0 4px;
}
.ev-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ev-grid {
  display: grid;
  gap: 8px;
}
.ev-grid--2 { grid-template-columns: 1fr 1fr; }
.ev-grid--3 { grid-template-columns: 1fr 1fr 1fr; }
.ev-cell {
  margin: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}
.ev-img {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: block;
}
.ev-img :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ev-img-error {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-darker);
}
.ev-cap {
  padding: 3px 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color-lighter);
}
/* [EV-TS 2026-09-14] 相对时间角标 (T-12s/T+0/T+6s 视频时间轴范式) */
.ev-ts {
  margin-left: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
/* [EV-TS] post 采集中占位 (补位链延时回写窗口内) */
.ev-cell--pending {
  border-style: dashed;
}
.ev-img-pending {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-darker);
}
.ev-spin {
  width: 16px;
  height: 16px;
  border: 2px solid var(--el-border-color);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: ev-spin 1s linear infinite;
}
@keyframes ev-spin {
  to { transform: rotate(360deg); }
}
</style>
