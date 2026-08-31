<template>
  <div class="linkage-page">
    <!-- ===== 主页面 Tabs ===== -->
    <el-tabs v-model="mainTab" type="border-card" class="main-tabs">
    <el-tab-pane label="联动规则" name="rules">

    <!-- ===== 统计卡片 ===== -->
    <el-row :gutter="16" class="stat-row" style="margin-left:0;margin-right:0;"
    >
      <el-col :span="6" v-for="s in statCards" :key="s.label">
        <el-card shadow="hover" class="stat-card" :body-style="{ padding: '16px 20px' }">
          <div class="stat-content">
            <div class="stat-icon" :style="{ background: s.color }">
              <el-icon :size="20"><component :is="s.icon" /></el-icon>
            </div>
            <div class="stat-body">
              <div class="stat-value" :style="{ color: s.color }">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 工具栏 ===== -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="searchQuery" placeholder="搜索规则名称..." style="width: 200px" clearable>
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="enabledFilter" placeholder="状态筛选" style="width: 120px" clearable @change="fetchRules">
            <el-option label="全部" value="" />
            <el-option label="已启用" :value="true" />
            <el-option label="已停用" :value="false" />
          </el-select>
          <!-- [校园二期增强 2026-08-30] 标签筛选: 选项从规则集动态聚合; 支持 ?tag= 预填 (场景包 goRules 联动) -->
          <el-select v-model="tagFilter" placeholder="标签筛选" multiple collapse-tags
                     style="width: 170px" clearable>
            <el-option v-for="t in allRuleTags" :key="t" :label="t" :value="t" />
          </el-select>
          <el-select v-model="sortBy" style="width: 140px" @change="fetchRules">
            <el-option label="优先级排序" value="priority" />
            <el-option label="创建时间" value="created_at" />
            <el-option label="更新时间" value="updated_at" />
          </el-select>
          <el-switch v-model="showArchived" active-text="显示归档" size="small" style="margin-left: 8px" />
        </div>
        <div class="toolbar-right">
          <template v-if="selectedRows.length > 0">
            <el-button type="success" size="small" @click="handleBatchToggle(true)">
              批量启用 ({{ selectedRows.length }})
            </el-button>
            <el-button type="warning" size="small" @click="handleBatchToggle(false)">批量停用</el-button>
            <el-button type="danger" size="small" @click="handleBatchDelete">批量删除</el-button>
          </template>
          <el-button @click="openDebugConsole">
            <el-icon><Document /></el-icon>调试控制台
          </el-button>
          <el-button @click="openTemplateLibrary">
            <el-icon><CopyDocument /></el-icon>模板库
          </el-button>
          <!-- P1-7: 规则模板导入导出 -->
          <el-button @click="handleExportTemplates" title="导出模板">
            <el-icon><Download /></el-icon>导出
          </el-button>
          <el-button @click="triggerImportFile" title="导入模板">
            <el-icon><Upload /></el-icon>导入
          </el-button>
          <input ref="importFileInput" type="file" accept=".json" style="display:none" @change="handleImportTemplates" />
          <!-- [P2-LR2] 规则冲突检测 -->
          <el-button type="warning" @click="checkConflicts" :loading="conflictLoading" title="检测规则冲突">
            <el-icon><WarningFilled /></el-icon>冲突检测
          </el-button>
          <!-- [P3-LR3] 规则执行统计 -->
          <el-button type="info" @click="toggleRuleStats" :loading="ruleStatsLoading" title="查看规则触发统计">
            <el-icon><DataLine /></el-icon>规则统计
          </el-button>
          <el-button type="primary" @click="openEditor(null)">
            <el-icon><Plus /></el-icon>新建规则
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- [P2-LR2] 冲突检测结果展示 -->
    <el-alert v-if="conflictResults.length > 0" type="warning" :closable="true" @close="conflictResults = []" style="margin-bottom: 12px">
      <template #title>
        检测到 {{ conflictResults.length }} 条规则冲突 — 请查看下方详情
      </template>
    </el-alert>

    <!-- ===== [P2-LR2] 冲突详情折叠面板 ===== -->
    <el-collapse v-if="conflictResults.length > 0" style="margin-bottom: 12px">
      <el-collapse-item title="冲突详情 (点击展开/收起)" name="conflicts">
        <div v-for="(c, idx) in conflictResults" :key="idx" class="conflict-item">
          <el-tag :type="c.severity === 'warning' ? 'warning' : 'info'" size="small">{{ conflictTypeLabel(c.type) }}</el-tag>
          <span class="conflict-msg">{{ c.message }}</span>
          <div class="conflict-suggestion">💡 {{ c.suggestion }}</div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- ===== [P3-LR3] 规则执行统计面板 ===== -->
    <el-collapse v-if="ruleStatsVisible" v-model="ruleStatsCollapse" style="margin-bottom: 12px">
      <el-collapse-item name="stats">
        <template #title>
          <span style="font-weight: 600">规则触发统计</span>
          <el-tag v-if="ruleStatsData.length > 0" size="small" type="info" style="margin-left: 8px">{{ ruleStatsData.length }} 条</el-tag>
          <el-button size="small" text @click.stop="loadRuleStats" style="margin-left: auto; margin-right: 16px">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </template>
        <el-table :data="ruleStatsData" stripe size="small" style="width: 100%">
          <el-table-column prop="rule_name" label="规则名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="trigger_count" label="触发次数" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.trigger_count > 0 ? 'success' : 'info'" size="small">{{ row.trigger_count }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="cooldown_hits" label="冷却跳过" width="100" align="center">
            <template #default="{ row }">
              <span :class="{ 'stat-warn': row.cooldown_hits > 0 }">{{ row.cooldown_hits }}</span>
            </template>
          </el-table-column>
          <el-table-column label="成功率" width="120" align="center">
            <template #default="{ row }">
              <span v-if="row.action_success + row.action_failed > 0" :class="{ 'stat-good': row.action_failed === 0, 'stat-bad': row.action_failed > 0 }">
                {{ row.action_success }}/{{ row.action_success + row.action_failed }}
                ({{ ((row.action_success / (row.action_success + row.action_failed)) * 100).toFixed(0) }}%)
              </span>
              <span v-else class="text-secondary">—</span>
            </template>
          </el-table-column>
          <el-table-column label="最后触发" width="160" align="center">
            <template #default="{ row }">
              <span v-if="row.last_trigger_ms > 0" class="text-secondary">{{ formatStatsTime(row.last_trigger_ms) }}</span>
              <span v-else class="text-secondary">从未</span>
            </template>
          </el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>

    <!-- ===== 规则列表 ===== -->
    <el-card shadow="never" class="list-card">
      <el-table :data="filteredRules" stripe row-key="id" v-loading="loading"
        :default-sort="{ prop: sortBy, order: sortOrder }"
        @sort-change="handleSortChange"
        @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="enabled" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" size="small" inline-prompt active-text="开" inactive-text="关" @change="toggleRule(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="规则名称" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="rule-name">{{ row.name || '未命名规则' }}</span>
          </template>
        </el-table-column>
        <!-- [FIX 2026-08-27 v5] 优先级 与 标签 拆出为独立列, 避免 flex 布局吞掉 prop="name" 的渲染 -->
        <el-table-column label="优先级" width="70" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain" class="priority-tag">P{{ row.priority ?? '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="120">
          <template #default="{ row }">
            <div class="cell-tags">
              <el-tag v-for="tag in (row.tags || [])" :key="tag" size="small" type="info" effect="plain">{{ tag }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="触发条件" min-width="200">
          <template #default="{ row }">
            <div class="condition-tags">
              <el-tag v-for="tag in getActiveConditions(row)" :key="tag.key" size="small" effect="plain" class="cond-tag">{{ tag.label }}</el-tag>
              <span v-if="getActiveConditions(row).length === 0" class="text-secondary">无条件</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="联动动作" min-width="180">
          <template #default="{ row }">
            <span v-if="(row.actions || []).length" class="action-count">{{ row.actions.filter((a: any) => a.enabled).length }} 项动作</span>
            <span v-else class="text-secondary">无动作</span>
          </template>
        </el-table-column>
        <el-table-column prop="cooldown_ms" label="冷却时间" width="100" align="center">
          <template #default="{ row }">
            <span class="text-secondary">{{ formatCooldown(row.cooldown_ms) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="170" sortable="custom">
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEditor(row)">编辑</el-button>
            <el-button size="small" type="success" link @click="openRuleTest(row)">🧪 测试</el-button>
            <el-button size="small" type="success" link @click="handleCloneRule(row)">复制</el-button>
            <el-button size="small" type="info" link @click="openVersionHistory(row)">历史</el-button>
            <el-button v-if="!row.is_archived" size="small" type="warning" link @click="handleArchiveRule(row)">归档</el-button>
            <el-button v-else size="small" type="success" link @click="handleRestoreRule(row)">恢复</el-button>
            <el-button size="small" type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ===== 规则编辑抽屉 ===== -->
    <el-drawer v-model="drawerVisible" :title="editingRule ? '编辑联动规则' : '新建联动规则'" size="520px" direction="rtl" :close-on-click-modal="false" destroy-on-close>
      <div class="editor-body">
        <el-form :model="form" label-position="top" size="default" :rules="formRules" ref="formRef">
          <!-- 规则名称 + 启用开关 -->
          <el-row :gutter="12">
            <el-col :span="18">
              <el-form-item label="规则名称" prop="name">
                <el-input v-model="form.name" placeholder="例: 周界入侵联动" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="启用状态">
                <el-switch v-model="form.enabled"  />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="描述">
            <el-input v-model="form.description" placeholder="可选，规则的简要说明" />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="优先级 (1-100)" prop="priority">
                <el-input-number v-model="form.priority" :min="1" :max="100" :step="5" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="冷却时间(ms)" prop="cooldownMs">
                <el-input-number v-model="form.cooldownMs" :min="1000" :max="60000" :step="1000" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="标签">
            <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="输入标签后回车" style="width: 100%">
              <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
            </el-select>
          </el-form-item>

          <!-- [FIX P1-1] 冲突处理与高级配置 -->
          <el-collapse v-model="advancedCollapse" style="margin-bottom: 12px">
            <el-collapse-item title="冲突处理与高级配置" name="advanced">
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item label="互斥组">
                    <el-input v-model="form.mutexGroup" placeholder="同组规则同一事件只触发一条" clearable />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="被抑制于规则">
                    <el-select v-model="form.suppressAfterRule" filterable clearable placeholder="该规则触发后本规则跳过" style="width: 100%">
                      <el-option v-for="r in rules.filter(x => x.id !== editingRule?.id)" :key="r.id" :label="r.name" :value="r.id" />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item label="抑制低优先级">
                    <el-switch v-model="form.suppressLowerPriority" />
                    <span class="text-secondary" style="margin-left: 8px; font-size: 12px">本规则触发后，同事件中优先级更低的规则不执行</span>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="VLM 二次验证">
                    <el-switch v-model="form.enableVlmVerify" />
                    <span class="text-secondary" style="margin-left: 8px; font-size: 12px">触发前用视觉大模型复核，降低误报</span>
                  </el-form-item>
                </el-col>
              </el-row>
              <!-- [P2-1] 治理字段: 关闭条件/响应时限 -->
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-form-item label="关闭条件">
                    <el-select v-model="form.closeCondition" clearable placeholder="未设置" style="width: 100%">
                      <el-option label="人工关闭" value="manual" />
                      <el-option label="事件自动关闭" value="auto_event_close" />
                      <el-option label="超时自动关闭" value="timeout" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="响应时限(秒)">
                    <el-input-number v-model="form.responseDeadlineS" :min="0" :max="86400" :step="30" controls-position="right" style="width: 100%" />
                    <span class="text-secondary" style="margin-left: 8px; font-size: 12px">0 = 未设置</span>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-collapse-item>
          </el-collapse>

          <el-divider content-position="left">
            触发条件
            <el-switch v-model="advancedConditionMode" size="small" active-text="高级" inactive-text="普通"
              style="margin-left: 12px; vertical-align: middle" />
          </el-divider>

          <!-- 高级条件模式: 可视化树编辑器 -->
          <div v-if="advancedConditionMode" style="margin-bottom: 12px">
            <el-alert type="info" :closable="false" style="margin-bottom: 8px">
              使用可视化树编辑器组合 AND/OR/NOT 条件。支持时间、空间、事件源、合并条件叶子节点。
            </el-alert>
            <ConditionTreeEditor v-model="conditionTreeValue" />
          </div>

          <!-- 普通条件卡片 -->
          <div v-for="cond in conditionDefs" :key="cond.type" class="condition-card">
            <div class="cond-header" @click="toggleCollapse(cond.type)">
              <div class="cond-title">
                <el-switch v-model="form.conditions[cond.type].enabled" size="small" @click.stop />
                <span class="cond-icon">{{ cond.icon }}</span>
                <span class="cond-label">{{ cond.label }}</span>
              </div>
              <el-icon :class="{ 'is-rotated': !collapsedConditions[cond.type] }"><ArrowDown /></el-icon>
            </div>

            <div v-show="!collapsedConditions[cond.type]" class="cond-body">
              <!-- 时间条件 -->
              <template v-if="cond.type === 'time'">
                <el-row :gutter="8" align="middle">
                  <el-col :span="10"><el-time-select v-model="form.conditions.time.config.startTime" start="00:00" step="00:30" end="23:30" placeholder="开始时间" style="width: 100%" /></el-col>
                  <el-col :span="4" class="text-center text-secondary">至</el-col>
                  <el-col :span="10"><el-time-select v-model="form.conditions.time.config.endTime" start="00:00" step="00:30" end="23:30" placeholder="结束时间" style="width: 100%" /></el-col>
                </el-row>
                <div class="weekdays">
                  <span class="cond-sub-label">星期</span>
                  <el-checkbox-group v-model="form.conditions.time.config.weekdays">
                    <el-checkbox v-for="d in weekdays" :key="d.value" :label="d.label" :value="d.value" size="small" />
                  </el-checkbox-group>
                </div>
                <div class="monthdays">
                  <span class="cond-sub-label">每月日期</span>
                  <el-select v-model="form.conditions.time.config.monthdays" multiple collapse-tags collapse-tags-tooltip placeholder="不选=不限" size="small" style="width: 100%">
                    <el-option v-for="d in monthdayOptions" :key="d.value" :label="d.label" :value="d.value" />
                  </el-select>
                </div>
                <div class="time-template-actions">
                  <el-button size="small" text @click="showTimeTemplateDialog = true">管理时段模板</el-button>
                </div>
              </template>

              <!-- 空间条件 -->
              <template v-if="cond.type === 'region'">
                <el-form-item label="物理位置" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.location" placeholder="选择位置" clearable style="width: 100%">
                    <template v-if="locationOptionsDynamic.length > 0">
                      <el-option v-for="l in locationOptionsDynamic" :key="l.value" :label="l.label" :value="l.value" />
                    </template>
                    <template #empty><span class="text-secondary">暂无设备位置</span></template>
                  </el-select>
                </el-form-item>
                <el-form-item label="关联通道(快照背景)" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.channelId" placeholder="选择通道加载快照" clearable style="width: 100%" @change="loadChannelSnapshot">
                    <el-option v-for="ch in channelOptionsDynamic" :key="ch.value" :label="ch.label" :value="ch.value" />
                    <template #empty><span class="text-secondary">暂无通道</span></template>
                  </el-select>
                </el-form-item>
                <el-form-item label="ROI多边形区域" label-position="top" class="cond-form-item">
                  <!-- [FIX 2026-08-28] 多边形(检测/排除区域)进 roi_polygon 由后端
                       pointInPolygon 判定; 绊线类型在保存时自动创建到算法绊线库
                       (双镜像)并关联本规则 tripwire_id — 须先在上方"关联通道"
                       选通道。点击画布即开始绘制; 绊线两点自动完成。-->
                  <RoiPolygonEditor
                    v-model="form.conditions.region.config.roiPolygon"
                    :background-image-url="roiBackgroundUrl"
                    :canvas-width="440" :canvas-height="248"
                    :types="['detection_zone', 'exclusion_zone', 'tripwire']"
                  />
                </el-form-item>
                <!-- [FIX 2026-08-27 P0-PERIMETER v3] 越界 (Tripwire) 联动 -->
                <el-form-item label="越界绊线" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.tripwireId" placeholder="选择越界绊线 (不选=不限)" clearable style="width: 100%" @focus="loadTripwireOptions" v-loading="tripwireLoading">
                    <template v-if="tripwireOptions.length > 0">
                      <el-option v-for="t in tripwireOptions" :key="t.id" :label="t.label" :value="t.id" />
                    </template>
                    <template #empty><span class="text-secondary">{{ tripwireEmptyHint }}</span></template>
                  </el-select>
                  <p class="cond-hint">可在上方画板直接画绊线（选"绊线"类型，点击两点，保存时自动创建并关联）；或选择已有绊线（AI智能→算法配置页绘制）</p>
                </el-form-item>
                <el-form-item label="越界方向" label-position="top" class="cond-form-item">
                  <el-radio-group v-model="form.conditions.region.config.direction">
                    <el-radio value="">不限</el-radio>
                    <el-radio value="A_TO_B">A → B</el-radio>
                    <el-radio value="B_TO_A">B → A</el-radio>
                    <el-radio value="BOTH">双向</el-radio>
                  </el-radio-group>
                  <p class="cond-hint" style="margin-top:4px">
                    💡 仅选择越界绊线后, 方向过滤才生效; 仅选择方向则任意绊线的该方向都会触发。
                  </p>
                </el-form-item>
                <el-form-item label="设备分组" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.group" placeholder="选择分组" style="width: 100%"><el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" /></el-select>
                </el-form-item>
              </template>

              <!-- 位置条件 -->
              <template v-if="cond.type === 'location'">
                <el-form-item label="监控位置" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.location.config.point" placeholder="选择位置" clearable style="width: 100%">
                                      <template v-if="locationOptionsDynamic.length > 0">
                                        <el-option v-for="l in locationOptionsDynamic" :key="l.value" :label="l.label" :value="l.value" />
                                      </template>
                                      <template #empty><span class="text-secondary">暂无设备位置</span></template>
                                    </el-select>
                </el-form-item>
              </template>

              <!-- 事件类型 -->
              <template v-if="cond.type === 'eventType'">
                <!-- v7.6 事件类型选择器: 分类分组 + 严重度颜色标签 (对标海康/大华事件配置) -->
                <div class="event-type-severity-legend">
                  <span class="legend-item"><i class="legend-dot" style="background:#F56C6C"></i>紧急</span>
                  <span class="legend-item"><i class="legend-dot" style="background:#E6A23C"></i>高</span>
                  <span class="legend-item"><i class="legend-dot" style="background:#409EFF"></i>中</span>
                  <span class="legend-item"><i class="legend-dot" style="background:#67C23A"></i>低</span>
                  <span class="legend-item"><i class="legend-dot" style="background:#909399"></i>提示</span>
                </div>
                <el-checkbox-group v-model="form.conditions.eventType.config.types" class="event-type-grid" v-loading="optionsLoading">
                  <template v-if="eventTypeOptions.length > 0">
                    <div v-for="(group, cat) in eventTypeGrouped" :key="cat" class="event-type-group">
                      <div class="event-type-group__title">{{ cat }}</div>
                      <el-checkbox v-for="et in group" :key="et.value" :value="et.value" size="small">
                        <span class="event-type-label">
                          <i
                            v-if="et.severityLevel"
                            class="severity-dot"
                            :style="{ background: severityColor(et.severityLevel) }"
                            :title="et.severityCn || `${et.severityLevel}级`"
                          />
                          {{ et.label }}
                        </span>
                      </el-checkbox>
                    </div>
                  </template>
                  <template v-else>
                    <el-checkbox v-for="et in fallbackEventTypes" :key="et.value" :label="et.label" :value="et.value" size="small" />
                  </template>
                </el-checkbox-group>
                <p v-if="form.conditions.eventType.config.types.length === 0" class="cond-hint" style="color: #E6A23C; margin-top: 4px">⚠ 未选择事件类型 = 匹配所有告警事件</p>
                <el-row :gutter="16" style="margin-top: 12px">
                  <el-col :span="12">
                    <el-form-item label="最低严重度" label-position="top" class="cond-form-item">
                      <el-select v-model="form.conditions.eventType.config.minSeverity" style="width: 100%">
                        <el-option label="0-不限" :value="0" /><el-option label="1-提示" :value="1" /><el-option label="2-低" :value="2" /><el-option label="3-中" :value="3" /><el-option label="4-高" :value="4" /><el-option label="5-紧急" :value="5" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="最低置信度(%)" label-position="top" class="cond-form-item">
                      <el-slider v-model="form.conditions.eventType.config.minConfidence" :min="10" :max="100" :step="5" show-input size="small" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </template>

              <!-- 事件源 -->
              <template v-if="cond.type === 'eventSource'">
                <p class="cond-hint">选择通道 (留空=全部)</p>
                <el-checkbox-group v-model="form.conditions.eventSource.config.channels" class="channel-grid" v-loading="optionsLoading">
                  <template v-if="channelOptionsDynamic.length > 0">
                    <el-checkbox v-for="ch in channelOptionsDynamic" :key="ch.value" :label="ch.label" :value="ch.value" size="small" />
                  </template>
                  <template v-else>
                    <span class="text-secondary" style="padding: 8px 0; display: inline-block;">暂无通道数据，请先添加通道或检查后端连接</span>
                  </template>
                </el-checkbox-group>
              </template>

              <!-- 自动合并 -->
              <template v-if="cond.type === 'autoMerge'">
                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-form-item label="合并窗口(ms)" label-position="top" class="cond-form-item">
                      <el-input-number v-model="form.conditions.autoMerge.config.windowMs" :min="1000" :max="60000" :step="1000" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="最大合并数" label-position="top" class="cond-form-item">
                      <el-input-number v-model="form.conditions.autoMerge.config.maxCount" :min="2" :max="100" style="width: 100%" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="合并维度" label-position="top" class="cond-form-item">
                      <el-select v-model="form.conditions.autoMerge.config.dimension" style="width: 100%">
                        <el-option label="通道" value="channel" /><el-option label="类型" value="type" /><el-option label="位置" value="location" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </template>
            </div>
          </div>

          <el-divider content-position="left">联动动作</el-divider>

          <!-- 动作 Tabs -->
          <el-tabs v-model="activeActionTab" type="card" class="action-tabs">
            <el-tab-pane label="客户端" name="client">
              <div v-for="group in clientActionGroups" :key="group.label" class="action-group">
                <div class="action-group-title">{{ group.label }}</div>
                <div v-for="act in group.items" :key="act.type" class="action-row">
                  <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                  <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">参数</el-button>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="Web端" name="web">
              <div v-for="group in webActionGroups" :key="group.label" class="action-group">
                <div class="action-group-title">{{ group.label }}</div>
                <div v-for="act in group.items" :key="act.type" class="action-row">
                  <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                  <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">参数</el-button>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="APP" name="app">
              <div v-for="act in appActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">参数</el-button>
              </div>
            </el-tab-pane>
            <el-tab-pane label="小程序" name="mp">
              <div v-for="act in mpActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">参数</el-button>
              </div>
            </el-tab-pane>
            <el-tab-pane label="系统" name="system">
              <div v-for="act in sysActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">参数</el-button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-form>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="handleDryRun" :loading="dryRunLoading" :disabled="!editingRule">
            模拟测试
          </el-button>
          <div style="flex:1" />
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">保存规则</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ===== 专用动作参数弹窗 ===== -->
    <el-dialog v-model="paramDialogVisible" :title="paramDialogTitle" width="520px" destroy-on-close append-to-body>
      <el-form :model="paramForm" label-position="top">
        <!-- 通用: 关联通道 (多数动作需要) -->
        <el-form-item v-if="paramNeedsChannel" label="关联通道/设备">
          <el-select v-model="paramForm.channel_id" placeholder="选择通道" clearable style="width: 100%">
            <template v-if="channelOptionsDynamic.length > 0">
              <el-option v-for="ch in channelOptionsDynamic" :key="ch.value" :label="ch.label" :value="ch.value" />
            </template>
            <template #empty>
              <span class="text-secondary">暂无通道数据</span>
            </template>
          </el-select>
        </el-form-item>

        <!-- === TTS 播报专用 === -->
        <template v-if="paramActionCategory === 'tts'">
          <el-form-item label="播报文本" required>
            <el-input v-model="paramForm.tts_text" type="textarea" :rows="3" placeholder="支持变量: {type} {location} {time} {channel}" />
          </el-form-item>
          <el-form-item label="重复次数">
            <el-input-number v-model="paramForm.tts_repeat" :min="1" :max="10" style="width: 100%" />
          </el-form-item>
        </template>

        <!-- === PTZ 云台专用 === -->
        <template v-if="paramActionCategory === 'ptz'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="起始预置点">
                <el-input v-model="paramForm.preset_id_start" placeholder="预置点编号" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="结束预置点">
                <el-input v-model="paramForm.preset_id_end" placeholder="预置点编号" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="巡航路径ID">
            <el-input v-model="paramForm.cruise_path_id" placeholder="路径编号" />
          </el-form-item>
        </template>

        <!-- === WebHook / HTTP 回调专用 === -->
        <template v-if="paramActionCategory === 'webhook'">
          <el-form-item label="回调URL" required>
            <el-input v-model="paramForm.callback_url" placeholder="https://example.com/webhook" />
          </el-form-item>
          <el-form-item label="请求方法">
            <el-select v-model="paramForm.callback_method" style="width: 100%">
              <el-option label="POST" value="POST" />
              <el-option label="GET" value="GET" />
              <el-option label="PUT" value="PUT" />
            </el-select>
          </el-form-item>
        </template>

        <!-- === MQTT 发布专用 === -->
        <template v-if="paramActionCategory === 'mqtt'">
          <el-form-item label="MQTT 主题" required>
            <el-input v-model="paramForm.mqtt_topic" placeholder="alarm/linkage/event" />
          </el-form-item>
          <el-form-item label="负载模板 (JSON)">
            <el-input v-model="paramForm.mqtt_payload" type="textarea" :rows="3" placeholder='{"event": "{type}", "location": "{location}"}' />
          </el-form-item>
        </template>

        <!-- === 电视墙专用 === -->
        <template v-if="paramActionCategory === 'tvwall'">
          <el-form-item label="电视墙ID">
            <el-input v-model="paramForm.tv_wall_id" placeholder="电视墙编号" />
          </el-form-item>
          <el-form-item label="持续时长(秒)">
            <el-input-number v-model="paramForm.tv_wall_duration_s" :min="5" :max="3600" style="width: 100%" />
          </el-form-item>
        </template>

        <!-- === 抓图专用 === -->
        <template v-if="paramActionCategory === 'capture'">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="抓图间隔(秒)">
                <el-input-number v-model="paramForm.capture_interval_s" :min="1" :max="60" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="抓图次数">
                <el-input-number v-model="paramForm.capture_count" :min="1" :max="30" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- === Modbus 专用 === -->
        <template v-if="paramActionCategory === 'modbus'">
          <el-row :gutter="12">
            <el-col :span="16">
              <el-form-item label="设备地址">
                <el-input v-model="paramForm.modbus_host" placeholder="192.168.1.100" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="端口">
                <el-input-number v-model="paramForm.modbus_port" :min="1" :max="65535" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="寄存器地址">
                <el-input-number v-model="paramForm.modbus_register" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="写入值">
                <el-input-number v-model="paramForm.modbus_value" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- === 通用参数 (非专用动作) === -->
        <template v-if="paramActionCategory === 'generic'">
          <el-form-item label="延迟执行(ms)">
            <el-input-number v-model="paramForm.delay_ms" :min="0" :max="60000" :step="100" style="width: 100%" />
          </el-form-item>
          <el-form-item label="重复执行次数">
            <el-input-number v-model="paramForm.repeat_count" :min="1" :max="10" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="重复间隔(ms)">
            <el-input-number v-model="paramForm.repeat_interval_ms" :min="0" :max="60000" :step="500" style="width: 100%" />
          </el-form-item>
          <el-form-item label="扩展参数 (JSON)">
            <el-input v-model="paramForm.extra" type="textarea" :rows="3" placeholder='{"key": "value"}' />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="paramDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveActionParams">确定</el-button>
      </template>
    </el-dialog>

    <!-- ===== 调试控制台弹窗 ===== -->
    <el-dialog v-model="showLogDialog" title="规则引擎调试控制台" width="1080px" destroy-on-close @open="onDebugDialogOpen" @closed="onDebugDialogClose">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
        <el-tabs v-model="logActiveTab" style="margin-bottom: 0">
          <el-tab-pane label="触发日志" name="trigger" />
          <el-tab-pane label="动作执行日志" name="action" />
          <el-tab-pane label="引擎统计" name="stats" />
        </el-tabs>
        <div style="display: flex; align-items: center; gap: 8px">
          <el-switch v-model="debugAutoRefresh" size="small" active-text="实时刷新" inactive-text="" @change="onAutoRefreshToggle as any" />
          <span style="font-size: 12px; color: #909399">{{ debugAutoRefresh ? '每5s自动刷新' : '手动刷新' }}</span>
          <el-button size="small" text @click="refreshAllLogs" :loading="logLoading"><el-icon><Refresh /></el-icon></el-button>
        </div>
      </div>

      <!-- ===== Tab 1: 触发日志 ===== -->
      <div v-show="logActiveTab === 'trigger'">
        <el-tabs v-model="logViewMode" style="margin-bottom: 8px">
          <el-tab-pane label="表格" name="table" />
          <el-tab-pane label="时间线" name="timeline" />
        </el-tabs>
        <div v-if="logViewMode === 'table'">
          <el-table :data="logs" stripe v-loading="logLoading" size="small">
            <el-table-column prop="trigger_at" label="触发时间" width="170">
              <template #default="{ row }"><span class="time-text">{{ formatTime(row.trigger_at) }}</span></template>
            </el-table-column>
            <el-table-column prop="rule_name" label="规则" width="140" show-overflow-tooltip />
            <el-table-column prop="event_type" label="事件类型" width="120" show-overflow-tooltip />
            <el-table-column prop="channel_id" label="通道" width="80" />
            <el-table-column label="执行动作" min-width="180">
              <template #default="{ row }">
                <el-tag v-for="a in (row.actions_executed || []).slice(0, 3)" :key="a" size="small" effect="plain" style="margin: 2px">{{ a }}</el-tag>
                <span v-if="(row.actions_executed || []).length > 3" class="text-secondary">+{{ row.actions_executed.length - 3 }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="duration_ms" label="耗时(ms)" width="90" align="center" />
          </el-table>
          <div class="pagination-wrap" v-if="logTotal > logPageSize">
            <el-pagination v-model:current-page="logPage" v-model:page-size="logPageSize" :total="logTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" background small @change="fetchLogs" />
          </div>
        </div>
        <div v-if="logViewMode === 'timeline'" v-loading="logLoading" style="max-height: 500px; overflow-y: auto; padding: 8px">
          <el-timeline v-if="logs.length > 0">
            <el-timeline-item v-for="log in logs" :key="log.id"
              :timestamp="formatTime(log.trigger_at)" placement="top"
              :type="log.severity >= 4 ? 'danger' : log.severity >= 3 ? 'warning' : 'primary'"
              :hollow="log.severity < 3">
              <el-card shadow="never" :body-style="{ padding: '10px 14px' }">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
                  <div>
                    <span style="font-weight: 600">{{ log.rule_name }}</span>
                    <el-tag size="small" :type="log.severity >= 4 ? 'danger' : 'warning'" effect="plain" style="margin-left: 6px">
                      {{ log.event_type || '未知事件' }}
                    </el-tag>
                    <el-tag size="small" type="info" effect="plain" style="margin-left: 4px">通道 {{ log.channel_id }}</el-tag>
                  </div>
                  <span style="font-size: 12px; color: #909399">{{ log.duration_ms }}ms</span>
                </div>
                <div>
                  <el-tag v-for="a in (log.actions_executed || []).slice(0, 5)" :key="a" size="small" effect="plain" style="margin: 1px">{{ a }}</el-tag>
                  <span v-if="(log.actions_executed || []).length > 5" style="font-size: 12px; color: #909399; margin-left: 4px">+{{ log.actions_executed.length - 5 }}项</span>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无执行记录" />
        </div>
      </div>

      <!-- ===== Tab 2: 动作执行日志 ===== -->
      <div v-show="logActiveTab === 'action'">
        <div style="margin-bottom: 8px; display: flex; gap: 8px; align-items: center">
          <el-select v-model="actionLogStatusFilter" placeholder="状态筛选" style="width: 140px" clearable @change="fetchActionLogs">
            <el-option label="全部" value="" />
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="超时" value="timeout" />
            <el-option label="执行中" value="executing" />
          </el-select>
          <span style="font-size: 12px; color: #909399">排查 "动作为什么没执行" 问题</span>
        </div>
        <el-table :data="actionLogs" stripe v-loading="actionLogLoading" size="small">
          <el-table-column prop="created_at" label="时间" width="170">
            <template #default="{ row }"><span class="time-text">{{ formatTime(row.created_at) }}</span></template>
          </el-table-column>
          <el-table-column prop="action_name" label="动作名称" width="140" show-overflow-tooltip />
          <el-table-column prop="rule_id" label="规则ID" width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.rule_id" style="font-family: monospace; font-size: 12px">{{ row.rule_id }}</span>
              <span v-else style="color: #C0C4CC">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="channel_id" label="通道" width="70" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="actionStatusTagType(row.status)" size="small" effect="dark">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="80" align="center">
            <template #default="{ row }">{{ row.execution_ms ? row.execution_ms + 'ms' : '-' }}</template>
          </el-table-column>
          <el-table-column label="重试" width="60" align="center">
            <template #default="{ row }">{{ row.retry_count > 0 ? `${row.retry_count}/${row.max_retries}` : '-' }}</template>
          </el-table-column>
          <el-table-column label="错误信息" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.error_code" style="color: #F56C6C">[{{ row.error_code }}] {{ row.error_message }}</span>
              <span v-else style="color: #67C23A">OK</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'failed' || row.status === 'timeout'" size="small" text type="primary" @click="retryAction(row.id)">重试</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap" v-if="actionLogTotal > actionLogPageSize">
          <el-pagination v-model:current-page="actionLogPage" v-model:page-size="actionLogPageSize" :total="actionLogTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" background small @change="fetchActionLogs" />
        </div>
      </div>

      <!-- ===== Tab 3: 引擎统计 ===== -->
      <div v-show="logActiveTab === 'stats'" v-loading="statsLoading">
        <el-row :gutter="16" style="margin-bottom: 16px">
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #6366F1">{{ engineStats.totalTriggers ?? '-' }}</div>
                <div class="debug-stat-label">总触发次数</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #10B981">{{ engineStats.totalActionsExecuted ?? '-' }}</div>
                <div class="debug-stat-label">动作执行成功</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #EF4444">{{ engineStats.totalActionsFailed ?? '-' }}</div>
                <div class="debug-stat-label">动作执行失败</div>
                <div v-if="engineStats.totalActionsFailed > 0" style="font-size: 11px; color: #F56C6C; margin-top: 2px">需排查失败动作</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #F59E0B">{{ engineStats.totalCooldownSkips ?? '-' }}</div>
                <div class="debug-stat-label">冷却跳过次数</div>
                <div v-if="engineStats.totalCooldownSkips > 0" style="font-size: 11px; color: #909399; margin-top: 2px">高频事件被冷却抑制</div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <el-row :gutter="16" style="margin-bottom: 16px">
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #8B5CF6">{{ engineStats.totalMergeCount ?? '-' }}</div>
                <div class="debug-stat-label">合并窗口合并数</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #3B82F6">{{ engineStats.triggeredToday ?? '-' }}</div>
                <div class="debug-stat-label">今日触发</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" :style="{ color: engineStats.successRate >= 0.95 ? '#10B981' : '#EF4444' }">{{ engineStats.successRate != null ? (engineStats.successRate * 100).toFixed(1) + '%' : '-' }}</div>
                <div class="debug-stat-label">动作成功率</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" :body-style="{ padding: '16px 20px' }">
              <div class="debug-stat">
                <div class="debug-stat-val" style="color: #6B7280">{{ engineStats.activeRules ?? '-' }} / {{ engineStats.totalRules ?? '-' }}</div>
                <div class="debug-stat-label">启用 / 总规则</div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <!-- 调试提示 -->
        <el-alert type="info" :closable="false">
          <template #title>
            <span style="font-size: 13px">
              <strong>调试指南：</strong>
              冷却跳过次数过高 → 考虑增大 cooldown_ms 或添加合并窗口；
              动作执行失败 > 0 → 查看 "动作执行日志" Tab 排查失败原因；
              今日触发为 0 但告警正常 → 检查规则条件是否过于严格或 Dry-Run 测试。
            </span>
          </template>
        </el-alert>
      </div>
    </el-dialog>

    <!-- ===== [FIX P1-2] 版本历史对话框 ===== -->
    <el-dialog v-model="versionHistoryVisible" :title="`版本历史 - ${versionHistoryRule?.name || ''}`" width="640px" destroy-on-close>
      <el-table :data="versionHistoryList" v-loading="versionHistoryLoading" size="small" max-height="400">
        <el-table-column prop="version" label="版本" width="70">
          <template #default="{ row }"><el-tag size="small">v{{ row.version }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="70" />
        <el-table-column label="更新时间" width="150">
          <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column prop="version_comment" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="warning" @click="handleRollback(row.version)"
              :disabled="row.version === (versionHistoryRule?.version || 0)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="versionHistoryVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ===== Dry-Run 结果对话框 ===== -->
    <el-dialog v-model="showDryRunDialog" title="规则模拟测试结果" width="680px" destroy-on-close>
      <template v-if="dryRunResult">
        <el-alert :type="dryRunResult.matched ? 'success' : 'warning'" :closable="false" style="margin-bottom: 16px">
          <template #title>
            <span style="font-size: 15px; font-weight: 600">{{ dryRunResult.matched ? '存在匹配规则' : '未匹配任何规则' }}</span>
          </template>
        </el-alert>
        <el-table :data="dryRunResult.rule_details" stripe size="small" style="margin-bottom: 16px">
          <el-table-column prop="rule_name" label="规则名称" min-width="120" show-overflow-tooltip />
          <el-table-column label="匹配" width="70" align="center">
            <template #default="{ row }"><el-tag :type="row.matched ? 'success' : 'danger'" size="small">{{ row.matched ? '是' : '否' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="时间" width="60" align="center">
            <template #default="{ row }"><el-tag :type="row.time_matched ? 'success' : 'info'" size="small">{{ row.time_matched ? '✓' : '✗' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="空间" width="60" align="center">
            <template #default="{ row }"><el-tag :type="row.spatial_matched ? 'success' : 'info'" size="small">{{ row.spatial_matched ? '✓' : '✗' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="源" width="60" align="center">
            <template #default="{ row }"><el-tag :type="row.source_matched ? 'success' : 'info'" size="small">{{ row.source_matched ? '✓' : '✗' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="冷却" width="60" align="center">
            <template #default="{ row }"><el-tag :type="row.cooldown_active ? 'warning' : 'info'" size="small">{{ row.cooldown_active ? '是' : '否' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="match_reason" label="原因" min-width="120" show-overflow-tooltip />
        </el-table>
        <div v-if="dryRunResult.simulated_actions?.length" style="margin-top: 12px">
          <div style="font-weight: 600; margin-bottom: 8px">将触发的动作:</div>
          <el-tag v-for="a in dryRunResult.simulated_actions" :key="a" type="success" effect="plain" style="margin: 2px">{{ a }}</el-tag>
        </div>
      </template>
      <template #footer><el-button @click="showDryRunDialog = false">关闭</el-button></template>
    </el-dialog>

    <!-- ===== 模板库对话框 ===== -->
    <el-dialog v-model="showTemplateDialog" title="规则模板库" width="900px" destroy-on-close>
      <div v-loading="templateLoading">
        <!-- [P1-LR1] 搜索 + 分类标签导航 -->
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px">
          <el-input v-model="tmplSearchKeyword" placeholder="搜索模板名称/描述..." clearable size="small" style="width: 260px">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <span style="font-size: 12px; color: #909399">共 {{ filteredTemplateList.length }} 个模板</span>
        </div>
        <!-- [P1-LR1] 分类导航标签 -->
        <div style="margin-bottom: 16px">
          <el-radio-group v-model="tmplActiveCategory" size="small">
            <el-radio-button label="全部">全部 ({{ templateList.length }})</el-radio-button>
            <el-radio-button v-for="cat in tmplCategories" :key="cat" :label="cat">
              {{ cat }} ({{ templatesByCategory[cat]?.length || 0 }})
            </el-radio-button>
          </el-radio-group>
        </div>
        <!-- 模板列表 (按分类) -->
        <div style="max-height: 480px; overflow-y: auto">
          <div v-for="(group, cat) in filteredTemplatesByCategory" :key="cat" style="margin-bottom: 20px">
            <div style="font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #303133; border-left: 3px solid #6366F1; padding-left: 8px">{{ cat }}</div>
            <el-row :gutter="12">
              <el-col :span="8" v-for="tmpl in group" :key="tmpl.template_id || tmpl.id">
                <el-card shadow="hover" class="template-card" :body-style="{ padding: '14px' }">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px">
                    <div style="font-weight: 600; font-size: 14px">{{ tmpl.name }}</div>
                    <el-tag v-if="tmpl.is_builtin" size="small" type="info" effect="plain">内置</el-tag>
                  </div>
                  <div style="font-size: 12px; color: #909399; margin-bottom: 10px; line-height: 1.5">{{ tmpl.description }}</div>
                  <div style="margin-bottom: 8px">
                    <el-tag v-for="t in (tmpl.tags || []).slice(0, 3)" :key="t" size="small" effect="plain" style="margin: 1px">{{ t }}</el-tag>
                  </div>
                  <div style="font-size: 12px; color: #909399; margin-bottom: 10px">优先级: {{ tmpl.priority }} | 动作: {{ (tmpl.actions || []).length }}项</div>
                  <!-- [P2-1] 治理字段徽标: 仅在模板设置过时显示 -->
                  <div v-if="tmpl.close_condition || (tmpl.response_deadline_s ?? 0) > 0" style="margin-bottom: 10px">
                    <el-tag v-if="tmpl.close_condition" size="small" type="warning" effect="plain" style="margin-right: 4px">关闭: {{ closeConditionLabel(tmpl.close_condition) }}</el-tag>
                    <el-tag v-if="(tmpl.response_deadline_s ?? 0) > 0" size="small" type="danger" effect="plain">时限: {{ tmpl.response_deadline_s }}s</el-tag>
                  </div>
                  <div style="display: flex; gap: 8px">
                                      <el-button type="primary" size="small" @click="applyTemplate(tmpl)" style="flex: 1">一键应用</el-button>
                                      <el-button type="warning" size="small" @click="openEventTest(tmpl)" plain>
                                        🧪 测试
                                      </el-button>
                                    </div>
                </el-card>
              </el-col>
            </el-row>
          </div>
          <el-empty v-if="!templateLoading && Object.keys(filteredTemplatesByCategory).length === 0" description="未找到匹配的模板" />
        </div>
      </div>
    </el-dialog>

    <!-- ===== 事件模板全链路测试抽屉 ===== -->
    <EventTestDrawer
      v-model="showEventTestDrawer"
      :event-name="eventTestTarget?.name || ''"
      :event-type="eventTestTarget?.eventType || ''"
      :coverage-info="eventTestCoverage"
    />

    <!-- ===== 时段模板管理对话框 ===== -->
    <el-dialog v-model="showTimeTemplateDialog" title="布防时段模板管理" width="600px" destroy-on-close>
      <TimeTemplateEditor @apply="applyTimeTemplate" />
    </el-dialog>

    </el-tab-pane><!-- end 联动规则 -->

    <!-- ==================== 预案管理 Tab ==================== -->
    <el-tab-pane label="预案管理" name="plans">
      <div class="tab-toolbar" >
        <el-button type="primary" size="small" @click="openPlanEditor(null)">+ 新建预案</el-button>
        <el-button size="small" @click="fetchPlans">刷新</el-button>
      </div>
      <el-table :data="plans" stripe v-loading="plansLoading" size="small" style="margin-top: 12px">
        <el-table-column prop="plan_id" label="ID" width="140" />
        <el-table-column prop="name" label="名称" width="160" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="关联规则" width="100">
          <template #default="{ row }">{{ (row.rule_ids || []).length }} 条</template>
        </el-table-column>
        <el-table-column label="定时布撤防" width="160">
          <template #default="{ row }">
            <span v-if="row.schedule?.enabled">{{ row.schedule.arm_time }} - {{ row.schedule.disarm_time }}</span>
            <span v-else style="color: #c0c4cc">未启用</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '已激活' : '未激活' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openPlanEditor(row)">编辑</el-button>
            <el-button v-if="!row.enabled" size="small" link type="success" @click="handleActivatePlan(row.plan_id)">激活</el-button>
            <el-button v-else size="small" link type="warning" @click="handleDeactivatePlan(row.plan_id)">停用</el-button>
            <el-popconfirm title="确认删除?" @confirm="handleDeletePlan(row.plan_id)">
              <template #reference><el-button size="small" link type="danger">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>

    <!-- ==================== CEP 模式 Tab ==================== -->
    <el-tab-pane label="CEP复杂事件" name="cep">
      <div class="tab-toolbar">
        <el-button type="primary" size="small" @click="openCEPEditor(null)">+ 新建CEP模式</el-button>
        <el-button size="small" @click="fetchCEPPatterns">刷新</el-button>
        <span v-if="cepStats" style="margin-left: 16px; font-size: 12px; color: #909399">
          事件输入: {{ cepStats.total_events_in }} | 模式匹配: {{ cepStats.total_patterns_matched }} | 复合事件: {{ cepStats.total_composite_events }}
        </span>
      </div>
      <el-table :data="cepPatterns" stripe v-loading="cepLoading" size="small" style="margin-top: 12px">
        <el-table-column prop="pattern_id" label="ID" width="200" />
        <el-table-column prop="name" label="名称" width="180" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作符" width="100">
          <template #default="{ row }">
            <el-tag v-for="s in (row.steps || []).slice(0, 2)" :key="s.step_id" size="small" style="margin: 1px">{{ opLabel(s.op) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="窗口" width="100">
          <template #default="{ row }">{{ (row.window_ms / 1000).toFixed(0) }}s</template>
        </el-table-column>
        <el-table-column prop="output_event_type" label="输出事件" width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内置" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.is_builtin" type="info" size="small">内置</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openCEPEditor(row)" :disabled="row.is_builtin">编辑</el-button>
            <el-popconfirm title="确认删除?" @confirm="handleDeleteCEP(row.pattern_id)" :disabled="row.is_builtin">
              <template #reference><el-button size="small" link type="danger" :disabled="row.is_builtin">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>

    </el-tabs><!-- end main-tabs -->

    <!-- ===== 预案编辑器 ===== -->
    <PlanEditor v-model="planEditorVisible" :edit-plan="editingPlan" @saved="fetchPlans" />
    <!-- ===== CEP 编辑器 ===== -->
    <CEPPatternEditor v-model="cepEditorVisible" :edit-pattern="editingCEP" @saved="fetchCEPPatterns" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Search, Plus, Document, Link, Bell, Setting, ArrowDown, Download, Upload, Refresh, WarningFilled, DataLine } from '@element-plus/icons-vue'
import { linkageApi, ACTION_TYPE_MAP, ACTION_TYPE_REVERSE_MAP, getTargetForActionType, unwrapRuleTemplates } from '@/api/linkage'
import { regionApi } from '@/api/region'  // [FIX 2026-08-28] 画板绊线自动创建 (createTripwireWithMirror)
import type { LinkageRule, LinkageAction, LinkageLog, ActionLogEntry, TimeTemplate, LinkagePlan, CEPPattern, ConditionNode, RuleConflict, RuleTriggerStat } from '@/api/linkage'
import { useLinkageOptions } from '@/composables/useLinkageOptions'
import { validateTemplateImport } from '@/api/templateSchema'
import RoiPolygonEditor from '@/components/RoiPolygonEditor.vue'
import TimeTemplateEditor from '@/components/TimeTemplateEditor.vue'
import EventTestDrawer from '@/components/EventTestDrawer.vue'
import { testApi } from '@/api/test'
import type { EventCoverageItem } from '@/api/test'
import PlanEditor from '@/components/PlanEditor.vue'
import CEPPatternEditor from '@/components/CEPPatternEditor.vue'
import ConditionTreeEditor from '@/components/ConditionTreeEditor.vue'
import type { RoiData } from '@/composables/useRoiCanvas'

// ── 常量 ──

const conditionDefs = [
  { type: 'time', icon: '🕐', label: '时间条件' },
  { type: 'region', icon: '📍', label: '空间条件' },
  { type: 'location', icon: '📌', label: '位置条件' },
  { type: 'eventType', icon: '🎯', label: '事件类型' },
  { type: 'eventSource', icon: '📹', label: '事件源' },
  { type: 'autoMerge', icon: '🔄', label: '自动合并' },
] as const

const weekdays = [
  { label: '周一', value: 1 }, { label: '周二', value: 2 }, { label: '周三', value: 3 },
  { label: '周四', value: 4 }, { label: '周五', value: 5 }, { label: '周六', value: 6 }, { label: '周日', value: 7 },
]

// 每月日期选项 (1-31)
const monthdayOptions = Array.from({ length: 31 }, (_, i) => ({ label: `${i + 1}日`, value: i + 1 }))

// 动态选项 (从后端加载)
const { eventTypeOptions, eventTypeGrouped, severityColor, channelOptions: channelOptionsDynamic, locationOptions: locationOptionsDynamic, loading: optionsLoading, fetchOptions } = useLinkageOptions()

// 静态回退选项 — [P1-8 2026-08-20] value 对齐 SSOT meta_table canonical key
//   (原中文串 value 不在后端 LinkageEngine 识别范围, 回退时选中即产生永久沉默规则)
const fallbackEventTypes = [
  { value: 'intrusion', label: '周界入侵' },
  { value: 'tripwire', label: '越界检测' },
  { value: 'fire', label: '火焰检测' },
  { value: 'helmet_violation', label: '安全帽违规' },
  { value: 'face_detected', label: '人脸检测' },
  { value: 'plate_detected', label: '车牌识别' },
  { value: 'crowd', label: '人群聚集' },
  { value: 'fall_detected', label: '跌倒检测' },
]
const fallbackChannelOptions: string[] = [] // 已移除虚假静态通道，避免规则无法触发
const roiOptions = ['全部区域', '周界线A', '绊线B', '区域C']
const groupOptions = ['全部分组', '东区摄像头', '室内摄像头', '室外摄像头']

// ROI 编辑器背景快照
// [FIX 2026-08-28 SNAPSHOT-JSON-CONTRACT] 后端 /snapshot 返回 JSON {data:{url:"/snapshots/..."}},
// 旧实现把 JSON body 当图片 blob 塞给 <img> 必然解码失败 → 绘制区域无画面。
// 改为解析 url 后预加载校验 (nginx 已 alias /snapshots/ → /data/shield/snapshots/);
// ZLM getSnap 偶发产出 0 字节 JPEG (~3%), 加载失败自动重试一次。
const roiBackgroundUrl = ref('')
async function fetchSnapshotUrl(channelId: string): Promise<string> {
  const res = await fetch(`/api/v1/channels/${channelId}/snapshot`, { credentials: 'include' })
  if (!res.ok) return ''
  const j = await res.json().catch(() => null)
  const url = j?.data?.url || j?.url || ''
  return url ? String(url) : ''
}
function preloadSnapshot(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}
async function loadChannelSnapshot(channelId: string) {
  if (!channelId) { roiBackgroundUrl.value = ''; return }
  try {
    let url = await fetchSnapshotUrl(channelId)
    if (url && !(await preloadSnapshot(url))) {
      const retryUrl = await fetchSnapshotUrl(channelId) // 偶发空快照, 重试一次
      if (retryUrl && (await preloadSnapshot(retryUrl))) url = retryUrl
    }
    roiBackgroundUrl.value = url
  } catch { roiBackgroundUrl.value = '' }
}

// [FIX 2026-08-27 P0-PERIMETER v3] 加载越界绊线选项 (按需, 仅在用户聚焦下拉时拉一次)
async function loadTripwireOptions() {
  if (tripwireOptions.value.length > 0) return  // 缓存
  tripwireLoading.value = true
  try {
    const res = await fetch('/api/v1/algos/tripwires', { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    // 兼容 makeOkResponse 包装: 直接读 data.tripwires 或 data.data.tripwires
    const list = data?.tripwires ?? data?.data?.tripwires ?? []
    // [FIX 2026-08-28 双镜像过滤] 双流实例适配会在 DB 存同一绊线的主形态 +
    //   _ch0 镜像两条记录; 下拉只列主形态, 避免用户选到镜像。
    const seenBase = new Set<string>()
    const mainList = (list as any[]).filter((t: any) => {
      const chStr = String(t.channel_id_str || '')
      const base = chStr.replace(/_ch\d+$/, '')
      if (base !== chStr) return false              // 镜像记录不列
      if (seenBase.has(base + ':' + t.point_a)) return false  // 同位重复去重
      seenBase.add(base + ':' + t.point_a)
      return true
    })
    // direction 大小写转换: a_to_b → A_TO_B
    tripwireOptions.value = mainList.map((t: any) => ({
      id: String(t.id),
      label: `${t.name || '未命名绊线'} [${t.channel_id_str || t.channel_id || '?'}] (${dirToUpper(t.direction)})`,
      direction: dirToUpper(t.direction),
      channelIdStr: t.channel_id_str || '',
    }))
    tripwireEmptyHint.value = tripwireOptions.value.length === 0 ? '暂无越界绊线, 请先到算法配置创建' : ''
  } catch (e: any) {
    tripwireEmptyHint.value = `加载失败: ${e?.message || '未知错误'}`
    tripwireOptions.value = []
  } finally {
    tripwireLoading.value = false
  }
}
/** 通道 ID 双形态归一: 同一通道(剥 _ch0 后缀相等)只留一个, 带后缀形态优先
 *  (与通道选项 value 形态一致, 保证编辑回填时勾选能匹配上) */
function dedupeChannelForms(raw: string[]): string[] {
  const byBase = new Map<string, string>()
  for (const c of raw) {
    const base = c.replace(/_ch\d+$/, '')
    const prev = byBase.get(base)
    if (prev === undefined) { byBase.set(base, c); continue }
    // 已有形态: 若存的是主形态而当前是带后缀形态 → 替换 (带后缀优先)
    if (prev === base && c !== base) byBase.set(base, c)
  }
  return [...byBase.values()]
}

function dirToUpper(d: string): string {
  if (!d) return ''
  return d.toUpperCase()
}

const clientActionGroups = [
  { label: '视频联动', items: [
    { type: 'CLIENT_SHOW_LIVE', icon: '📹', label: '弹出指定监控点实时视频' },
    { type: 'CLIENT_SHOW_PLAYBACK', icon: '📼', label: '弹出指定监控点录像回放' },
    { type: 'CLIENT_SHOW_IMAGE', icon: '🖼️', label: '弹出事件图片' },
    { type: 'CLIENT_OVERLAY_INFO', icon: '📋', label: '弹窗视频画面叠加事件信息' },
  ]},
  { label: '音频联动', items: [
    { type: 'CLIENT_VOICE_TALK', icon: '🎙️', label: '控制指定对讲通道语音对讲' },
    { type: 'CLIENT_PLAY_TONE', icon: '🔔', label: '播放提示音' },
    { type: 'CLIENT_TTS_BROADCAST', icon: '📢', label: '语音播报事件信息 (重复N次)' },
  ]},
  { label: '显示联动', items: [
    { type: 'CLIENT_SHOW_MAP', icon: '🗺️', label: '联动地图位置' },
    { type: 'CLIENT_TV_WALL', icon: '🖥️', label: '指定监控点上电视墙 (持续N秒)' },
    { type: 'CLIENT_SUPPRESS_POPUP', icon: '🔇', label: '发生预警不弹窗 (静默)' },
    { type: 'CLIENT_EXECUTE_PLAN', icon: '📋', label: '执行事件处理预案' },
  ]},
  { label: '录像与抓图', items: [
    { type: 'CLIENT_RECORD_EVENT', icon: '🎥', label: '指定监控点事件录像' },
    { type: 'CLIENT_ADD_BOOKMARK', icon: '🔖', label: '添加录像标记' },
    { type: 'CLIENT_CAPTURE_IMAGE', icon: '📸', label: '间隔N秒抓图M次' },
  ]},
  { label: '设备控制', items: [
    { type: 'CLIENT_ALARM_OUTPUT', icon: '🚨', label: '控制指定报警输出' },
    { type: 'CLIENT_PTZ_CONTROL', icon: '🎮', label: '控制云台' },
    { type: 'CLIENT_PTZ_PRESET_START', icon: '📍', label: '事件开始转到预置点' },
    { type: 'CLIENT_PTZ_PRESET_END', icon: '🔙', label: '事件结束恢复到预置点' },
    { type: 'CLIENT_PTZ_CRUISE', icon: '🔄', label: '调用巡航路径' },
    { type: 'CLIENT_PTZ_TRACK', icon: '〰️', label: '调用轨迹' },
    { type: 'CLIENT_ACCESS_OPEN', icon: '🚪', label: '指定门禁点开门' },
  ]},
  { label: '通知', items: [
    { type: 'CLIENT_SEND_SMS', icon: '💬', label: '发送短信给指定用户' },
    { type: 'CLIENT_SEND_EMAIL', icon: '📧', label: '发送邮件给指定用户' },
    { type: 'CLIENT_ALARM_MODE', icon: '🌐', label: '指定IP进行指定模式报警' },
    { type: 'CLIENT_ESCALATE', icon: '⬆️', label: '逐级推送' },
  ]},
]

const webActionGroups = [
  { label: '视频联动', items: [
    { type: 'WEB_POPUP', icon: '💬', label: 'Web端弹窗通知' },
    { type: 'WEB_SHOW_LIVE', icon: '📹', label: '弹出实时视频' },
    { type: 'WEB_SHOW_PLAYBACK', icon: '📼', label: '弹出录像回放' },
    { type: 'WEB_SHOW_IMAGE', icon: '🖼️', label: '弹出事件图片' },
  ]},
  { label: '音频联动', items: [
    { type: 'WEB_PLAY_TONE', icon: '🔔', label: '播放提示音' },
    { type: 'WEB_TTS_BROADCAST', icon: '📢', label: '语音播报' },
  ]},
  { label: '录像控制', items: [
    { type: 'WEB_CAPTURE_IMAGE', icon: '📸', label: '抓图' },
    { type: 'WEB_RECORD_EVENT', icon: '🎥', label: '事件录像' },
  ]},
  { label: '通知推送', items: [
    { type: 'WEB_EMAIL', icon: '📧', label: '发送邮件' },
    { type: 'WEB_WEBHOOK', icon: '🔗', label: 'HTTP回调 (WebHook)' },
    { type: 'WEB_SEND_SMS', icon: '💬', label: '发送短信' },
    { type: 'WEB_DASHBOARD_ALERT', icon: '📊', label: 'Dashboard嵌入告警' },
  ]},
]
const appActions = [
  { type: 'APP_PUSH_NOTIFY', icon: '📱', label: 'APP推送通知' },
  { type: 'APP_SHOW_LIVE', icon: '📹', label: 'APP弹实时视频' },
  { type: 'APP_SHOW_IMAGE', icon: '🖼️', label: 'APP弹事件图片' },
  { type: 'APP_SHOW_PLAYBACK', icon: '📼', label: 'APP弹录像回放' },
  { type: 'APP_HANDLE_DISPOSE', icon: '✅', label: 'APP处置按钮' },
]
const mpActions = [
  { type: 'MP_SUBSCRIBE_MSG', icon: '💬', label: '小程序订阅消息' },
  { type: 'MP_SHOW_IMAGE', icon: '🖼️', label: '小程序弹事件图片' },
  { type: 'MP_SHOW_LIVE', icon: '📹', label: '小程序弹实时视频' },
]
const sysActions = [
  { type: 'SYS_MQTT_PUBLISH', icon: '📡', label: 'MQTT消息发布' },
  { type: 'SYS_MODBUS_WRITE', icon: '🔌', label: 'Modbus写寄存器' },
  { type: 'SYS_ONVIF_TRIGGER', icon: '🔗', label: 'ONVIF事件触发' },
  { type: 'SYS_RELAY_SWITCH', icon: '⚡', label: '继电器开关' },
  { type: 'SYS_HTTP_CALLBACK', icon: '🌐', label: 'HTTP回调' },
  { type: 'SYS_CLOUD_FORWARD', icon: '☁️', label: '转发到云端' },
  { type: 'SYS_START_INFERENCE', icon: '🧠', label: '启动AI推理' },
  { type: 'SYS_STOP_INFERENCE', icon: '⏹️', label: '停止AI推理' },
  { type: 'SYS_START_STREAM', icon: '📹', label: '启动拉流' },
  { type: 'SYS_STOP_STREAM', icon: '⏸️', label: '停止拉流' },
  { type: 'SYS_DEPLOY_PIPELINE', icon: '🚀', label: '部署Pipeline' },
  { type: 'SYS_UNDEPLOY_PIPELINE', icon: '🛑', label: '卸载Pipeline' },
]

// ── 列表状态 ──

const loading = ref(false)
const rules = ref<LinkageRule[]>([])
const searchQuery = ref('')
const enabledFilter = ref<boolean | string>('')
const sortBy = ref('priority')
const sortOrder = ref<'ascending' | 'descending'>('descending')
const selectedRows = ref<LinkageRule[]>([])
const tagFilter = ref<string[]>([])
/** [校园二期增强 2026-08-30] 标签筛选选项: 从当前规则集动态聚合 (scene_pack/large_event/自定义);
 *  跳过规则码型 tag (LE- 与 SC- 前缀的模板 id 派生标签), 保持选项为业务标签 */
const allRuleTags = computed(() => {
  const s = new Set<string>()
  rules.value.forEach(r => (r.tags || []).forEach(t => {
    if (!/^[A-Z]{2,}-/.test(t)) s.add(t)
  }))
  return [...s].sort()
})
const showArchived = ref(false) // [FIX P2-3] 是否显示归档规则

// [FIX 2026-08-27 P0-PERIMETER v3] 越界绊线选项
//   后端 GET /api/v1/algos/tripwires → { tripwires: [{id, name, channel_id_str, algo_id, direction, ...}] }
//   direction 后端为小写 a_to_b, 前端为 A_TO_B, 转换在 loadTripwireOptions 内进行。
const tripwireLoading = ref(false)
const tripwireOptions = ref<Array<{ id: string; label: string; direction: string; channelIdStr: string }>>([])
const tripwireEmptyHint = ref('点击加载越界绊线')

// [P2-LR2] 规则冲突检测状态
const conflictLoading = ref(false)
const conflictResults = ref<RuleConflict[]>([])

// 冲突检测
async function checkConflicts() {
  conflictLoading.value = true
  try {
    const { data: res } = await linkageApi.detectConflicts()
    conflictResults.value = res?.data?.conflicts || []
    if (conflictResults.value.length === 0) {
      ElMessage.success('未检测到规则冲突')
    } else {
      ElMessage.warning(`检测到 ${conflictResults.value.length} 条规则冲突`)
    }
  } catch (e: any) {
    ElMessage.error('冲突检测失败: ' + (e?.message || '未知错误'))
  } finally {
    conflictLoading.value = false
  }
}

// [P3-LR3] 规则执行统计状态
const ruleStatsLoading = ref(false)
const ruleStatsVisible = ref(false)
const ruleStatsCollapse = ref<string[]>(['stats'])
const ruleStatsData = ref<RuleTriggerStat[]>([])

// [P1-LR2] 冲突类型中文标签映射
const CONFLICT_TYPE_LABELS: Record<string, string> = {
  overlapping_trigger: '触发重叠',
  action_redundancy: '动作冗余',
  wildcard_shadowing: '通配遮蔽',
  cooldown_violation: '冷却过短',
  time_window_conflict: '时间窗口冲突',
}
function conflictTypeLabel(type: string): string {
  return CONFLICT_TYPE_LABELS[type] || type
}

function toggleRuleStats() {
  ruleStatsVisible.value = !ruleStatsVisible.value
  if (ruleStatsVisible.value && ruleStatsData.value.length === 0) {
    loadRuleStats()
  }
}

async function loadRuleStats() {
  ruleStatsLoading.value = true
  try {
    const { data: res } = await linkageApi.getRuleStats()
    ruleStatsData.value = res?.data?.rules || []
  } catch (e: any) {
    ElMessage.error('加载规则统计失败: ' + (e?.message || '未知错误'))
  } finally {
    ruleStatsLoading.value = false
  }
}

function formatStatsTime(ms: number): string {
  if (!ms) return '从未'
  const diff = Date.now() - ms
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}小时前`
  return new Date(ms).toLocaleDateString()
}

const allTags = computed(() => {
  const tagSet = new Set<string>()
  for (const r of rules.value) {
    for (const t of r.tags || []) tagSet.add(t)
  }
  return Array.from(tagSet).sort()
})

const filteredRules = computed(() => {
  let list = [...rules.value]
  // [FIX P2-3] 默认隐藏归档规则
  if (!showArchived.value) list = list.filter(r => !r.is_archived)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q))
  }
  if (enabledFilter.value === true || enabledFilter.value === false) list = list.filter(r => r.enabled === enabledFilter.value)
  if (tagFilter.value.length > 0) {
    list = list.filter(r => {
      const ruleTags = r.tags || []
      return tagFilter.value.some(t => ruleTags.includes(t))
    })
  }
  const key = sortBy.value
  const ord = sortOrder.value === 'ascending' ? 1 : -1
  list.sort((a: any, b: any) => {
    if (key === 'priority') return (a.priority - b.priority) * ord
    return ((a[key] || 0) - (b[key] || 0)) * ord
  })
  return list
})

// ── 统计卡片 ──

const statCards = computed(() => {
  const total = rules.value.length
  const enabled = rules.value.filter(r => r.enabled).length
  return [
    { label: '规则总数', value: total, color: '#6366F1', icon: Link },
    { label: '已启用', value: enabled, color: '#10B981', icon: Bell },
    { label: '已停用', value: total - enabled, color: '#F59E0B', icon: Setting },
    { label: '高优先级(>=80)', value: rules.value.filter(r => r.priority >= 80).length, color: '#EF4444', icon: Bell },
  ]
})

// ── 编辑器状态 ──

const drawerVisible = ref(false)
const editingRule = ref<LinkageRule | null>(null)
const saving = ref(false)
const activeActionTab = ref('client')
const collapsedConditions = reactive<Record<string, boolean>>({ time: false, region: true, location: true, eventType: false, eventSource: true, autoMerge: true })
const actionState = reactive<Record<string, boolean>>({})
const actionParams = reactive<Record<string, Record<string, any>>>({})
const formRef = ref<FormInstance>()

const formRules = reactive<FormRules>({
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  priority: [{ type: 'number', min: 1, max: 100, message: '优先级 1-100', trigger: 'change' }],
})

function defaultConditions() {
  return {
    time: { enabled: false, config: { startTime: '08:00', endTime: '20:00', weekdays: [1, 2, 3, 4, 5], monthdays: [] as number[] } },
    region: { enabled: false, config: { location: '', roi: '', group: '', roiPolygon: [] as RoiData[], channelId: '' } },
    location: { enabled: false, config: { point: '' } },
    eventType: { enabled: true, config: { types: [] as string[], minSeverity: 3, minConfidence: 50 } },
    eventSource: { enabled: false, config: { channels: [] as string[] } },
    autoMerge: { enabled: false, config: { windowMs: 10000, maxCount: 10, dimension: 'channel' } },
  }
}

const form = reactive({
  name: '',
  description: '',
  priority: 50,
  cooldownMs: 5000,
  enabled: true,
  tags: [] as string[],
  timeTemplateId: '',
  // [FIX P1-1] 冲突处理与高级配置
  mutexGroup: '',
  suppressAfterRule: '',
  suppressLowerPriority: false,
  enableVlmVerify: false,
  // [P2-1] 治理字段: 关闭条件/响应时限
  closeCondition: '',
  responseDeadlineS: 0,
  conditions: defaultConditions(),
})
const advancedCollapse = ref<string[]>([])

// ── 高级条件模式 ──
const advancedConditionMode = ref(false)
const conditionTreeValue = ref<ConditionNode | undefined>(undefined)

// ── Dry-Run 状态 ──
const dryRunLoading = ref(false)
const dryRunResult = ref<any>(null)
const showDryRunDialog = ref(false)

// ── 模板库状态 ──
const showTemplateDialog = ref(false)
const showTimeTemplateDialog = ref(false)
const templateLoading = ref(false)
const templateList = ref<any[]>([])
const templatesByCategory = computed(() => {
  const map: Record<string, any[]> = {}
  for (const t of templateList.value) {
    const cat = t.category || '其他'
    if (!map[cat]) map[cat] = []
    map[cat].push(t)
  }
  return map
})

// ── 事件测试状态 ──
const showEventTestDrawer = ref(false)
const eventTestTarget = ref<{ name: string; eventType: string } | null>(null)
const eventTestCoverage = ref<EventCoverageItem | null>(null)
const eventCoverageMap = ref<Record<string, EventCoverageItem>>({})

// 加载事件可测性矩阵
async function loadEventCoverage() {
  if (Object.keys(eventCoverageMap.value).length > 0) return
  try {
    const res = await testApi.getEventCoverage()
    const data = (res as any)?.data?.data
    if (data?.coverage) {
      eventCoverageMap.value = data.coverage
    }
  } catch {
    // 静默失败，不影响主页面
  }
}

// 打开事件测试抽屉
async function openEventTest(tmpl: any) {
  const eventType = tmpl.source_cond?.event_types?.[0] ||
                    (tmpl.tags && tmpl.tags[0]) || 'test_alarm'

  eventTestTarget.value = {
    name: tmpl.name,
    eventType,
  }

  await loadEventCoverage()
  eventTestCoverage.value = eventCoverageMap.value[eventType] || {
    test_mode: 'synthesis' as const,
    algo_id: null,
    reason: '未找到关联信息，使用合成事件模式',
  }

  showEventTestDrawer.value = true
}

// 从联动规则列表打开测试抽屉
// 规则的 source_cond.algorithm_ids 存的是事件类型字符串（如 "intrusion"），不是插件 ID
// 需要通过覆盖率矩阵或算法列表反查到完整插件 ID
async function openRuleTest(rule: LinkageRule) {
  const eventTypes = rule.source_cond?.event_types || []
  const eventType = eventTypes[0] || 'test_alarm'

  eventTestTarget.value = {
    name: rule.name,
    eventType,
  }

  // 强制重新加载覆盖率矩阵（清除缓存）
  eventCoverageMap.value = {}
  await loadEventCoverage()

  console.log('[openRuleTest] rule:', rule.name, 'eventTypes:', eventTypes, 'coverageMap keys:', Object.keys(eventCoverageMap.value).length)

  // 遍历规则的所有事件类型，找到第一个在覆盖率矩阵中有 algo_id 的
  let coverage: EventCoverageItem | null = null
  for (const et of eventTypes) {
    const c = eventCoverageMap.value[et]
    if (c?.algo_id) {
      coverage = c
      eventTestTarget.value.eventType = et
      console.log('[openRuleTest] found coverage for', et, '→ algo_id:', c.algo_id)
      break
    }
  }

  // 如果覆盖率矩阵没找到，尝试用 algorithm_ids 字段（可能存的是事件类型）
  if (!coverage) {
    // 查找覆盖率矩阵中所有有 algo_id 的条目，匹配任意事件类型
    for (const et of eventTypes) {
      if (eventCoverageMap.value[et]) {
        coverage = eventCoverageMap.value[et]
        eventTestTarget.value.eventType = et
        break
      }
    }
  }

  if (!coverage) {
    coverage = {
      test_mode: 'image' as const,
      algo_id: null,
      reason: '图片推理模式（请在下拉中手动选择算法）',
    }
  }

  console.log('[openRuleTest] final coverage:', JSON.stringify(coverage))
  eventTestCoverage.value = coverage

  showEventTestDrawer.value = true
}

// [P1-LR1] 模板分类导航
const tmplSearchKeyword = ref('')
const tmplActiveCategory = ref('全部')
const tmplCategories = computed(() => Object.keys(templatesByCategory.value).sort())
const filteredTemplateList = computed(() => {
  let list = templateList.value
  // 分类过滤
  if (tmplActiveCategory.value !== '全部') {
    list = list.filter(t => (t.category || '其他') === tmplActiveCategory.value)
  }
  // 关键词搜索
  const kw = tmplSearchKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(t =>
      (t.name || '').toLowerCase().includes(kw) ||
      (t.description || '').toLowerCase().includes(kw) ||
      (t.tags || []).some((tag: string) => tag.toLowerCase().includes(kw))
    )
  }
  return list
})
const filteredTemplatesByCategory = computed(() => {
  const map: Record<string, any[]> = {}
  for (const t of filteredTemplateList.value) {
    const cat = t.category || '其他'
    if (!map[cat]) map[cat] = []
    map[cat].push(t)
  }
  return map
})

// ── 日志/调试控制台状态 ──

const showLogDialog = ref(false)
const logs = ref<LinkageLog[]>([])
const logLoading = ref(false)
const logPage = ref(1)
const logPageSize = ref(20)
const logTotal = ref(0)
const logViewMode = ref('table')
const logActiveTab = ref('trigger')

// 动作执行日志
const actionLogs = ref<ActionLogEntry[]>([])
const actionLogLoading = ref(false)
const actionLogPage = ref(1)
const actionLogPageSize = ref(20)
const actionLogTotal = ref(0)
const actionLogStatusFilter = ref('')

// 引擎统计
const engineStats = ref<Record<string, any>>({})
const statsLoading = ref(false)

// 实时刷新
const debugAutoRefresh = ref(false)
let debugRefreshTimer: ReturnType<typeof setInterval> | null = null

// ── 参数弹窗 ──

const paramDialogVisible = ref(false)
const paramDialogTitle = ref('')
const currentParamAction = ref('')
const paramActionCategory = ref('generic')

const paramForm = reactive({
  channel_id: '',
  device_id: '',
  delay_ms: 0,
  repeat_count: 1,
  repeat_interval_ms: 0,
  // TTS
  tts_text: '',
  tts_repeat: 1,
  // PTZ
  preset_id_start: '',
  preset_id_end: '',
  cruise_path_id: '',
  // WebHook
  callback_url: '',
  callback_method: 'POST',
  // MQTT
  mqtt_topic: '',
  mqtt_payload: '',
  // TV Wall
  tv_wall_id: '',
  tv_wall_duration_s: 30,
  // Capture
  capture_interval_s: 2,
  capture_count: 3,
  // Modbus
  modbus_host: '',
  modbus_port: 502,
  modbus_register: 0,
  modbus_value: 1,
  // Generic
  extra: '',
})

// ── 工具函数 ──

function conditionLabel(type: string) {
  const m: Record<string, string> = { time: '时间', spatial: '空间', source: '事件源', merge: '合并' }
  return m[type] || type
}

function getActiveConditions(rule: LinkageRule): Array<{ key: string; label: string }> {
  const tags: Array<{ key: string; label: string }> = []
  const tc = rule.time_cond
  if (tc && (tc.time_start || tc.time_end || tc.weekdays?.length || tc.monthdays?.length))
    tags.push({ key: 'time', label: '🕐 时间' })
  const sc = rule.spatial_cond
  if (sc && (sc.region_id || sc.location_id || sc.device_group_id || sc.roi_polygon?.length || sc.tripwire_id || sc.direction))
    tags.push({ key: 'spatial', label: '📍 空间' })
  const src = rule.source_cond
  if (src && (src.event_types?.length || src.channel_ids?.length || src.algorithm_ids?.length))
    tags.push({ key: 'source', label: '🎯 事件源' })
  const mc = rule.merge_cond
  if (mc && mc.enabled)
    tags.push({ key: 'merge', label: '🔄 合并' })
  return tags
}

function formatTime(ts?: number | string) {
  if (!ts) return '-'
  try {
    const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
    return date.toLocaleString('zh-CN')
  } catch { return String(ts) }
}

function formatCooldown(ms?: number) {
  if (!ms) return '-'
  return ms >= 1000 ? (ms / 1000) + 's' : ms + 'ms'
}

function toggleCollapse(type: string) { collapsedConditions[type] = !collapsedConditions[type] }
function handleSortChange({ prop, order }: any) { if (prop) sortBy.value = prop; if (order) sortOrder.value = order }
function handleSelectionChange(rows: LinkageRule[]) { selectedRows.value = rows }

function getParamCategory(typeStr: string): string {
  if (typeStr === 'CLIENT_TTS_BROADCAST' || typeStr === 'WEB_TTS_BROADCAST') return 'tts'
  if (typeStr.startsWith('CLIENT_PTZ')) return 'ptz'
  if (typeStr === 'WEB_WEBHOOK' || typeStr === 'SYS_HTTP_CALLBACK') return 'webhook'
  if (typeStr === 'SYS_MQTT_PUBLISH') return 'mqtt'
  if (typeStr === 'CLIENT_TV_WALL') return 'tvwall'
  if (typeStr === 'CLIENT_CAPTURE_IMAGE' || typeStr === 'WEB_CAPTURE_IMAGE') return 'capture'
  if (typeStr === 'SYS_MODBUS_WRITE') return 'modbus'
  return 'generic'
}

function getActionLabel(typeStr: string): string {
  for (const g of clientActionGroups)
    for (const a of g.items)
      if (a.type === typeStr) return a.label
  for (const g of webActionGroups)
    for (const a of g.items)
      if (a.type === typeStr) return a.label
  for (const a of [...appActions, ...mpActions, ...sysActions])
    if (a.type === typeStr) return a.label
  return typeStr
}

// ── 数据加载 ──

async function fetchRules() {
  loading.value = true
  try {
    // [FIX 2026-08-31] 改用全量端点 /linkage/rules/all。
    //   原先 getRules({page_size:500}) 被后端钳制为 100（RestApiHandlers
    //   `if (page_size > 100) page_size = 100`），设备实测 157 条规则时
    //   前 100 条之外的规则在列表页不可见也无法禁用，用户"全部停用"
    //   后弹窗依旧（溢出的 30 条启用规则仍在匹配告警）。/all 无分页钳
    //   制，与页面无分页表格的展示形态一致。
    const res = await linkageApi.getAllRules()
    const d = (res.data as any)?.data ?? res.data
    rules.value = d?.items ?? (Array.isArray(d) ? d : [])
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '获取联动规则失败'
    ElMessage.error(msg)
  } finally { loading.value = false }
}

async function toggleRule(rule: LinkageRule) {
  try {
    await linkageApi.updateRule(rule.id, { enabled: rule.enabled })
    ElMessage.success(rule.enabled ? '已启用' : '已停用')
  } catch (e: any) {
    rule.enabled = !rule.enabled
    const msg = e?.response?.data?.message || '操作失败'
    ElMessage.error(msg)
  }
}

// ── 编辑器: 打开/恢复 ──

function openEditor(rule: LinkageRule | null) {
  editingRule.value = rule
  form.name = rule?.name || ''
  form.description = rule?.description || ''
  form.priority = rule?.priority ?? 50
  form.cooldownMs = rule?.cooldown_ms ?? 5000
  form.enabled = rule?.enabled ?? true
  form.tags = rule?.tags ? [...rule.tags] : []
  // [FIX P1-1] 恢复冲突处理字段
  form.mutexGroup = rule?.mutex_group || ''
  form.suppressAfterRule = rule?.suppress_after_rule || ''
  form.suppressLowerPriority = !!rule?.suppress_lower_priority
  form.enableVlmVerify = !!rule?.enable_vlm_verify
  // [P2-1] 恢复治理字段: 关闭条件/响应时限
  form.closeCondition = rule?.close_condition || ''
  form.responseDeadlineS = rule?.response_deadline_s ?? 0
  advancedCollapse.value = (form.mutexGroup || form.suppressAfterRule || form.suppressLowerPriority || form.enableVlmVerify || form.closeCondition || form.responseDeadlineS > 0) ? ['advanced'] : []
  // 恢复条件树
  if (rule?.condition_tree) {
    advancedConditionMode.value = true
    conditionTreeValue.value = rule.condition_tree
  } else {
    advancedConditionMode.value = false
    conditionTreeValue.value = undefined
  }

  // 恢复条件: 后端格式 → 内部 6 条件表单
  const defaults = defaultConditions()
  if (rule) {
    // time_cond → time
    const tc = rule.time_cond || {} as any
    form.conditions.time = {
      enabled: !!(tc.time_start || tc.time_end || tc.weekdays?.length || tc.monthdays?.length),
      config: { startTime: tc.time_start || '08:00', endTime: tc.time_end || '20:00', weekdays: tc.weekdays || [1, 2, 3, 4, 5], monthdays: tc.monthdays || [] },
    }
    // spatial_cond → region + location
    const sc = rule.spatial_cond || {} as any
    const hasSpatial = !!(sc.region_id || sc.location_id || sc.device_group_id || sc.roi_polygon?.length || sc.tripwire_id || sc.direction)
    form.conditions.region = {
      enabled: hasSpatial,
      // [FIX 2026-08-27 P0-PERIMETER v3] tripwire + direction 从后端读出
      config: { location: sc.location_id || '', roi: sc.region_id || '', group: sc.device_group_id || '', roiPolygon: [] as RoiData[], channelId: '', tripwireId: sc.tripwire_id || '', direction: sc.direction || '' },
    }
    form.conditions.location = {
      enabled: !!sc.location_id,
      config: { point: sc.location_id || '' },
    }
    // source_cond → eventType + eventSource
    const src = rule.source_cond || {} as any
    form.conditions.eventType = {
      enabled: true,
      config: {
        types: src.algorithm_ids?.length ? src.algorithm_ids : (src.event_types || []),
        minSeverity: src.min_severity ?? 3,
        // 后端 GET 时已将小数乘以 100 转成百分比,这里直接 round 即可,不要重复 * 100
        minConfidence: Math.round(src.min_confidence ?? 50),
      },
    }
    form.conditions.eventSource = {
      enabled: !!(src.channel_ids?.length || src.device_ids?.length),
      // [FIX 2026-08-28 双形态归一] device_ids 可能同时存主形态(不带 _ch0)与
      // 子码流形态(带 _ch0) — 同一通道只回填一个勾选值(带后缀优先,
      // 与通道选项 value 形态一致), 保存时再展开双形态。
      config: { channels: dedupeChannelForms([...(src.channel_ids || []).map(String), ...(src.device_ids || [])]) },
    }
    // merge_cond → autoMerge
    const mc = rule.merge_cond || {} as any
    form.conditions.autoMerge = {
      enabled: !!mc.enabled,
      config: { windowMs: mc.window_ms || 10000, maxCount: mc.max_merge_count || 10, dimension: mc.merge_by || 'channel' },
    }
  } else {
    form.conditions = defaultConditions()
  }

  // 恢复动作: 后端格式 → actionState + actionParams
  // Legacy 简化编号兼容 (模板库旧编号 1-10 → 标准 100+)
  const legacyActionMap: Record<number, number> = {
    1: 115, 2: 122, 3: 123, 4: 111, 5: 114,
    6: 105, 7: 104, 8: 203, 9: 200, 10: 202,
  }
  Object.keys(actionState).forEach(k => delete actionState[k])
  Object.keys(actionParams).forEach(k => delete actionParams[k])
  if (rule?.actions) {
    for (const a of rule.actions) {
      const normalizedType = legacyActionMap[a.type] ?? a.type
      const typeStr = ACTION_TYPE_REVERSE_MAP[normalizedType]
      if (typeStr) {
        actionState[typeStr] = a.enabled
        const { type: _t, target: _tg, name: _n, enabled: _e, ...rest } = a
        actionParams[typeStr] = rest || {}
      }
    }
  }

  drawerVisible.value = true
}

// ── 编辑器: 保存 (内部表单 → 后端格式) ──

async function handleSave() {
  // 表单验证
  if (!form.name.trim()) { ElMessage.warning('请输入规则名称'); return }
  if (form.priority < 1 || form.priority > 100) { ElMessage.warning('优先级范围 1-100'); return }
  if (form.cooldownMs < 1000) { ElMessage.warning('冷却时间最小 1000ms'); return }

  const enabledActions = Object.entries(actionState).filter(([, v]) => v)
  if (enabledActions.length === 0) { ElMessage.warning('请至少选择一个联动动作'); return }

  // [v7.9 FIX BUG-3] 事件类型为空时提醒用户规则将匹配所有事件 (通配模式)
  if (form.conditions.eventType.config.types.length === 0) {
    try {
      await ElMessageBox.confirm(
        '未选择任何事件类型，此规则将匹配【所有事件】（通配模式）。\n是否继续？',
        '通配规则确认',
        { confirmButtonText: '继续保存', cancelButtonText: '返回选择事件', type: 'warning' }
      )
    } catch { return }
  }

  saving.value = true
  try {
    // 构建 conditions: 内部 6 条件 → 后端 4 条件
    const tc = form.conditions.time
    const time_cond = tc.enabled ? {
      time_start: tc.config.startTime,
      time_end: tc.config.endTime,
      weekdays: tc.config.weekdays,
      monthdays: tc.config.monthdays || [],
    } : { time_start: '', time_end: '', weekdays: [] as number[], monthdays: [] as number[] }

    const rc = form.conditions.region
    const lc = form.conditions.location
    // [FIX 2026-08-28] 画板绊线 → 自动创建到算法绊线库 (双镜像) 并关联本规则;
    //   仅当未通过下拉显式选择绊线时才创建 (显式选择优先)。
    let effectiveTripwireId = rc.config.tripwireId || ''
    const drawnTripwires = rc.config.roiPolygon.filter(r => r.roi_type === 'tripwire')
    if (drawnTripwires.length > 0 && !effectiveTripwireId) {
      const chStr = (rc.config.channelId || '').replace(/_ch\d+$/, '')
      if (!chStr) {
        ElMessage.warning('画了绊线但未选"关联通道", 绊线未创建; 请选择通道后重新保存')
      } else {
        const p = drawnTripwires[0].polygon || []
        if (p.length >= 4) {
          try {
            const newId = await regionApi.createTripwireWithMirror({
              channel_id: 0,
              channel_id_str: chStr,
              algo_id: 'shield.algo.perimeter.tripwire',
              name: `${form.name || '规则'}_绊线`,
              point_a: [p[0], p[1]],
              point_b: [p[2], p[3]],
              direction: 'both',
              enabled: true,
            })
            effectiveTripwireId = String(newId)
            tripwireOptions.value = []  // 失效缓存, 下次 focus 重新加载
            ElMessage.success('绊线已创建并关联到本规则 (插件最多 5 分钟自动加载)')
          } catch (e: any) {
            ElMessage.error(`绊线创建失败: ${e?.message ?? e} (规则仍会保存, 绊线条件未生效)`)
          }
        }
      }
    }
    // 清理 "全部XXX" 占位值，后端空字符串 = 不过滤
    const cleanLocation = (v: string) => (v && v.startsWith('全部') ? '' : v)
    const cleanGroup = (v: string) => (v && v.startsWith('全部') ? '' : v)
    const spatial_cond = (rc.enabled || lc.enabled) ? {
      region_id: cleanLocation(rc.config.roi || ''),
      location_id: cleanLocation(lc.enabled ? (lc.config.point || rc.config.location) : (rc.config.location || '')),
      device_group_id: cleanGroup(rc.config.group || ''),
      // 绊线类型的 2 点数据不进 roi_polygon (后端仅做 pointInPolygon, 线段永远不含点)
      roi_polygon: rc.config.roiPolygon.filter(r => r.roi_type !== 'tripwire').flatMap((r: RoiData) => r.polygon) || [] as number[],
      // [FIX 2026-08-27 P0-PERIMETER v3] tripwire 越界联动
      //   tripwireId 与 direction 都空 = 不启用 tripwire 过滤
      //   否则仅匹配的 tripwire + direction 才触发动作
      tripwire_id: effectiveTripwireId || '',
      direction: rc.config.direction || '',
    } : { region_id: '', location_id: '', device_group_id: '', roi_polygon: [] as number[], tripwire_id: '', direction: '' }

    const etc = form.conditions.eventType
    const esc = form.conditions.eventSource
    // 提取 alarm type (从算法 ID 最后一部分)
    const event_types = etc.config.types.map(id => { const p = id.split('.'); return p[p.length - 1] || id })
    // 通道分类: 小整数 ID → channel_ids (int32), 字符串 ID → device_ids
    // [FIX 2026-08-28 双形态存储] GB28181 通道有主码流(不带 _ch0)/子码流(带 _ch0)
    //   双实例, 告警的 channel_id_str 两种形态都可能出现; 后端 device_ids 是
    //   精确比对 → 规则同时存两种形态, 任一实例的告警都能命中。
    const numericChannels: number[] = []
    const stringChannels: string[] = []
    for (const c of esc.config.channels) {
      const n = parseInt(c, 10)
      if (!isNaN(n) && String(n) === c.trim()) numericChannels.push(n)
      else {
        const base = c.replace(/_ch\d+$/, '')
        stringChannels.push(base)
        if (base !== c && !stringChannels.includes(c)) stringChannels.push(c)
      }
    }
    const source_cond = {
      channel_ids: numericChannels,
      device_ids: stringChannels,
      event_types,
      min_severity: etc.config.minSeverity,
      min_confidence: etc.config.minConfidence / 100,
      algorithm_ids: etc.config.types,
    }

    const mc = form.conditions.autoMerge
    const merge_cond = mc.enabled ? {
      enabled: true,
      window_ms: mc.config.windowMs,
      max_merge_count: mc.config.maxCount,
      merge_by: mc.config.dimension,
    } : { enabled: false, window_ms: 10000, max_merge_count: 10, merge_by: 'channel' }

    // 构建 actions: actionState + actionParams → 后端 LinkageAction[]
    const actions: LinkageAction[] = enabledActions.map(([typeStr]) => {
      const params = actionParams[typeStr] || {}
      return {
        type: ACTION_TYPE_MAP[typeStr] || 0,
        target: getTargetForActionType(typeStr),
        name: getActionLabel(typeStr),
        enabled: true,
        channel_id: params.channel_id || '',
        device_id: params.device_id || '',
        delay_ms: params.delay_ms || 0,
        // 按类别保留专用字段
        ...(params.tts_text !== undefined ? { tts_text: params.tts_text } : {}),
        ...(params.tts_repeat !== undefined ? { tts_repeat: params.tts_repeat } : {}),
        ...(params.preset_id_start !== undefined ? { preset_id_start: params.preset_id_start } : {}),
        ...(params.preset_id_end !== undefined ? { preset_id_end: params.preset_id_end } : {}),
        ...(params.cruise_path_id !== undefined ? { cruise_path_id: params.cruise_path_id } : {}),
        ...(params.callback_url !== undefined ? { callback_url: params.callback_url } : {}),
        ...(params.callback_method !== undefined ? { callback_method: params.callback_method } : {}),
        ...(params.mqtt_topic !== undefined ? { mqtt_topic: params.mqtt_topic } : {}),
        ...(params.mqtt_payload !== undefined ? { mqtt_payload: params.mqtt_payload } : {}),
        ...(params.tv_wall_id !== undefined ? { tv_wall_id: params.tv_wall_id } : {}),
        ...(params.tv_wall_duration_s !== undefined ? { tv_wall_duration_s: params.tv_wall_duration_s } : {}),
        ...(params.capture_interval_s !== undefined ? { capture_interval_s: params.capture_interval_s } : {}),
        ...(params.capture_count !== undefined ? { capture_count: params.capture_count } : {}),
        ...(params.modbus_host !== undefined ? { modbus_host: params.modbus_host } : {}),
        ...(params.modbus_port !== undefined ? { modbus_port: params.modbus_port } : {}),
        ...(params.modbus_register !== undefined ? { modbus_register: params.modbus_register } : {}),
        ...(params.modbus_value !== undefined ? { modbus_value: params.modbus_value } : {}),
        ...(params.extra ? { params: params.extra } : {}),
      } as LinkageAction
    })

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      priority: form.priority,
      cooldown_ms: form.cooldownMs,
      enabled: form.enabled,
      tags: form.tags,
      // [FIX P1-1] 冲突处理字段提交
      mutex_group: form.mutexGroup || '',
      suppress_after_rule: form.suppressAfterRule || '',
      suppress_lower_priority: form.suppressLowerPriority,
      enable_vlm_verify: form.enableVlmVerify,
      // [P2-1] 治理字段提交: 关闭条件/响应时限
      close_condition: form.closeCondition || '',
      response_deadline_s: form.responseDeadlineS ?? 0,
      ...(advancedConditionMode.value && conditionTreeValue.value ? { condition_tree: conditionTreeValue.value } : {}),
      time_cond,
      spatial_cond,
      source_cond,
      merge_cond,
      actions,
    }

    if (editingRule.value) {
      await linkageApi.updateRule(editingRule.value.id, payload)
    } else {
      // 新建时生成 UUID
      const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      await linkageApi.createRule({ id, ...payload })
    }
    ElMessage.success(editingRule.value ? '规则已更新' : '规则已创建')
    drawerVisible.value = false
    fetchRules()
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '保存失败'
    ElMessage.error(msg)
  } finally { saving.value = false }
}

// ── Dry-Run 模拟测试 ──

async function handleDryRun() {
  if (!editingRule.value) { ElMessage.warning('请先保存规则后再进行模拟测试'); return }
  dryRunLoading.value = true
  try {
    const res = await linkageApi.dryRun({
      rule_id: editingRule.value.id,
      alarm_type: (form.conditions.eventType.config.types[0] as string) || 'intrusion',
      channel_id: parseInt(form.conditions.eventSource.config.channels[0]) || 1,
      severity: form.conditions.eventType.config.minSeverity,
      // 使用表单设置的置信度 + 5% 作为模拟值，确保高于阈值
      confidence: Math.min((form.conditions.eventType.config.minConfidence + 5) / 100, 1.0),
      region_id: form.conditions.region.config.roi || '',
      location_id: form.conditions.region.config.location || '',
    })
    const data = (res as any)?.data?.data ?? (res as any)?.data ?? res
    dryRunResult.value = data
    showDryRunDialog.value = true
  } catch (e: any) {
    ElMessage.error('模拟测试失败: ' + (e?.message || '未知错误'))
  } finally { dryRunLoading.value = false }
}

// ── 模板库 ──

// [P2-1] 关闭条件显示名映射
const CLOSE_CONDITION_LABELS: Record<string, string> = {
  manual: '人工关闭',
  auto_event_close: '事件自动关闭',
  timeout: '超时自动关闭',
}
function closeConditionLabel(v: string): string {
  return CLOSE_CONDITION_LABELS[v] || v
}

async function openTemplateLibrary() {
  showTemplateDialog.value = true
  templateLoading.value = true
  loadEventCoverage() // 预加载事件可测性矩阵
  try {
    const res = await linkageApi.getRuleTemplates()
    templateList.value = unwrapRuleTemplates((res as any)?.data?.data)
  } catch {
    templateList.value = []
  } finally { templateLoading.value = false }
}

async function applyTemplate(tmpl: any) {
  try {
    const tplId = tmpl.template_id || tmpl.id
    if (!tplId) {
      ElMessage.error('模板ID缺失，无法应用')
      return
    }
    await ElMessageBox.confirm(`确定从模板「${tmpl.name}」创建新规则?`, '应用模板', { type: 'info' })
    const res = await linkageApi.applyRuleTemplate(tplId, tmpl.name)
    ElMessage.success('规则已从模板创建')
    showTemplateDialog.value = false
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('应用模板失败: ' + (e?.message || ''))
  }
}

// ── 删除 ──

async function handleDelete(row: LinkageRule) {
  try {
    await ElMessageBox.confirm(`确定删除规则「${row.name}」?`, '删除确认', { type: 'warning' })
    await linkageApi.deleteRule(row.id)
    ElMessage.success('已删除')
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') {
      const msg = e?.response?.data?.message || '删除失败'
      ElMessage.error(msg)
    }
  }
}

// ── 动作参数弹窗 ──

function onActionToggle(type: string) {
  if (actionState[type] && !actionParams[type]) actionParams[type] = {}
}

const paramNeedsChannel = computed(() => {
  const t = currentParamAction.value
  return !['WEB_WEBHOOK', 'SYS_HTTP_CALLBACK', 'SYS_MQTT_PUBLISH', 'SYS_MODBUS_WRITE', 'WEB_POPUP', 'WEB_DASHBOARD_ALERT', 'WEB_EMAIL', 'WEB_PLAY_TONE', 'WEB_TTS_BROADCAST', 'WEB_SEND_SMS', 'WEB_SHOW_IMAGE'].includes(t)
})

function openActionParams(act: any) {
  currentParamAction.value = act.type
  paramDialogTitle.value = `${act.label} - 参数配置`
  paramActionCategory.value = getParamCategory(act.type)

  const p = actionParams[act.type] || {}
  paramForm.channel_id = p.channel_id || ''
  paramForm.device_id = p.device_id || ''
  paramForm.delay_ms = p.delay_ms || 0
  paramForm.repeat_count = p.repeat_count || 1
  paramForm.repeat_interval_ms = p.repeat_interval_ms || 0
  paramForm.tts_text = p.tts_text || ''
  paramForm.tts_repeat = p.tts_repeat || 1
  paramForm.preset_id_start = p.preset_id_start || ''
  paramForm.preset_id_end = p.preset_id_end || ''
  paramForm.cruise_path_id = p.cruise_path_id || ''
  paramForm.callback_url = p.callback_url || ''
  paramForm.callback_method = p.callback_method || 'POST'
  paramForm.mqtt_topic = p.mqtt_topic || ''
  paramForm.mqtt_payload = p.mqtt_payload || ''
  paramForm.tv_wall_id = p.tv_wall_id || ''
  paramForm.tv_wall_duration_s = p.tv_wall_duration_s || 30
  paramForm.capture_interval_s = p.capture_interval_s || 2
  paramForm.capture_count = p.capture_count || 3
  paramForm.modbus_host = p.modbus_host || ''
  paramForm.modbus_port = p.modbus_port || 502
  paramForm.modbus_register = p.modbus_register || 0
  paramForm.modbus_value = p.modbus_value || 1
  paramForm.extra = ''
  // 如果有 params 对象 (generic extra), 显示为 JSON
  if (p.params && typeof p.params === 'object') {
    paramForm.extra = JSON.stringify(p.params, null, 2)
  }

  paramDialogVisible.value = true
}

function saveActionParams() {
  const category = paramActionCategory.value
  const typeStr = currentParamAction.value

  // 按类别验证
  if (category === 'tts' && !paramForm.tts_text.trim()) {
    ElMessage.warning('请输入播报文本'); return
  }
  if (category === 'webhook' && !paramForm.callback_url.trim()) {
    ElMessage.warning('请输入回调URL'); return
  }
  if (category === 'mqtt' && !paramForm.mqtt_topic.trim()) {
    ElMessage.warning('请输入MQTT主题'); return
  }
  if (category === 'modbus' && !paramForm.modbus_host.trim()) {
    ElMessage.warning('请输入设备地址'); return
  }

  // 构建参数对象
  const params: Record<string, any> = {
    channel_id: paramForm.channel_id,
    device_id: paramForm.device_id,
    delay_ms: paramForm.delay_ms,
    repeat_count: paramForm.repeat_count,
    repeat_interval_ms: paramForm.repeat_interval_ms,
  }

  if (category === 'tts') {
    params.tts_text = paramForm.tts_text
    params.tts_repeat = paramForm.tts_repeat
  } else if (category === 'ptz') {
    params.preset_id_start = paramForm.preset_id_start
    params.preset_id_end = paramForm.preset_id_end
    params.cruise_path_id = paramForm.cruise_path_id
  } else if (category === 'webhook') {
    params.callback_url = paramForm.callback_url
    params.callback_method = paramForm.callback_method
  } else if (category === 'mqtt') {
    params.mqtt_topic = paramForm.mqtt_topic
    params.mqtt_payload = paramForm.mqtt_payload
  } else if (category === 'tvwall') {
    params.tv_wall_id = paramForm.tv_wall_id
    params.tv_wall_duration_s = paramForm.tv_wall_duration_s
  } else if (category === 'capture') {
    params.capture_interval_s = paramForm.capture_interval_s
    params.capture_count = paramForm.capture_count
  } else if (category === 'modbus') {
    params.modbus_host = paramForm.modbus_host
    params.modbus_port = paramForm.modbus_port
    params.modbus_register = paramForm.modbus_register
    params.modbus_value = paramForm.modbus_value
  } else {
    // 通用: 解析 JSON extra
    if (paramForm.extra.trim()) {
      try { params.extra = JSON.parse(paramForm.extra) }
      catch { ElMessage.warning('JSON 格式不正确'); return }
    }
  }

  actionParams[typeStr] = params
  paramDialogVisible.value = false
}

// ── 批量操作 ──

async function handleBatchToggle(enabled: boolean) {
  if (!selectedRows.value.length) return
  try {
    const ids = selectedRows.value.map(r => r.id)
    const res = await linkageApi.batchToggle(ids, enabled)
    const d = (res.data as any)?.data ?? res.data
    ElMessage.success(`已${enabled ? '启用' : '停用'} ${d?.updated || ids.length} 条规则`)
    selectedRows.value = []
    fetchRules()
  } catch (e: any) {
    const msg = e?.response?.data?.message || '批量操作失败'
    ElMessage.error(msg)
  }
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) return
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedRows.value.length} 条规则?`,
      '批量删除确认',
      { type: 'warning' }
    )
    // [FIX P1-4] 使用后端原子批量删除 API, 避免逐条循环部分失败
    const ids = selectedRows.value.map(r => r.id)
    const res = await linkageApi.batchDelete(ids)
    const deleted = (res as any)?.data?.data?.deleted ?? ids.length
    ElMessage.success(`已删除 ${deleted} 条规则`)
    selectedRows.value = []
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('批量删除失败: ' + (e?.response?.data?.message || e?.message || ''))
  }
}

// ── [FIX P2-3] 归档/恢复 ──

async function handleArchiveRule(row: LinkageRule) {
  try {
    await ElMessageBox.confirm(`归档规则「${row.name}」？归档后不参与触发，可随时恢复。`, '归档确认', { type: 'warning' })
    await linkageApi.archiveRule(row.id, '前端手动归档')
    ElMessage.success('规则已归档')
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('归档失败: ' + (e?.response?.data?.message || e?.message || ''))
  }
}

async function handleRestoreRule(row: LinkageRule) {
  try {
    await linkageApi.restoreRule(row.id)
    ElMessage.success('规则已恢复')
    fetchRules()
  } catch (e: any) {
    ElMessage.error('恢复失败: ' + (e?.response?.data?.message || e?.message || ''))
  }
}

// ── [FIX P1-3] 规则复制 ──

async function handleCloneRule(row: LinkageRule) {
  try {
    await ElMessageBox.confirm(`复制规则「${row.name}」？`, '规则复制', { type: 'info', confirmButtonText: '复制' })
    await linkageApi.cloneRule(row.id, `${row.name} (副本)`)
    ElMessage.success('规则已复制')
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('复制失败: ' + (e?.response?.data?.message || e?.message || ''))
  }
}

// ── [FIX P1-2] 版本历史 ──

const versionHistoryVisible = ref(false)
const versionHistoryLoading = ref(false)
const versionHistoryRule = ref<LinkageRule | null>(null)
const versionHistoryList = ref<Array<{ version: number; name: string; enabled: boolean; priority: number; updated_at: number; created_by: string; version_comment: string }>>([])

async function openVersionHistory(row: LinkageRule) {
  versionHistoryRule.value = row
  versionHistoryVisible.value = true
  versionHistoryLoading.value = true
  try {
    const res = await linkageApi.getRuleHistory(row.id)
    const d = (res as any)?.data?.data ?? (res as any)?.data
    versionHistoryList.value = d?.versions ?? []
  } catch (e: any) {
    ElMessage.error('加载版本历史失败: ' + (e?.message || ''))
    versionHistoryList.value = []
  } finally { versionHistoryLoading.value = false }
}

async function handleRollback(version: number) {
  if (!versionHistoryRule.value) return
  try {
    await ElMessageBox.confirm(`确定回滚「${versionHistoryRule.value.name}」到版本 v${version}？`, '回滚确认', { type: 'warning' })
    await linkageApi.rollbackRule(versionHistoryRule.value.id, version, '前端手动回滚')
    ElMessage.success(`已回滚到 v${version}`)
    versionHistoryVisible.value = false
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('回滚失败: ' + (e?.response?.data?.message || e?.message || ''))
  }
}

// ── P1-7: 规则模板导入导出 ──
const importFileInput = ref<HTMLInputElement>()

async function handleExportTemplates() {
  try {
    const blob = await linkageApi.exportRuleTemplates()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `linkage-templates-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('规则模板已导出')
  } catch {
    ElMessage.error('导出失败')
  }
}

function triggerImportFile() {
  importFileInput.value?.click()
}

async function handleImportTemplates(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      ElMessage.error('导入失败: 文件不是有效的 JSON')
      return
    }
    // [FIX P3-1] 版本兼容性 + 必填字段校验
    const v = validateTemplateImport(data)
    if (v.errors.length > 0) {
      ElMessageBox.alert(v.errors.join('\n'), '导入校验失败', { type: 'error', confirmButtonText: '知道了' })
      return
    }
    const warnSuffix = v.warnings.length > 0 ? `\n\n注意:\n${v.warnings.join('\n')}` : ''
    await ElMessageBox.confirm(
      `确定导入 ${v.templates.length} 个规则模板? (文件版本 v${v.version})${warnSuffix}`,
      '导入确认',
      { type: v.warnings.length > 0 ? 'warning' : 'info', confirmButtonText: '导入', cancelButtonText: '取消' }
    )
    const res = await linkageApi.importRuleTemplates(v.templates)
    const imported = res.data?.data?.imported ?? 0
    ElMessage.success(`成功导入 ${imported} 个模板`)
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('导入失败: ' + (e?.message || '格式错误'))
  } finally {
    input.value = ''
  }
}

// ── 日志 ──

async function fetchLogs() {
  logLoading.value = true
  try {
    const res = await linkageApi.getLogs({ page: logPage.value, pageSize: logPageSize.value })
    const d = (res.data as any)?.data ?? res.data
    logs.value = d?.items ?? (Array.isArray(d) ? d : [])
    logTotal.value = d?.total ?? logs.value.length
  } catch (e: any) {
    const msg = e?.response?.data?.message || '获取日志失败'
    ElMessage.error(msg)
  } finally { logLoading.value = false }
}

// ── 动作执行日志 ──

async function fetchActionLogs() {
  actionLogLoading.value = true
  try {
    const params: Record<string, any> = { page: actionLogPage.value, page_size: actionLogPageSize.value }
    if (actionLogStatusFilter.value) params.status = actionLogStatusFilter.value
    const res = await linkageApi.getActionLog(params)
    const d = (res.data as any)?.data ?? res.data
    actionLogs.value = d?.items ?? (Array.isArray(d) ? d : [])
    actionLogTotal.value = d?.total ?? actionLogs.value.length
  } catch (e: any) {
    console.error('Fetch action logs failed:', e)
  } finally { actionLogLoading.value = false }
}

function actionStatusTagType(status: string) {
  switch (status) {
    case 'success': return 'success' as const
    case 'failed': return 'danger' as const
    case 'timeout': return 'warning' as const
    case 'executing': return 'primary' as const
    case 'pending': return 'info' as const
    default: return 'info' as const
  }
}

async function retryAction(id: number) {
  try {
    await linkageApi.retryAction(id)
    ElMessage.success('重试已提交')
    fetchActionLogs()
  } catch (e: any) {
    ElMessage.error('重试失败: ' + (e?.message || e))
  }
}

// ── 引擎统计 ──

async function fetchEngineStats() {
  statsLoading.value = true
  try {
    const res = await linkageApi.getStats()
    // [FIX] /linkage/stats 返回 data 为数组 [{...}]，需取首元素
    const d = (res.data as any)?.data
    engineStats.value = Array.isArray(d) ? (d[0] ?? {}) : (d ?? {})
  } catch (e: any) {
    console.error('Fetch engine stats failed:', e)
  } finally { statsLoading.value = false }
}

// ── 调试控制台管理 ──

function openDebugConsole() {
  showLogDialog.value = true
}

function onDebugDialogOpen() {
  fetchLogs()
  fetchActionLogs()
  fetchEngineStats()
}

function onDebugDialogClose() {
  debugAutoRefresh.value = false
  stopDebugRefresh()
}

function onAutoRefreshToggle(enabled: boolean) {
  if (enabled) {
    startDebugRefresh()
  } else {
    stopDebugRefresh()
  }
}

function startDebugRefresh() {
  stopDebugRefresh()
  debugRefreshTimer = setInterval(() => {
    if (logActiveTab.value === 'trigger') fetchLogs()
    else if (logActiveTab.value === 'action') fetchActionLogs()
    else if (logActiveTab.value === 'stats') fetchEngineStats()
  }, 5000)
}

function stopDebugRefresh() {
  if (debugRefreshTimer) {
    clearInterval(debugRefreshTimer)
    debugRefreshTimer = null
  }
}

function refreshAllLogs() {
  fetchLogs()
  fetchActionLogs()
  fetchEngineStats()
}

// ── 时段模板 ──

function applyTimeTemplate(tmpl: TimeTemplate) {
  form.conditions.time.enabled = true
  form.conditions.time.config.startTime = tmpl.time_start || '08:00'
  form.conditions.time.config.endTime = tmpl.time_end || '20:00'
  form.conditions.time.config.weekdays = [...(tmpl.weekdays || [1, 2, 3, 4, 5])]
  form.conditions.time.config.monthdays = [...(tmpl.monthdays || [])]
  showTimeTemplateDialog.value = false
  ElMessage.success('已应用时段模板: ' + tmpl.name)
}

onMounted(() => {
  // [校园二期 2026-08-30] 场景包 goRules 跳转预填 tag 过滤 (?tag=scene_pack)
  const qTag = useRoute().query.tag
  if (qTag) tagFilter.value = [String(qTag)]
  fetchRules(); fetchOptions()
  if (mainTab.value === 'plans') fetchPlans()
  if (mainTab.value === 'cep') fetchCEPPatterns()
})

onUnmounted(() => {
  stopDebugRefresh()
})

// ── 主页面 Tab ──
const mainTab = ref('rules')

// ── 预案管理 ──
const plans = ref<LinkagePlan[]>([])
const plansLoading = ref(false)
const planEditorVisible = ref(false)
const editingPlan = ref<LinkagePlan | null>(null)

async function fetchPlans() {
  plansLoading.value = true
  try {
    const res = await linkageApi.getPlans()
    plans.value = (res.data as any) || []
  } catch (e) { console.error('Fetch plans failed:', e) }
  finally { plansLoading.value = false }
}

function openPlanEditor(plan: LinkagePlan | null) {
  editingPlan.value = plan
  planEditorVisible.value = true
}

async function handleActivatePlan(planId: string) {
  try {
    await linkageApi.activatePlan(planId)
    ElMessage.success('预案已激活')
    fetchPlans()
  } catch (e: any) { ElMessage.error('激活失败: ' + (e.message || e)) }
}

async function handleDeactivatePlan(planId: string) {
  try {
    await linkageApi.deactivatePlan(planId)
    ElMessage.success('预案已停用')
    fetchPlans()
  } catch (e: any) { ElMessage.error('停用失败: ' + (e.message || e)) }
}

async function handleDeletePlan(planId: string) {
  try {
    await linkageApi.deletePlan(planId)
    ElMessage.success('预案已删除')
    fetchPlans()
  } catch (e: any) { ElMessage.error('删除失败: ' + (e.message || e)) }
}

// ── CEP 模式管理 ──
const cepPatterns = ref<CEPPattern[]>([])
const cepLoading = ref(false)
const cepEditorVisible = ref(false)
const editingCEP = ref<CEPPattern | null>(null)
const cepStats = ref<{ total_events_in: number; total_patterns_matched: number; total_composite_events: number } | null>(null)

const OP_LABELS: Record<number, string> = { 0: 'SEQUENCE', 1: 'AND', 2: 'OR', 3: 'NOT', 4: 'COUNT', 5: 'ABSENCE' }
function opLabel(op: number): string { return OP_LABELS[op] || 'AND' }

async function fetchCEPPatterns() {
  cepLoading.value = true
  try {
    const res = await linkageApi.getCEPPatterns()
    const data = res.data as any
    cepPatterns.value = data?.items || []
    cepStats.value = data ? {
      total_events_in: data.total_events_in || 0,
      total_patterns_matched: data.total_patterns_matched || 0,
      total_composite_events: data.total_composite_events || 0,
    } : null
  } catch (e) { console.error('Fetch CEP patterns failed:', e) }
  finally { cepLoading.value = false }
}

function openCEPEditor(pattern: CEPPattern | null) {
  editingCEP.value = pattern
  cepEditorVisible.value = true
}

async function handleDeleteCEP(patternId: string) {
  try {
    await linkageApi.deleteCEPPattern(patternId)
    ElMessage.success('CEP模式已删除')
    fetchCEPPatterns()
  } catch (e: any) { ElMessage.error('删除失败: ' + (e.message || e)) }
}

// 切换主Tab时自动加载数据
watch(mainTab, (tab) => {
  if (tab === 'plans' && plans.value.length === 0) fetchPlans()
  if (tab === 'cep' && cepPatterns.value.length === 0) fetchCEPPatterns()
})
</script>

<style scoped>
/* ── 页面容器 ── */
.linkage-page {
  /* padding: 20px 24px; */
  /* max-width: var(--content-max-width, 1440px); */
  /* margin: 0 auto; */
  animation: fadeIn 0.3s ease;
  
}

/* ── 主页面 Tabs ── */
.main-tabs :deep(.el-tabs__content) { padding: 16px 0 0 0; overflow: visible; }
.main-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.main-tabs :deep(.el-tabs__nav-wrap::after) { height: 0; }
.tab-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px;margin-left: 8px;margin-right: 8px; }

/* ── 统计卡片 ── */
.stat-row { margin-bottom: 16px; }
.stat-card {
  border-radius: var(--radius-xl, 12px);
  border: 1px solid var(--app-border);
  transition: all 0.2s ease;
}
.stat-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-card-hover); }
.stat-content { display: flex; align-items: center; gap: 14px; }
.stat-icon {
  width: 42px; height: 42px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.stat-body { display: flex; flex-direction: column; }
.stat-value { font-size: 24px; font-weight: 700; font-family: var(--font-number); line-height: 1; }
.stat-label { font-size: 12px; color: var(--app-text-secondary); margin-top: 2px; }

/* ── 工具栏 ── */
.toolbar-card { border-radius: var(--radius-lg, 8px); margin-bottom: 12px; }
.toolbar-card :deep(.el-card__body) { padding: 12px 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.toolbar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toolbar-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

/* ── 列表卡片 ── */
.list-card { border-radius: var(--radius-lg, 8px); }
.list-card :deep(.el-card__body) { padding: 0; }

/* ── 规则名称 ── */
/* [FIX 2026-08-27 v5] 完全放弃 flex, 用最简单 inline-block ellipsis.
   show-overflow-tooltip 在 prop 列上自带完整文本 hover 提示, 不需要抹平中部所有样式. */
.rule-name {
  font-weight: 600;
  display: inline-block;
  max-width: 100%;
  vertical-align: middle;
  /* 关键: 覆盖 Element Plus .cell 的 overflow-wrap: break-word */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: normal;
  word-break: keep-all;
}
.priority-tag { font-family: var(--font-mono); font-size: 11px; }
.cell-tags { display: flex; flex-wrap: wrap; gap: 4px; }

/* ── 条件标签 ── */
.condition-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.cond-tag { font-size: 11px; }
.action-count { font-size: 13px; color: var(--app-text-secondary); }

/* [P2-LR2] 冲突详情样式 */
.conflict-item { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.conflict-msg { margin-left: 8px; font-size: 13px; }
.conflict-suggestion { margin-top: 4px; margin-left: 8px; font-size: 12px; color: var(--app-text-secondary, #aaa); }

/* [P3-LR3] 规则统计样式 */
.stat-good { color: #67c23a; font-weight: 600; }
.stat-bad { color: #f56c6c; font-weight: 600; }
.stat-warn { color: #e6a23c; font-weight: 600; }

/* ── 时间文本 ── */
.time-text { font-family: var(--font-mono); font-size: 13px; color: var(--app-text-secondary); }

/* ── 分页 ── */
.pagination-wrap { padding: 16px; display: flex; justify-content: flex-end; }

/* ── 抽屉编辑器 ── */
.editor-body { padding-right: 8px; }

/* ── 条件卡片 ── */
.condition-card {
  background: var(--app-surface-hover);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-lg, 8px);
  margin-bottom: 8px;
  overflow: hidden;
}
.cond-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; cursor: pointer;
}
.cond-header:hover { background: rgba(255,255,255,0.02); }
.cond-title { display: flex; align-items: center; gap: 8px; }
.cond-icon { font-size: 14px; }
.cond-label { font-size: 13px; font-weight: 600; }
.cond-body { padding: 8px 12px 12px; border-top: 1px solid var(--app-border); }
.cond-form-item { margin-bottom: 8px; }
.cond-hint { font-size: 12px; color: var(--app-text-secondary); margin-bottom: 6px; }
.is-rotated { transform: rotate(180deg); }

/* ── 星期/事件/通道网格 ── */
.weekdays { margin-top: 8px; }
.monthdays { margin-top: 8px; }
.cond-sub-label { font-size: 12px; color: var(--app-text-secondary); display: block; margin-bottom: 4px; }
.event-type-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.event-type-group { width: 100%; margin-bottom: 4px; }
.event-type-group__title { font-size: 11px; font-weight: 600; color: var(--color-primary-400, #3B82F6); margin-bottom: 2px; padding: 2px 0; }
.channel-grid { display: flex; flex-wrap: wrap; gap: 4px; }

/* v7.6 严重度颜色标签 (对标海康/大华事件配置) */
.event-type-severity-legend {
  display: flex; gap: 12px; margin-bottom: 8px; padding: 4px 8px;
  background: var(--color-bg-1, #f5f7fa); border-radius: 4px;
}
.legend-item {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; color: var(--color-text-secondary, #909399);
}
.legend-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
}
.severity-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  margin-right: 4px; vertical-align: middle;
}
.event-type-label {
  display: inline-flex; align-items: center;
}

/* ── 动作 Tabs ── */
.action-tabs { margin-top: 4px; }
.action-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }
.action-group { margin-bottom: 8px; }
.action-group-title {
  font-size: 12px; font-weight: 600;
  color: var(--color-primary-400, #3B82F6);
  padding: 4px 0;
}
.action-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 0; height: 30px;
}

/* ── 抽屉底部 ── */
.drawer-footer { display: flex; justify-content: flex-end; gap: 12px; }

/* ── 辅助 ── */
.text-center { text-align: center; }
.text-secondary { color: var(--app-text-secondary); font-size: 13px; }

/* ── 调试控制台统计卡片 ── */
.debug-stat { text-align: center; }
.debug-stat-val { font-size: 28px; font-weight: 700; line-height: 1.2; }
.debug-stat-label { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
