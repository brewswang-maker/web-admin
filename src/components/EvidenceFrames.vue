<template>
  <!-- [ROI-GAP 2026-09-06] 多帧取证: 插件 EvidenceFrameCache 产出
       pre/mid/post_snapshot_url (AlarmDispatcher 落盘为 /snapshots/evidence/),
       双帧=双时刻对照 (尾随通过前/后、物品消失前/后等), 三帧=证据链
       (攀爬 起始→攀爬中→翻越后)。仅真实数据存在时渲染 (宁缺毋假),
       data-evidence-count 供 DOM 探针验证。 -->
  <div v-if="frames.length" class="evidence-frames" :data-evidence-count="frames.length">
    <div class="ev-head">
      <span class="ev-title">{{ frames.length >= 3 ? '三帧证据链' : '双时刻取证' }}</span>
      <span v-if="!compact" class="ev-sub">按时间先后对照, 点击可放大 ({{ algoHint }})</span>
    </div>
    <div class="ev-grid" :class="`ev-grid--${Math.min(frames.length, 3)}`">
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
        <figcaption class="ev-cap">{{ i + 1 }}. {{ f.label }}</figcaption>
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

const props = defineProps<{
  /** normalize 后告警 metadata (取证帧字段来源) */
  metadata?: Record<string, unknown>
  /** 触发算法 id (语义标签适配; 缺省时兜底 metadata.algo_id) */
  algoId?: string
  /** 弹窗内紧凑模式 (隐藏说明行) */
  compact?: boolean
}>()

interface EvFrame { key: string; label: string; url: string }

/** 算法语义标签 (按算法 id 尾段映射; 未知算法退回通用文案) */
const ALGO_LABELS: Record<string, { pre: string; mid: string; post: string }> = {
  tailgating: { pre: '通过前', mid: '过程中', post: '通过后' },
  object_removal: { pre: '消失前', mid: '过程中', post: '消失后' },
  abandoned_luggage: { pre: '遗留时', mid: '滞留中', post: '滞留确认' },
  climbing: { pre: '动作起始', mid: '攀爬中', post: '翻越后' },
  intrusion: { pre: '入侵前', mid: '持续中', post: '触发时刻' },
  // [ROI-GAP 2026-09-06] fall 三帧链 (include_mid=true) / gathering 双帧链补齐
  fall: { pre: '倒地前', mid: '倒地中', post: '触发确认' },
  gathering: { pre: '聚集前', mid: '聚集中', post: '触发时刻' },
  // [trash-misclass 2026-09-06] personal_item 遗留/无人看管双帧链
  //   (abandoned/unattended fillMeta, carried 高频低危不加帧)
  personal_item: { pre: '遗留前', mid: '滞留中', post: '触发确认' },
  // [FIX evidence-label 2026-09-07] canonical 兼容: AlarmDispatcher SSOT 归一后
  //   algo_id 尾段是 canonical 名 (abandoned), 非插件名 (personal_item) —
  //   语义两源通用 (遗留前/滞留中/触发确认), 双保险直配。
  abandoned: { pre: '遗留前', mid: '滞留中', post: '触发确认' },
  unattended_baggage: { pre: '看管前', mid: '离开中', post: '触发确认' },
}

const frames = computed<EvFrame[]>(() => {
  const m = (props.metadata || {}) as Record<string, unknown>
  // [FIX evidence-label 2026-09-07] 标签解析三级链: 调用方 algoId 尾段 →
  //   metadata.algo_id 尾段 → description_key 首段 ("personal_item.abandoned"
  //   → personal_item)。此前只看 algoId 一级, SSOT 归一后的 canonical 名
  //   (abandoned) 未命中时直接退通用文案 (真机弹窗实录"事发前/事发后")。
  // [FIX tsc 2026-09-07] .pop() 返回 string|undefined, filter(Boolean) 不收窄 →
  //   类型谓词收窄为 string[], 否则 ALGO_LABELS[t] 索引报 TS2538 (两处同修)
  const tails = [
    String(props.algoId || '').split('.').pop(),
    String(m.algo_id || '').split('.').pop(),
    String(m.description_key || '').split('.')[0],
  ].filter((t): t is string => Boolean(t))
  let labels = { pre: '事发前', mid: '过程中', post: '事发后' }
  for (const t of tails) {
    if (ALGO_LABELS[t]) { labels = ALGO_LABELS[t]; break }
  }
  const out: EvFrame[] = []
  for (const key of ['pre', 'mid', 'post'] as const) {
    const url = m[`${key}_snapshot_url`]
    if (typeof url === 'string' && url
        && (url.startsWith('data:image/') || url.startsWith('/'))) {
      out.push({ key, label: labels[key], url })
    }
  }
  return out
})

const algoHint = computed(() => {
  const m = (props.metadata || {}) as Record<string, unknown>
  const tails = [
    String(props.algoId || '').split('.').pop(),
    String(m.algo_id || '').split('.').pop(),
    String(m.description_key || '').split('.')[0],
  ].filter((t): t is string => Boolean(t))
  const hit = tails.find((t) => ALGO_LABELS[t]) || ''
  return hit ? `${hit} 取证帧` : '取证帧'
})
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
</style>
