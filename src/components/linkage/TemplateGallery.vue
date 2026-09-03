<template>
  <div class="tg-root">
    <div class="tg-head">
      <span class="tg-title">规则模板库</span>
      <span class="tg-hint">对标大华 DSS 模板三分法 (行业 / 场景 / 事件) + 基于所选标签智能推荐 + 一键应用</span>
    </div>

    <!-- 分类 Tabs + 智能推荐开关 -->
    <div class="tg-toolbar">
      <el-radio-group v-model="activeCat" size="small">
        <el-radio-button value="recommended">
          为你推荐<el-badge v-if="recommended.length" :value="recommended.length" class="tg-badge" />
        </el-radio-button>
        <el-radio-button value="行业">行业</el-radio-button>
        <el-radio-button value="场景">场景</el-radio-button>
        <el-radio-button value="事件">事件</el-radio-button>
        <el-radio-button value="其他">更多</el-radio-button>
      </el-radio-group>
      <el-input v-model="kw" placeholder="搜索模板名称 / 标签" clearable size="small" style="width: 180px" />
    </div>

    <div v-loading="loading" class="tg-grid">
      <template v-if="displayList.length > 0">
        <div
          v-for="t in displayList" :key="t.template_id || t.id" class="tg-card"
          :class="{ 'is-rec': isRecommended(t) }" @click="emit('apply-template', t)"
        >
          <div class="tg-card-head">
            <span class="tg-card-name">{{ t.name }}</span>
            <el-tag v-if="t.is_builtin" size="small" type="info" effect="plain">内置</el-tag>
            <el-tag v-if="isRecommended(t)" size="small" type="warning" effect="dark">推荐</el-tag>
          </div>
          <div class="tg-card-desc">{{ t.description || '—' }}</div>
          <div class="tg-card-meta">
            <el-tag v-for="tag in (t.tags || []).slice(0, 3)" :key="tag" size="small" effect="plain" class="tg-tag">{{ tag }}</el-tag>
            <span class="tg-card-stat">P{{ t.priority }} · {{ (t.actions || []).length }} 动作</span>
          </div>
          <div class="tg-card-apply">点击一键应用到当前规则 →</div>
        </div>
      </template>
      <el-empty v-else-if="!loading" description="该分类暂无模板" :image-size="48" style="grid-column: 1 / -1" />
    </div>
  </div>
</template>

<script setup lang="ts">
// [vp7 新建事件规则向导 2026-09-01] 大华 DSS 式模板三分法 (行业/场景/事件) +
//   基于已选场景 tag 的智能推荐 (推荐 = 模板 tags 与规则 tags 交集降序) +
//   海康 iVMS-8700 式一键应用 (emit 给父视图合并进表单, 不直接 POST)。
import { ref, computed, onMounted } from 'vue'
import { linkageApi, unwrapRuleTemplates, type RuleTemplate } from '@/api/linkage'

const props = defineProps<{ selectedTags: string[] }>()
const emit = defineEmits<{ (e: 'apply-template', t: RuleTemplate): void }>()

const loading = ref(false)
const kw = ref('')
const activeCat = ref('recommended')
const templates = ref<RuleTemplate[]>([])

async function load() {
  loading.value = true
  try {
    const res = await linkageApi.getRuleTemplates()
    templates.value = unwrapRuleTemplates(res.data?.data)
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** 大华三分法归类 [TPL-FIX 2026-09-03]: 后端模板 category 是 55 种具体领域词
 *  (交通枢纽/加油站/校园/酒店/周界/安检…), 原子串匹配 '行业|场景|事件' 恒不命中
 *  → 四个主 tab 全空。改为关键词三分法 (优先级 事件→场景→行业, 未命中兑底「更多」):
 *  事件 = 安全/风险类模板 (公共安全/消防安全/行为分析/应急管理等)
 *  场景 = 通用场所/设施 (周界/门禁/停车/园区/安检/大型活动/环境监测等)
 *  行业 = 垂直行业域 (交通/校园/酒店/加油站/金融/零售/能源/智慧城市等) */
const EVENT_RE = /安全|安防|应急|防疫|高危|行为分析/
const SCENE_RE = /周界|门禁|停车|园区|仓储|物流|环境|楼宇|安检|大型活动|基础设施|数据中心|机房|人员管理|设备运维|系统监控|商业管理|场所|出入口/
const INDUSTRY_RE = /交通|校园|酒店|加油站|金融|农业|医疗|卫生|健康|零售|商业|工业|工厂|养老|城市|教育|能源|文旅|体育|政务|地产/
function catOf(t: RuleTemplate): string {
  const c = String(t.category || '')
  if (EVENT_RE.test(c)) return '事件'
  if (SCENE_RE.test(c)) return '场景'
  if (INDUSTRY_RE.test(c)) return '行业'
  return '其他'
}

/** 智能推荐度: 模板 tags 与已选规则 tags 交集数 (>0 才推荐) */
function recScore(t: RuleTemplate): number {
  const sel = new Set(props.selectedTags || [])
  let n = 0
  for (const tg of t.tags || []) if (sel.has(tg)) n++
  return n
}
const isRecommended = (t: RuleTemplate) => recScore(t) > 0

const recommended = computed(() =>
  templates.value
    .filter(t => isRecommended(t))
    .sort((a, b) => recScore(b) - recScore(a))
)

/** [TPL-FIX 2026-09-03] choice 入口 selectedTags 恒空 → 推荐交集恒空集,
 *  热门兑底: 内置模板按 priority 降序 top 12, 保证「为你推荐」始终有内容
 *  (真推荐时交集排序优先, 兑底项无「推荐」标) */
const recommendedList = computed(() => {
  if (recommended.value.length) return recommended.value
  return templates.value
    .filter(t => t.is_builtin)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 12)
})

const displayList = computed(() => {
  const k = kw.value.trim().toLowerCase()
  const hit = (t: RuleTemplate) =>
    !k || `${t.name} ${(t.tags || []).join(' ')} ${t.description}`.toLowerCase().includes(k)
  const src = activeCat.value === 'recommended' ? recommendedList.value : templates.value.filter(t => catOf(t) === activeCat.value)
  return src.filter(hit)
})
</script>

<style scoped>
.tg-root { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; background: var(--el-bg-color); }
.tg-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.tg-title { font-size: 13px; font-weight: 600; }
.tg-hint { font-size: 11px; color: var(--el-text-color-secondary); }
.tg-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.tg-badge { margin-left: 4px; }
.tg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; min-height: 60px; }
.tg-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 10px; cursor: pointer; transition: box-shadow .15s, border-color .15s; display: flex; flex-direction: column; gap: 4px; }
.tg-card:hover { border-color: var(--el-color-primary); box-shadow: var(--el-box-shadow-light); }
.tg-card.is-rec { border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.tg-card-head { display: flex; align-items: center; gap: 6px; }
.tg-card-name { font-size: 13px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-card-desc { font-size: 12px; color: var(--el-text-color-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 32px; }
.tg-card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.tg-tag { font-size: 11px; }
.tg-card-stat { font-size: 11px; color: var(--el-text-color-placeholder); margin-left: auto; }
.tg-card-apply { font-size: 11px; color: var(--el-color-primary); opacity: 0; transition: opacity .15s; }
.tg-card:hover .tg-card-apply { opacity: 1; }
/* 平板 1024px 适配: 卡片两列 */
@media (max-width: 1180px) { .tg-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
