<template>
  <div class="skeleton-loader">
    <!-- 顶部统计卡片骨架 -->
    <div v-if="variant === 'dashboard'" class="skeleton-dashboard">
      <div class="skeleton-row">
        <div v-for="n in 4" :key="n" class="skeleton-card">
          <div class="skeleton-block skeleton-icon"></div>
          <div class="skeleton-block skeleton-line skeleton-line--wide"></div>
          <div class="skeleton-block skeleton-line skeleton-line--narrow"></div>
        </div>
      </div>
      <div class="skeleton-row">
        <div class="skeleton-card skeleton-card--lg">
          <div class="skeleton-block skeleton-line skeleton-line--title"></div>
          <div class="skeleton-block skeleton-chart"></div>
        </div>
        <div class="skeleton-card skeleton-card--sm">
          <div class="skeleton-block skeleton-line skeleton-line--title"></div>
          <div class="skeleton-block skeleton-chart"></div>
        </div>
      </div>
      <div class="skeleton-row">
        <div class="skeleton-card skeleton-card--table">
          <div class="skeleton-block skeleton-line skeleton-line--title"></div>
          <div v-for="n in 4" :key="'t'+n" class="skeleton-block skeleton-line skeleton-line--full"></div>
        </div>
      </div>
    </div>

    <!-- 通用表格/列表骨架 -->
    <div v-else class="skeleton-generic">
      <div class="skeleton-toolbar">
        <div class="skeleton-block skeleton-line" style="width:200px"></div>
        <div class="skeleton-block skeleton-line" style="width:100px"></div>
      </div>
      <div v-for="n in 6" :key="n" class="skeleton-table-row">
        <div class="skeleton-block skeleton-line skeleton-line--full"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 骨架屏加载组件
 * - variant="dashboard": 仪表盘专用骨架
 * - variant="generic":  通用页面骨架
 */
defineProps<{
  variant?: 'dashboard' | 'generic'
}>()
</script>

<style scoped>
.skeleton-loader {
  padding: 20px;
}

.skeleton-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.skeleton-card {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-card--lg { flex: 2; }
.skeleton-card--sm { flex: 1; }
.skeleton-card--table { flex: 1; width: 100%; }

.skeleton-block {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
}

.skeleton-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
}

.skeleton-line {
  height: 16px;
}

.skeleton-line--wide { width: 60%; }
.skeleton-line--narrow { width: 40%; }
.skeleton-line--title { width: 35%; height: 20px; margin-bottom: 8px; }
.skeleton-line--full { width: 100%; }

.skeleton-chart {
  height: 260px;
  width: 100%;
  border-radius: 8px;
}

.skeleton-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.skeleton-generic {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.skeleton-table-row {
  margin-bottom: 12px;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
