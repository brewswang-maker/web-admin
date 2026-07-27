<template>
  <div class="fl-config-page">
    <div class="page-title">
      <h2>🔧 联邦学习高级配置</h2>
      <el-button size="small" @click="refreshAll"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <!-- ====== SecAgg 安全聚合 ====== -->
      <el-tab-pane label="SecAgg 安全聚合" name="secagg">
        <el-card shadow="never">
          <template #header>
            <span style="font-weight:600">🔐 SecAgg — 安全聚合协议</span>
          </template>
          <p class="desc">
            客户端使用成对密钥生成梯度掩码，聚合时掩码相互抵消。服务端只能看到聚合结果，无法获取单客户端梯度。
          </p>
          <el-form label-position="top" size="small">
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item label="参与客户端ID (逗号分隔)">
                  <el-input v-model="secaggForm.clientIds" placeholder="client_01,client_02" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="参数维度">
                  <el-input-number v-model="secaggForm.paramCount" :min="10" :max="100000" :step="100" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label=" ">
                  <el-button type="primary" @click="runSecAgg" :loading="secaggLoading">
                    执行安全聚合
                  </el-button>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <el-alert v-if="secaggResult" type="success" :closable="false" style="margin-top:12px">
            参与客户端: {{ secaggResult.participant_count }} | 安全模式: {{ secaggResult.secure_mode ? '✅ 已启用' : '❌ 未启用' }}
          </el-alert>
        </el-card>
      </el-tab-pane>

      <!-- ====== 联邦蒸馏 ====== -->
      <el-tab-pane label="联邦蒸馏" name="distillation">
        <el-card shadow="never">
          <template #header>
            <span style="font-weight:600">📡 FedDistillation — 联邦知识蒸馏</span>
          </template>
          <p class="desc">
            客户端只上传 soft labels (logits) 而非模型权重，服务端蒸馏训练。带宽节省 100x+。
          </p>
          <el-form label-position="top" size="small">
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item label="类别数">
                  <el-input-number v-model="distillForm.numClasses" :min="2" :max="1000" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="温度 (Temperature)">
                  <el-input-number v-model="distillForm.temperature" :min="0.1" :max="10" :step="0.5" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label=" ">
                  <el-button type="primary" @click="runDistillation" :loading="distillLoading">
                    执行蒸馏聚合
                  </el-button>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <el-alert v-if="distillResult" type="success" :closable="false" style="margin-top:12px">
            总样本: {{ distillResult.total_samples }} | 带宽节省: {{ distillResult.bandwidth_saved_kb.toFixed(2) }} KB
          </el-alert>
        </el-card>
      </el-tab-pane>

      <!-- ====== A/B 测试 ====== -->
      <el-tab-pane label="A/B 测试" name="abtest">
        <el-card shadow="never">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">🧪 A/B Testing — 模型对比实验</span>
              <el-button type="primary" size="small" @click="showABStart = true">启动新实验</el-button>
            </div>
          </template>

          <!-- A/B 测试状态 -->
          <div v-if="abtestStatus" class="abtest-status">
            <el-row :gutter="16">
              <el-col :span="6">
                <div class="ab-stat-card">
                  <div class="ab-label">实验状态</div>
                  <el-tag :type="abStateTag">{{ abStateLabel }}</el-tag>
                </div>
              </el-col>
              <el-col :span="9">
                <div class="ab-stat-card model-a">
                  <div class="ab-label">模型 A: {{ abtestStatus.config?.model_a_version }}</div>
                  <div class="ab-data">
                    <span>样本: {{ abtestStatus.stats_a?.samples }}</span>
                    <span>误报: {{ abtestStatus.stats_a?.fp_count }}</span>
                    <span class="rate">FP率: {{ (abtestStatus.stats_a?.fp_rate * 100).toFixed(2) }}%</span>
                  </div>
                </div>
              </el-col>
              <el-col :span="9">
                <div class="ab-stat-card model-b">
                  <div class="ab-label">模型 B: {{ abtestStatus.config?.model_b_version }}</div>
                  <div class="ab-data">
                    <span>样本: {{ abtestStatus.stats_b?.samples }}</span>
                    <span>误报: {{ abtestStatus.stats_b?.fp_count }}</span>
                    <span class="rate">FP率: {{ (abtestStatus.stats_b?.fp_rate * 100).toFixed(2) }}%</span>
                  </div>
                </div>
              </el-col>
            </el-row>
            <el-row :gutter="16" style="margin-top:12px">
              <el-col :span="12">
                <el-statistic title="P-Value (显著性)" :value="abtestStatus.p_value" :precision="4" />
              </el-col>
              <el-col :span="12">
                <el-statistic title="决策" :value="abtestStatus.decision || '等待中...'" />
              </el-col>
            </el-row>
          </div>
          <el-empty v-else description="暂无 A/B 测试数据" />

          <!-- 快速记录样本 -->
          <div style="margin-top:16px;display:flex;gap:8px;align-items:center">
            <span style="font-size:13px;color:#606266">快速记录:</span>
            <el-button size="small" @click="recordSample('a', true)">A-误报</el-button>
            <el-button size="small" @click="recordSample('a', false)">A-正确</el-button>
            <el-button size="small" @click="recordSample('b', true)">B-误报</el-button>
            <el-button size="small" @click="recordSample('b', false)">B-正确</el-button>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- A/B 测试启动对话框 -->
    <el-dialog v-model="showABStart" title="启动 A/B 测试" width="500px">
      <el-form label-position="top" size="small">
        <el-form-item label="实验名称">
          <el-input v-model="abStartForm.name" placeholder="YOLOv8s对比实验" />
        </el-form-item>
        <el-form-item label="模型A版本">
          <el-input v-model="abStartForm.model_a_version" placeholder="v1" />
        </el-form-item>
        <el-form-item label="模型B版本 (新)">
          <el-input v-model="abStartForm.model_b_version" placeholder="v2" />
        </el-form-item>
        <el-form-item label="流量分配 (A组比例 %)">
          <el-slider v-model="abStartForm.traffic_split_a" :min="10" :max="90" :step="5" />
        </el-form-item>
        <el-form-item label="最少样本数">
          <el-input-number v-model="abStartForm.min_samples" :min="30" :max="10000" :step="50" />
        </el-form-item>
        <el-form-item label="显著性水平 α">
          <el-select v-model="abStartForm.significance_level" style="width:100%">
            <el-option :value="0.05" label="0.05 (95%置信)" />
            <el-option :value="0.01" label="0.01 (99%置信)" />
            <el-option :value="0.1" label="0.10 (90%置信)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showABStart = false">取消</el-button>
        <el-button type="primary" @click="startABTest">启动</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { federationApi } from '@/api/federation'

const activeTab = ref('secagg')
const showABStart = ref(false)

// ===== SecAgg =====
const secaggForm = ref({
  clientIds: 'client_01,client_02',
  paramCount: 1000,
})
const secaggLoading = ref(false)
const secaggResult = ref<{ participant_count: number; secure_mode: boolean } | null>(null)

async function runSecAgg() {
  const ids = secaggForm.value.clientIds.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length < 2) {
    ElMessage.warning('至少需要2个客户端')
    return
  }
  secaggLoading.value = true
  try {
    const gradients: Record<string, number[]> = {}
    for (const id of ids) {
      gradients[id] = Array.from({ length: secaggForm.value.paramCount }, () => Math.random() * 0.01 - 0.005)
    }
    const res = await federationApi.secaggAggregate({
      client_ids: ids,
      gradients,
      param_count: secaggForm.value.paramCount,
    })
    secaggResult.value = res.data?.data ?? null
    ElMessage.success('安全聚合完成')
  } catch (e: any) {
    ElMessage.error('聚合失败: ' + (e.message || ''))
  } finally {
    secaggLoading.value = false
  }
}

// ===== Distillation =====
const distillForm = ref({
  numClasses: 80,
  temperature: 2.0,
})
const distillLoading = ref(false)
const distillResult = ref<{ total_samples: number; bandwidth_saved_kb: number } | null>(null)

async function runDistillation() {
  distillLoading.value = true
  try {
    const clientLabels = [
      {
        client_id: 'client_01',
        sample_count: 100,
        labels: Array.from({ length: distillForm.value.numClasses }, (_, i) => ({
          class_id: i,
          logits: Array.from({ length: 5 }, () => Math.random()),
        })),
      },
      {
        client_id: 'client_02',
        sample_count: 150,
        labels: Array.from({ length: distillForm.value.numClasses }, (_, i) => ({
          class_id: i,
          logits: Array.from({ length: 5 }, () => Math.random()),
        })),
      },
    ]
    const res = await federationApi.distillationAggregate({
      client_labels: clientLabels,
      num_classes: distillForm.value.numClasses,
      temperature: distillForm.value.temperature,
    })
    distillResult.value = res.data?.data ?? null
    ElMessage.success('蒸馏聚合完成')
  } catch (e: any) {
    ElMessage.error('蒸馏失败: ' + (e.message || ''))
  } finally {
    distillLoading.value = false
  }
}

// ===== A/B Testing =====
const abtestStatus = ref<any>(null)
const abStartForm = ref({
  name: '',
  model_a_version: 'v1',
  model_b_version: 'v2',
  traffic_split_a: 50,
  min_samples: 100,
  significance_level: 0.05,
})

const abStateLabel = computed(() => {
  const s = abtestStatus.value?.state
  if (s === 0) return '空闲'
  if (s === 1) return '运行中'
  if (s === 2) return '已完成'
  return '--'
})
const abStateTag = computed(() => {
  const s = abtestStatus.value?.state
  if (s === 1) return 'success'
  if (s === 2) return 'info'
  return 'warning'
})

async function refreshABStatus() {
  try {
    const res = await federationApi.getABTestStatus()
    abtestStatus.value = res.data?.data ?? null
  } catch { /* ignore */ }
}

async function startABTest() {
  try {
    await federationApi.startABTest({
      name: abStartForm.value.name || 'AB_Test_' + Date.now(),
      model_a_version: abStartForm.value.model_a_version,
      model_b_version: abStartForm.value.model_b_version,
      traffic_split_a: abStartForm.value.traffic_split_a,
      min_samples: abStartForm.value.min_samples,
      significance_level: abStartForm.value.significance_level,
    })
    ElMessage.success('A/B 测试已启动')
    showABStart.value = false
    refreshABStatus()
  } catch (e: any) {
    ElMessage.error('启动失败: ' + (e.message || ''))
  }
}

async function recordSample(group: 'a' | 'b', isFP: boolean) {
  try {
    await federationApi.recordABTestSample({ group, is_false_positive: isFP })
    refreshABStatus()
  } catch (e: any) {
    ElMessage.error('记录失败: ' + (e.message || ''))
  }
}

function refreshAll() {
  if (activeTab.value === 'abtest') refreshABStatus()
}

onMounted(() => {
  refreshABStatus()
})
</script>

<style scoped>
.fl-config-page { padding: 16px; }
.page-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.desc { color: #909399; font-size: 13px; line-height: 1.6; margin-bottom: 16px; }
.abtest-status { margin-bottom: 16px; }
.ab-stat-card { background: #f5f7fa; border-radius: 8px; padding: 12px; }
.ab-stat-card.model-a { border-left: 3px solid #409eff; }
.ab-stat-card.model-b { border-left: 3px solid #e6a23c; }
.ab-label { font-size: 13px; color: #606266; margin-bottom: 8px; }
.ab-data { display: flex; gap: 16px; font-size: 14px; }
.ab-data .rate { font-weight: 600; color: #f56c6c; }
</style>
