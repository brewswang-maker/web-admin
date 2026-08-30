<template>
  <!-- 油罐区: 罐区入侵/泄漏/温度/静电 4+ REAL 事件 (核心圈, 与可燃气体探测器联动占位) -->
  <GasEventSection title="油罐区" section-key="tank" />
</template>

<script setup lang="ts">
/** [加油站方案 2026-08-30] 油罐区 — 核心圈: 罐区入侵/泄漏/温度;
 *   与可燃气体探测器 + 液位计 + 温度多模态冗余 (视频不可替代物理传感器, 仅作冗余) */
import GasEventSection from '@/components/gas-station/GasEventSection.vue'
</script>
