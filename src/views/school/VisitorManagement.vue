<template>
  <!-- 访客管理: 陌生人/访客通行/到期/黑名单 真实事件流 -->
  <SchoolEventSection title="访客" section-key="visitor" />
</template>

<script setup lang="ts">
/**
 * [校园方案 2026-08-30] 访客管理 — 对标海康访客四要素 (登记/通行/到期/黑名单)
 * 「智能检索」入口可跨镜追踪访客轨迹 (/retrieval trajectory P5-6)
 */
import SchoolEventSection from '@/components/school/SchoolEventSection.vue'
</script>
