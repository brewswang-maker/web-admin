<template>
  <!-- 加油区: 加油机位/电话/吸烟/烟火/静电服 5+ REAL 事件 (T6 红线顶部告警条) -->
  <GasEventSection title="加油区" section-key="fueling" :show-t6-banner="true" />
</template>

<script setup lang="ts">
/** [加油站方案 2026-08-30] 加油区 — T6 红线: 打电话/吸烟仅声光+TTS, 不联动工艺联锁 */
import GasEventSection from '@/components/gas-station/GasEventSection.vue'
</script>
