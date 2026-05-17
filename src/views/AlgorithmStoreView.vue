<template>
  <div class="algorithm-store-view">
    <div class="store-header">
      <el-row :gutter="16" align="middle">
        <el-col :span="8">
          <el-input v-model="searchKeyword" placeholder="搜索算法名称、标签、厂商..." :prefix-icon="Search" clearable size="large" />
        </el-col>
        <el-col :span="8">
          <el-select v-model="sortBy" placeholder="排序方式" size="large">
            <el-option label="最高评分" value="rating" />
            <el-option label="最多下载" value="downloads" />
            <el-option label="价格从低到高" value="price_asc" />
            <el-option label="价格从高到低" value="price_desc" />
            <el-option label="最新发布" value="newest" />
          </el-select>
        </el-col>
        <el-col :span="8" style="text-align: right;">
          <el-tag type="info" effect="plain" size="large">
            共 {{ products.length }} 个算法 · 已购买 {{ purchasedCount }} 个
          </el-tag>
        </el-col>
      </el-row>
    </div>

    <div class="category-bar">
      <el-scrollbar>
        <div class="category-list">
          <el-tag
            v-for="cat in categories" :key="cat.id"
            :type="activeCategoryId === cat.id ? 'primary' : 'info'"
            :effect="activeCategoryId === cat.id ? 'dark' : 'plain'"
            class="category-tag"
            @click="activeCategoryId = cat.id"
          >
            <span class="cat-icon">{{ cat.icon }}</span>
            {{ cat.name }}
            <span class="cat-count">({{ cat.algorithmCount }})</span>
          </el-tag>
        </div>
      </el-scrollbar>
    </div>

    <div v-loading="loading" class="product-grid">
      <el-empty v-if="filteredProducts.length === 0" description="未找到匹配的算法" />
      <el-row v-else :gutter="16">
        <el-col v-for="product in filteredProducts" :key="product.id" :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="hover" class="product-card" :class="{ purchased: product.purchased }" @click="openDetail(product)">
            <div class="product-cover">
              <div class="cover-placeholder">
                <el-icon :size="40" color="#409EFF"><Cpu /></el-icon>
              </div>
              <div class="pricing-badge">
                <el-tag :type="pricingTagType(product.pricingModel)" size="small" effect="dark">
                  {{ pricingLabel(product) }}
                </el-tag>
              </div>
              <div v-if="product.purchased" class="purchased-badge">
                <el-tag type="success" size="small" effect="dark" round>✓ 已拥有</el-tag>
              </div>
            </div>
            <div class="product-info">
              <h4 class="product-name" :title="product.name">{{ product.name }}</h4>
              <p class="product-desc" :title="product.description">{{ product.description }}</p>
              <div class="product-meta">
                <span class="meta-item"><el-icon><Star /></el-icon> {{ product.rating.toFixed(1) }}</span>
                <span class="meta-item"><el-icon><Download /></el-icon> {{ formatCount(product.downloadCount) }}</span>
                <span class="meta-item"><el-icon><Timer /></el-icon> {{ product.avgLatencyMs }}ms</span>
              </div>
              <div class="product-footer">
                <el-tag size="small" type="info" effect="plain">{{ product.categoryName }}</el-tag>
                <span class="vendor-text">{{ product.vendor }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 算法详情对话框 -->
    <el-dialog v-model="detailVisible" :title="selectedProduct?.name || '算法详情'" width="680px" destroy-on-close>
      <template v-if="selectedProduct">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="版本">{{ selectedProduct.version }}</el-descriptions-item>
          <el-descriptions-item label="厂商">{{ selectedProduct.vendor }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ selectedProduct.categoryName }}</el-descriptions-item>
          <el-descriptions-item label="定价模式">{{ pricingModelText(selectedProduct.pricingModel) }}</el-descriptions-item>
          <el-descriptions-item label="价格">{{ formatPrice(selectedProduct) }}</el-descriptions-item>
          <el-descriptions-item label="平均延迟">{{ selectedProduct.avgLatencyMs }}ms</el-descriptions-item>
          <el-descriptions-item label="下载次数">{{ selectedProduct.downloadCount }}</el-descriptions-item>
          <el-descriptions-item label="评分">{{ selectedProduct.rating.toFixed(1) }} ({{ selectedProduct.ratingCount }}人)</el-descriptions-item>
          <el-descriptions-item label="最低固件版本">{{ selectedProduct.minFirmwareVersion }}</el-descriptions-item>
          <el-descriptions-item label="支持平台">{{ selectedProduct.supportedPlatforms.join(', ') }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="selectedProduct.purchased ? 'success' : 'warning'" size="small">
              {{ selectedProduct.purchased ? '已购买' : '未购买' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="标签">
            <el-tag v-for="tag in selectedProduct.tags" :key="tag" size="small" effect="plain" style="margin-right:4px">{{ tag }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="Object.keys(selectedProduct.accuracyMetrics).length > 0" class="metrics-section">
          <h4>精度指标</h4>
          <div class="metrics-grid">
            <div v-for="(value, key) in selectedProduct.accuracyMetrics" :key="key" class="metric-item">
              <span class="metric-label">{{ key }}</span>
              <el-progress :percentage="Math.round(value * 100)" :stroke-width="10" />
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h4>详细说明</h4>
          <p class="detail-text">{{ selectedProduct.detail || selectedProduct.description }}</p>
        </div>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button v-if="selectedProduct && !selectedProduct.purchased" type="primary" :disabled="purchasing" @click="handlePurchase">
          {{ purchasing ? '处理中...' : '立即购买' }}
        </el-button>
        <el-button v-else-if="selectedProduct && selectedProduct.purchased" type="success" disabled>已购买</el-button>
      </template>
    </el-dialog>

    <!-- 我的订单抽屉 -->
    <el-drawer v-model="orderDrawerVisible" title="我的算法订单" size="500px">
      <el-table :data="orders" stripe>
        <el-table-column prop="algorithmName" label="算法名称" min-width="140" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">{{ row.amount === 0 ? '免费' : `¥${(row.amount / 100).toFixed(2)}` }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="orderStatusType(row.status)" size="small">{{ orderStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="下单时间" width="160">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Star, Download, Timer, Cpu } from '@element-plus/icons-vue'
import type { AlgorithmProduct, AlgorithmPricingModel, AlgorithmOrderStatus, AlgorithmCategory, AlgorithmOrder } from '@/types/algorithm'

const loading = ref(false)
const searchKeyword = ref('')
const sortBy = ref<'rating' | 'downloads' | 'price_asc' | 'price_desc' | 'newest'>('rating')
const activeCategoryId = ref('all')
const detailVisible = ref(false)
const selectedProduct = ref<AlgorithmProduct | null>(null)
const purchasing = ref(false)
const orderDrawerVisible = ref(false)

const categories = ref<AlgorithmCategory[]>([
  { id: 'all', name: '全部', icon: '⚙️', description: '所有算法', sortWeight: 0, algorithmCount: 0 },
  { id: 'detection', name: '目标检测', icon: '🎯', description: '实时目标检测算法', sortWeight: 1, algorithmCount: 5 },
  { id: 'recognition', name: '人脸识别', icon: '👤', description: '人脸检测与识别', sortWeight: 2, algorithmCount: 4 },
  { id: 'segmentation', name: '图像分割', icon: '🧩', description: '语义/实例分割', sortWeight: 3, algorithmCount: 3 },
  { id: 'tracking', name: '目标追踪', icon: '📡', description: '多目标追踪算法', sortWeight: 4, algorithmCount: 3 },
  { id: 'anomaly', name: '异常检测', icon: '⚠️', description: '行为异常检测', sortWeight: 5, algorithmCount: 4 },
  { id: 'ocr', name: '文字识别', icon: '📝', description: 'OCR文字识别', sortWeight: 6, algorithmCount: 2 },
])

const products = ref<AlgorithmProduct[]>([
  { id: 'algo-yolov8', name: 'YOLOv8 目标检测', description: '高性能通用目标检测算法，支持80+类别实时检测', detail: '基于Ultralytics YOLOv8架构，优化推理速度与精度平衡', coverImage: '', previewImages: [], categoryId: 'detection', categoryName: '目标检测', version: '2.1.0', vendor: 'ShieldBox Lab', status: 'PUBLISHED', pricingModel: 'SUBSCRIPTION', price: 9900, originalPrice: 14900, currency: 'CNY', pricePerCall: 0, subscriptionPeriodDays: 30, tags: ['YOLO', '实时检测', '高精度'], supportedPlatforms: ['BM1684', 'BM1688'], minFirmwareVersion: '2.0.0', accuracyMetrics: { mAP50: 0.92, mAP50_95: 0.68 }, avgLatencyMs: 25, downloadCount: 1280, rating: 4.8, ratingCount: 156, purchased: false, publishedAt: Date.now() - 86400000 * 60 },
  { id: 'algo-face-v3', name: 'FaceNet v3 人脸识别', description: '高精度人脸检测、特征提取与比对算法', detail: '支持多人脸场景，误识率<0.001%', coverImage: '', previewImages: [], categoryId: 'recognition', categoryName: '人脸识别', version: '3.0.2', vendor: 'ShieldBox Lab', status: 'PUBLISHED', pricingModel: 'ONE_TIME', price: 29900, originalPrice: 39900, currency: 'CNY', pricePerCall: 0, subscriptionPeriodDays: 0, tags: ['人脸', '识别', '门禁'], supportedPlatforms: ['BM1684', 'BM1688'], minFirmwareVersion: '2.0.0', accuracyMetrics: { accuracy: 0.997, recall: 0.992 }, avgLatencyMs: 18, downloadCount: 856, rating: 4.9, ratingCount: 92, purchased: true, publishedAt: Date.now() - 86400000 * 45 },
  { id: 'algo-deeplabv3', name: 'DeepLabv3+ 语义分割', description: '高精度像素级语义分割', detail: '基于DeepLabv3+架构，支持自定义类别训练', coverImage: '', previewImages: [], categoryId: 'segmentation', categoryName: '图像分割', version: '1.5.0', vendor: 'VisionTech', status: 'PUBLISHED', pricingModel: 'PAY_PER_USE', price: 0, originalPrice: 0, currency: 'CNY', pricePerCall: 5, subscriptionPeriodDays: 0, tags: ['分割', '语义', '场景分析'], supportedPlatforms: ['BM1684'], minFirmwareVersion: '2.1.0', accuracyMetrics: { mIoU: 0.82 }, avgLatencyMs: 45, downloadCount: 432, rating: 4.5, ratingCount: 48, purchased: false, publishedAt: Date.now() - 86400000 * 30 },
  { id: 'algo-sort-track', name: 'SORT 多目标追踪', description: '轻量级多目标追踪算法', detail: '基于卡尔曼滤波和匈牙利算法', coverImage: '', previewImages: [], categoryId: 'tracking', categoryName: '目标追踪', version: '1.2.0', vendor: 'ShieldBox Lab', status: 'PUBLISHED', pricingModel: 'FREE', price: 0, originalPrice: 0, currency: 'CNY', pricePerCall: 0, subscriptionPeriodDays: 0, tags: ['追踪', '多目标', '免费'], supportedPlatforms: ['BM1684', 'BM1688', 'BM1690'], minFirmwareVersion: '1.8.0', accuracyMetrics: { MOTA: 0.78, IDF1: 0.72 }, avgLatencyMs: 12, downloadCount: 2156, rating: 4.6, ratingCount: 312, purchased: true, publishedAt: Date.now() - 86400000 * 90 },
  { id: 'algo-anomaly-behavior', name: '行为异常检测', description: '基于时空特征的行为异常检测', detail: '自动学习正常行为模式，检测打架、跌倒、入侵等异常', coverImage: '', previewImages: [], categoryId: 'anomaly', categoryName: '异常检测', version: '2.0.1', vendor: 'SafeVision AI', status: 'PUBLISHED', pricingModel: 'SUBSCRIPTION', price: 19900, originalPrice: 24900, currency: 'CNY', pricePerCall: 0, subscriptionPeriodDays: 30, tags: ['异常检测', '行为分析', '安防'], supportedPlatforms: ['BM1684', 'BM1688'], minFirmwareVersion: '2.0.0', accuracyMetrics: { precision: 0.91, recall: 0.87 }, avgLatencyMs: 35, downloadCount: 678, rating: 4.7, ratingCount: 76, purchased: false, publishedAt: Date.now() - 86400000 * 20 },
  { id: 'algo-ppocr', name: 'PP-OCRv4 文字识别', description: '百度PaddleOCR轻量化文字识别', detail: '超轻量模型，支持多角度、模糊文本识别', coverImage: '', previewImages: [], categoryId: 'ocr', categoryName: '文字识别', version: '4.2.0', vendor: 'PaddlePaddle', status: 'PUBLISHED', pricingModel: 'FREE', price: 0, originalPrice: 0, currency: 'CNY', pricePerCall: 0, subscriptionPeriodDays: 0, tags: ['OCR', '文字识别', '免费'], supportedPlatforms: ['BM1684', 'BM1688', 'BM1690'], minFirmwareVersion: '1.5.0', accuracyMetrics: { accuracy: 0.96 }, avgLatencyMs: 20, downloadCount: 3421, rating: 4.8, ratingCount: 520, purchased: true, publishedAt: Date.now() - 86400000 * 120 },
])

const orders = ref<AlgorithmOrder[]>([
  { id: 'order-001', algorithmId: 'algo-face-v3', algorithmName: 'FaceNet v3 人脸识别', pricingModel: 'ONE_TIME', amount: 29900, currency: 'CNY', status: 'PAID', createdAt: Date.now() - 86400000 * 10, paidAt: Date.now() - 86400000 * 10 },
  { id: 'order-002', algorithmId: 'algo-sort-track', algorithmName: 'SORT 多目标追踪', pricingModel: 'FREE', amount: 0, currency: 'CNY', status: 'PAID', createdAt: Date.now() - 86400000 * 30, paidAt: Date.now() - 86400000 * 30 },
])

const filteredProducts = computed(() => {
  let result = products.value
  if (activeCategoryId.value !== 'all') result = result.filter(p => p.categoryId === activeCategoryId.value)
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    result = result.filter(p => p.name.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw) || p.tags.some(t => t.toLowerCase().includes(kw)) || p.vendor.toLowerCase().includes(kw))
  }
  switch (sortBy.value) {
    case 'rating': result = [...result].sort((a, b) => b.rating - a.rating); break
    case 'downloads': result = [...result].sort((a, b) => b.downloadCount - a.downloadCount); break
    case 'price_asc': result = [...result].sort((a, b) => a.price - b.price); break
    case 'price_desc': result = [...result].sort((a, b) => b.price - a.price); break
    case 'newest': result = [...result].sort((a, b) => b.publishedAt - a.publishedAt); break
  }
  return result
})

const purchasedCount = computed(() => products.value.filter(p => p.purchased).length)

function openDetail(product: AlgorithmProduct) { selectedProduct.value = product; detailVisible.value = true }

async function handlePurchase() {
  if (!selectedProduct.value) return
  purchasing.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const p = products.value.find(p => p.id === selectedProduct.value!.id)
    if (p) p.purchased = true
    ElMessage.success('购买成功！')
    detailVisible.value = false
  } finally { purchasing.value = false }
}

function pricingLabel(p: AlgorithmProduct): string {
  switch (p.pricingModel) {
    case 'FREE': return '免费'
    case 'ONE_TIME': return `¥${(p.price / 100).toFixed(0)}`
    case 'SUBSCRIPTION': return `¥${(p.price / 100).toFixed(0)}/月`
    case 'PAY_PER_USE': return `¥${(p.pricePerCall / 100).toFixed(2)}/次`
    default: return '-'
  }
}
function pricingTagType(m: AlgorithmPricingModel): 'success' | 'warning' | 'primary' | 'info' {
  const map: Record<string, 'success' | 'warning' | 'primary' | 'info'> = { FREE: 'success', ONE_TIME: 'warning', SUBSCRIPTION: 'primary', PAY_PER_USE: 'info' }
  return map[m] || 'info'
}
function pricingModelText(m: AlgorithmPricingModel): string {
  const map: Record<string, string> = { FREE: '免费', ONE_TIME: '一次性买断', SUBSCRIPTION: '按月订阅', PAY_PER_USE: '按次付费' }
  return map[m] || '-'
}
function formatPrice(p: AlgorithmProduct): string {
  if (p.pricingModel === 'FREE') return '免费'
  if (p.pricingModel === 'PAY_PER_USE') return `¥${(p.pricePerCall / 100).toFixed(2)}/次`
  const c = (p.price / 100).toFixed(2)
  const o = p.originalPrice > p.price ? ` (原价 ¥${(p.originalPrice / 100).toFixed(2)})` : ''
  return `¥${c}${o}`
}
function formatCount(c: number): string {
  if (c >= 10000) return `${(c / 10000).toFixed(1)}w`
  if (c >= 1000) return `${(c / 1000).toFixed(1)}k`
  return String(c)
}
function orderStatusType(s: AlgorithmOrderStatus): 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'success' | 'warning' | 'info' | 'danger'> = { PAID: 'success', PENDING: 'warning', CANCELLED: 'info', REFUNDED: 'danger' }
  return map[s] || 'info'
}
function orderStatusText(s: AlgorithmOrderStatus): string {
  const map: Record<string, string> = { PAID: '已支付', PENDING: '待支付', CANCELLED: '已取消', REFUNDED: '已退款' }
  return map[s] || '-'
}
</script>

<style scoped lang="scss">
.algorithm-store-view { padding: 0; }
.store-header { margin-bottom: 16px; }
.category-bar {
  margin-bottom: 20px;
  .category-list { display: flex; gap: 8px; padding: 4px 0; white-space: nowrap; }
  .category-tag { cursor: pointer; transition: all 0.2s; font-size: 14px;
    .cat-icon { margin-right: 2px; }
    .cat-count { margin-left: 4px; opacity: 0.7; }
    &:hover { transform: translateY(-1px); }
  }
}
.product-grid { min-height: 200px; }
.product-card {
  margin-bottom: 16px; cursor: pointer; transition: all 0.3s; border-radius: 8px;
  &:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
  &.purchased { border-color: #67C23A33; }
  :deep(.el-card__body) { padding: 0; }
}
.product-cover {
  position: relative; height: 120px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex; align-items: center; justify-content: center;
  .cover-placeholder { width: 64px; height: 64px; border-radius: 16px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; }
  .pricing-badge { position: absolute; top: 8px; left: 8px; }
  .purchased-badge { position: absolute; top: 8px; right: 8px; }
}
.product-info {
  padding: 12px;
  .product-name { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .product-desc { font-size: 12px; color: #909399; margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .product-meta { display: flex; gap: 16px; margin-bottom: 10px;
    .meta-item { display: flex; align-items: center; gap: 3px; font-size: 12px; color: #606266; .el-icon { font-size: 13px; } }
  }
  .product-footer { display: flex; align-items: center; justify-content: space-between;
    .vendor-text { font-size: 11px; color: #C0C4CC; }
  }
}
.metrics-section, .detail-section { margin-top: 20px; h4 { font-size: 14px; color: #303133; margin-bottom: 12px; } }
.metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  .metric-item { .metric-label { font-size: 12px; color: #909399; margin-bottom: 4px; display: block; } }
}
.detail-text { font-size: 13px; color: #606266; line-height: 1.8; }
</style>
