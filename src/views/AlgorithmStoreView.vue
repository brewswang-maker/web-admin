<template>
  <div class="algorithm-store-view">
    <div class="store-header">
      <el-row :gutter="16" align="middle">
        <el-col :span="8">
          <el-input v-model="searchKeyword" placeholder="搜索算法名称、标签、厂商..." :prefix-icon="Search" clearable size="large" @clear="fetchProducts" @keyup.enter="fetchProducts" />
        </el-col>
        <el-col :span="8">
          <el-select v-model="sortBy" placeholder="排序方式" size="large" @change="fetchProducts">
            <el-option label="最高评分" value="rating" />
            <el-option label="最多下载" value="popular" />
            <el-option label="价格从低到高" value="price_asc" />
            <el-option label="价格从高到低" value="price_desc" />
            <el-option label="最新发布" value="newest" />
          </el-select>
        </el-col>
        <el-col :span="8" style="text-align: right;">
          <el-tag type="info" effect="plain" size="large">
            共 {{ pagination.total }} 个算法 · 已购买 {{ purchasedCount }} 个
          </el-tag>
        </el-col>
      </el-row>
    </div>

    <div class="category-bar">
      <el-scrollbar>
        <div class="category-list">
          <el-tag
            :type="activeCategoryId === 'all' ? 'primary' : 'info'"
            :effect="activeCategoryId === 'all' ? 'dark' : 'plain'"
            class="category-tag"
            @click="selectCategory('all')"
          >
            全部
          </el-tag>
          <el-tag
            v-for="cat in categories" :key="cat.id"
            :type="activeCategoryId === cat.id ? 'primary' : 'info'"
            :effect="activeCategoryId === cat.id ? 'dark' : 'plain'"
            class="category-tag"
            @click="selectCategory(cat.id)"
          >
            <span class="cat-icon">{{ cat.icon }}</span>
            {{ cat.name }}
            <span class="cat-count">({{ cat.algorithmCount }})</span>
          </el-tag>
        </div>
      </el-scrollbar>
    </div>

    <div v-loading="loading" class="product-grid">
      <el-empty v-if="products.length === 0 && !loading" description="未找到匹配的算法" />
      <el-row v-else :gutter="16">
        <el-col v-for="product in products" :key="product.id" :xs="24" :sm="12" :md="8" :lg="6">
          <el-card shadow="hover" class="product-card" :class="{ purchased: isPurchased(product.id) }" @click="openDetail(product)">
            <div class="product-cover">
              <div class="cover-placeholder">
                <el-icon :size="40" color="#409EFF"><Cpu /></el-icon>
              </div>
              <div class="pricing-badge">
                <el-tag :type="pricingTagType(product.pricing.model)" size="small" effect="dark">
                  {{ pricingLabel(product) }}
                </el-tag>
              </div>
              <div v-if="isPurchased(product.id)" class="purchased-badge">
                <el-tag type="success" size="small" effect="dark" round>✓ 已拥有</el-tag>
              </div>
            </div>
            <div class="product-info">
              <h4 class="product-name" :title="product.name">{{ product.name }}</h4>
              <p class="product-desc" :title="product.summary || product.description">{{ product.summary || product.description }}</p>
              <div class="product-meta">
                <span class="meta-item"><el-icon><Star /></el-icon> {{ product.ratingAvg.toFixed(1) }}</span>
                <span class="meta-item"><el-icon><Download /></el-icon> {{ formatCount(product.downloadCount) }}</span>
                <span class="meta-item"><el-icon><Timer /></el-icon> {{ product.avgLatencyMs }}ms</span>
              </div>
              <div class="product-footer">
                <el-tag size="small" type="info" effect="plain">{{ product.category?.name ?? '' }}</el-tag>
                <span class="vendor-text">{{ product.developer?.name ?? '' }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div v-if="pagination.total > pagination.pageSize" class="pagination-wrapper">
      <el-pagination
        v-model:current-page="pagination.page"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        layout="total, prev, pager, next"
        @current-change="fetchProducts"
      />
    </div>

    <!-- 算法详情对话框 -->
    <el-dialog v-model="detailVisible" :title="selectedProduct?.name || '算法详情'" width="680px" destroy-on-close>
      <template v-if="selectedProduct">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="版本">{{ selectedProduct.latestVersion?.version ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="厂商">{{ selectedProduct.developer?.name ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ selectedProduct.category?.name ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="定价模式">{{ pricingModelText(selectedProduct.pricing.model) }}</el-descriptions-item>
          <el-descriptions-item label="价格">{{ formatDetailPrice(selectedProduct) }}</el-descriptions-item>
          <el-descriptions-item label="平均延迟">{{ selectedProduct.avgLatencyMs }}ms</el-descriptions-item>
          <el-descriptions-item label="下载次数">{{ selectedProduct.downloadCount }}</el-descriptions-item>
          <el-descriptions-item label="评分">{{ selectedProduct.ratingAvg.toFixed(1) }} ({{ selectedProduct.ratingCount }}人)</el-descriptions-item>
          <el-descriptions-item label="精度">{{ selectedProduct.accuracy.toFixed(1) }}% / {{ selectedProduct.recall.toFixed(1) }}%</el-descriptions-item>
          <el-descriptions-item label="TPU显存">{{ selectedProduct.tpuMemoryUsage }}MB</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="isPurchased(selectedProduct.id) ? 'success' : 'warning'" size="small">
              {{ isPurchased(selectedProduct.id) ? '已购买' : '未购买' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="标签">
            <el-tag v-for="tag in selectedProduct.tags" :key="tag.id" size="small" effect="plain" style="margin-right:4px">{{ tag.name }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div class="detail-section">
          <h4>详细说明</h4>
          <p class="detail-text">{{ selectedProduct.description }}</p>
        </div>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button v-if="selectedProduct && !isPurchased(selectedProduct.id)" type="primary" :disabled="purchasing" @click="handlePurchase">
          {{ purchasing ? '处理中...' : selectedProduct.isFree ? '免费获取' : '立即购买' }}
        </el-button>
        <el-button v-else-if="selectedProduct && isPurchased(selectedProduct.id)" type="success" disabled>已购买</el-button>
      </template>
    </el-dialog>

    <!-- 我的订单抽屉 -->
    <el-drawer v-model="orderDrawerVisible" title="我的算法订单" size="500px">
      <el-table :data="orders" stripe>
        <el-table-column prop="algorithm" label="算法名称" min-width="140">
          <template #default="{ row }">{{ row.algorithm?.name ?? row.algorithmId }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">{{ row.amount === 0 ? '免费' : `¥${row.amount.toFixed(2)}` }}</template>
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Star, Download, Timer, Cpu } from '@element-plus/icons-vue'
import type {
  AlgorithmProduct, AlgorithmCategory, AlgorithmOrder,
  PricingModel, OrderStatus,
} from '@/types/marketplace'
import marketplaceApi from '@/api/marketplace'

const loading = ref(false)
const searchKeyword = ref('')
const sortBy = ref<'rating' | 'popular' | 'price_asc' | 'price_desc' | 'newest'>('rating')
const activeCategoryId = ref('all')
const detailVisible = ref(false)
const selectedProduct = ref<AlgorithmProduct | null>(null)
const purchasing = ref(false)
const orderDrawerVisible = ref(false)

const categories = ref<AlgorithmCategory[]>([])
const products = ref<AlgorithmProduct[]>([])
const orders = ref<AlgorithmOrder[]>([])
const purchasedIds = ref<Set<string>>(new Set())
const pagination = reactive({ page: 1, pageSize: 12, total: 0 })

const purchasedCount = computed(() => purchasedIds.value.size)

function isPurchased(id: string): boolean {
  return purchasedIds.value.has(id)
}

function selectCategory(id: string) {
  activeCategoryId.value = id
  pagination.page = 1
  fetchProducts()
}

async function fetchCategories() {
  try {
    const res = await marketplaceApi.getCategories()
    categories.value = res.data?.data ?? []
  } catch (e) {
    console.warn('[AlgorithmStore] fetchCategories failed:', e)
  }
}

async function fetchProducts() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      sortBy: sortBy.value,
    }
    if (searchKeyword.value.trim()) params.keyword = searchKeyword.value.trim()
    if (activeCategoryId.value !== 'all') params.category = activeCategoryId.value

    const res = await marketplaceApi.listAlgorithms(params)
    const d = res.data?.data
    products.value = d?.items ?? []
    pagination.total = d?.total ?? 0
  } catch (e) {
    console.warn('[AlgorithmStore] fetchProducts failed:', e)
  } finally {
    loading.value = false
  }
}

async function fetchOrders() {
  try {
    const res = await marketplaceApi.getOrders({ page: 1, pageSize: 50 })
    orders.value = res.data?.data?.items ?? []
  } catch (e) {
    console.warn('[AlgorithmStore] fetchOrders failed:', e)
  }
}

async function fetchLicenses() {
  try {
    const res = await marketplaceApi.getLicenses({ status: 'active', page: 1, pageSize: 200 })
    const list = res.data?.data?.items ?? []
    purchasedIds.value = new Set(list.map((l: any) => l.algorithmId))
  } catch (e) {
    console.warn('[AlgorithmStore] fetchLicenses failed:', e)
  }
}

function openDetail(product: AlgorithmProduct) {
  selectedProduct.value = product
  detailVisible.value = true
}

async function handlePurchase() {
  if (!selectedProduct.value) return
  purchasing.value = true
  try {
    const product = selectedProduct.value
    const res = await marketplaceApi.createOrder({
      algorithmId: product.id,
      versionId: product.latestVersion?.id ?? '',
      pricingModel: product.pricing.model,
      paymentMethod: 'balance',
    })
    const order = res.data?.data
    if (product.isFree || order?.status === 'paid' || order?.status === 'fulfilled') {
      ElMessage.success('获取成功')
      purchasedIds.value.add(product.id)
      detailVisible.value = false
    } else if (order?.id) {
      const payRes = await marketplaceApi.payOrder(order.id, { paymentMethod: 'balance' })
      const payData = payRes.data?.data
      if (payData?.payUrl) {
        window.open(payData.payUrl, '_blank')
        ElMessage.info('请在新窗口完成支付')
      } else {
        ElMessage.success('购买成功')
        purchasedIds.value.add(product.id)
      }
      detailVisible.value = false
    }
    fetchProducts()
    fetchOrders()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e.message || '购买失败')
  } finally {
    purchasing.value = false
  }
}

function pricingLabel(p: AlgorithmProduct): string {
  const pr = p.pricing
  switch (pr.model) {
    case 'free': return '免费'
    case 'one_time': return pr.oneTimePrice ? `¥${pr.oneTimePrice.toFixed(0)}` : '¥-'
    case 'subscription': {
      const plan = pr.subscriptionPlans?.[0]
      return plan ? `¥${plan.price.toFixed(0)}/月` : '订阅'
    }
    case 'pay_per_use': return pr.perUsePrice ? `¥${pr.perUsePrice.toFixed(2)}/次` : '按量'
    case 'tiered': return '阶梯定价'
    default: return '-'
  }
}

function pricingTagType(m: PricingModel): 'success' | 'warning' | 'primary' | 'info' {
  const map: Record<string, 'success' | 'warning' | 'primary' | 'info'> = {
    free: 'success', one_time: 'warning', subscription: 'primary', pay_per_use: 'info', tiered: 'info',
  }
  return map[m] || 'info'
}

function pricingModelText(m: PricingModel): string {
  const map: Record<string, string> = {
    free: '免费', one_time: '一次性买断', subscription: '按月订阅', pay_per_use: '按次付费', tiered: '阶梯定价',
  }
  return map[m] || '-'
}

function formatDetailPrice(p: AlgorithmProduct): string {
  const pr = p.pricing
  if (pr.model === 'free') return '免费'
  if (pr.model === 'pay_per_use') return pr.perUsePrice ? `¥${pr.perUsePrice.toFixed(2)}/次` : '-'
  if (pr.model === 'one_time') return pr.oneTimePrice ? `¥${pr.oneTimePrice.toFixed(2)}` : '-'
  if (pr.model === 'subscription' && pr.subscriptionPlans?.length) {
    return pr.subscriptionPlans.map(s => `¥${s.price}/${s.cycle === 'monthly' ? '月' : s.cycle === 'yearly' ? '年' : '季'}`).join(', ')
  }
  return '-'
}

function formatCount(c: number): string {
  if (c >= 10000) return `${(c / 10000).toFixed(1)}w`
  if (c >= 1000) return `${(c / 1000).toFixed(1)}k`
  return String(c)
}

function orderStatusType(s: OrderStatus): 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    paid: 'success', fulfilled: 'success', pending: 'warning', cancelled: 'info', refunded: 'danger',
  }
  return map[s] || 'info'
}

function orderStatusText(s: OrderStatus): string {
  const map: Record<string, string> = {
    paid: '已支付', fulfilled: '已完成', pending: '待支付', cancelled: '已取消', refunded: '已退款',
  }
  return map[s] || '-'
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.allSettled([fetchCategories(), fetchProducts(), fetchOrders(), fetchLicenses()])
  } finally {
    loading.value = false
  }
})
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
.detail-section { margin-top: 20px; h4 { font-size: 14px; color: #303133; margin-bottom: 12px; } }
.detail-text { font-size: 13px; color: #606266; line-height: 1.8; }
.pagination-wrapper { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
