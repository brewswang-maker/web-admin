<template>
  <div v-if="hasError" class="error-boundary" :class="variant">
    <div class="error-boundary-content">
      <!-- 图标 -->
      <div class="error-icon">
        <el-icon :size="variant === 'inline' ? 32 : 64">
          <WarningFilled />
        </el-icon>
      </div>

      <!-- 标题 -->
      <h3 v-if="variant !== 'inline'" class="error-title">
        {{ title || '页面加载异常' }}
      </h3>

      <!-- 错误信息 -->
      <p class="error-message">{{ displayMessage }}</p>

      <!-- 错误详情（开发环境） -->
      <div v-if="showDetails && errorStack" class="error-details">
        <pre>{{ errorStack }}</pre>
      </div>

      <!-- 操作按钮 -->
      <div class="error-actions">
        <el-button type="primary" @click="handleRetry" :loading="retrying">
          <el-icon><Refresh /></el-icon>
          {{ retryText || '重试' }}
        </el-button>
        <el-button v-if="showBack" @click="handleBack">
          <el-icon><ArrowLeft /></el-icon>
          返回首页
        </el-button>
        <el-button v-if="variant !== 'inline'" @click="showDetails = !showDetails" link>
          {{ showDetails ? '收起' : '查看详情' }}
        </el-button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
/**
 * ErrorBoundary.vue — 通用错误边界组件 v6.3
 *
 * 职责:
 *  1. 捕获子组件渲染错误（Vue onErrorCaptured）
 *  2. 显示友好的错误提示 UI
 *  3. 支持重试 / 返回 / 查看详情
 *  4. 三种变体: page / card / inline
 *
 * 用法:
 *   <ErrorBoundary variant="page" @retry="fetchData">
 *     <DashboardView />
 *   </ErrorBoundary>
 */
import { ref, computed, onErrorCaptured, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  /** 变体: page=全页错误, card=卡片内错误, inline=行内错误 */
  variant?: 'page' | 'card' | 'inline'
  /** 自定义错误标题 */
  title?: string
  /** 重试按钮文字 */
  retryText?: string
  /** 是否显示返回首页按钮 */
  showBack?: boolean
  /** 错误消息（外部注入） */
  errorMessage?: string
}>(), {
  variant: 'page',
  showBack: true,
})

const emit = defineEmits<{
  retry: []
  back: []
}>()

const router = useRouter()

// ── 状态 ──
const hasError = ref(false)
const errorStack = ref('')
const showDetails = ref(false)
const retrying = ref(false)

const displayMessage = computed(() => {
  if (props.errorMessage) return props.errorMessage
  if (hasError.value) {
    return variantLabel.value === 'inline'
      ? '加载失败，请重试'
      : '页面渲染过程中发生异常，请尝试刷新页面试试。'
  }
  return ''
})

const variantLabel = computed(() => props.variant)

// ── 捕获子组件错误 ──
onErrorCaptured((err: unknown, _instance: ComponentPublicInstance | null, info: string) => {
  hasError.value = true
  const message = err instanceof Error ? err.message : String(err)
  errorStack.value = `${message}\n\n组件: ${info}\n\n${err instanceof Error ? err.stack : ''}`

  console.error('[ErrorBoundary] 捕获到渲染错误:', { err, info })
  return false // 阻止错误继续向上冒泡
})

// ── 操作 ──
function handleRetry() {
  retrying.value = true
  hasError.value = false
  emit('retry')
  // 给一个小延迟让UI过渡
  setTimeout(() => {
    retrying.value = false
  }, 800)
}

function handleBack() {
  emit('back')
  router.push('/dashboard')
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.error-boundary.page {
  min-height: 60vh;
  padding: 48px 24px;
}

.error-boundary.card {
  min-height: 200px;
  padding: 32px 24px;
}

.error-boundary.inline {
  min-height: 60px;
  padding: 12px 16px;
}

.error-boundary-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 480px;
  text-align: center;
}

.error-icon {
  color: var(--el-color-warning);
  opacity: 0.7;
}

.error-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.error-message {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.error-details {
  width: 100%;
  max-height: 200px;
  overflow: auto;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px;
}

.error-details pre {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-secondary);
}

.error-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}

/* 暗色主题适配 */
:global(.dark-theme) .error-boundary-content {
  /* 自动跟随 Element Plus 暗色变量 */
}
</style>
