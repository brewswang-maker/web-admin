<template>
  <div class="linkage-page">
    <!-- [SCENE-EDIT-INPLACE 2026-09-03] 嵌入编辑模式 (embedEditRuleId): 场景页/算法页
         就地渲染本组件编辑规则 — 列表外壳 (tabs) CSS 隐藏, 仅呈现编辑抽屉链
         (choice → vp6 全功能表单), 编辑器单一来源, 宿主页不跳转 /linkage。
         注: 编辑链 DOM (vp6 抽屉/SimpleRuleDrawer/paramDialog) 嵌于外壳内部,
         不能用 v-if 卸载外壳 (会连编辑链一起卸载), 故 display:none + 抽屉
         append-to-body 脱离隐藏祖先 -->
    <!-- ===== 主页面 Tabs ===== -->
    <el-tabs v-show="!embedMode" v-model="mainTab" type="border-card" class="main-tabs">
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
          <!-- [vp8 双模式 / REVERT 2026-09-02] 新建默认开选择抽屉 (模板/高级两入口,
               'custom' 高频字段子表单已移除); 高级新建/模板库走下拉 -->
          <el-dropdown split-button type="primary" class="new-rule-split" @click="openNewRuleDrawer" @command="onNewCommand">
            <span class="new-rule-label"><el-icon><Plus /></el-icon>新建规则</span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="simple">简易创建（推荐）</el-dropdown-item>
                <el-dropdown-item command="advanced">高级新建（专业模式）</el-dropdown-item>
                <el-dropdown-item command="template" divided>从模板库创建</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
        <el-table-column prop="enabled" label="状态" width="60" align="center">
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
        <el-table-column label="标签" min-width="200">
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
        <!-- [FLOOR-MAP 2026-09-03] 适用地图列: source_cond.map_ids → 地图名 el-tag;
             空显示 "-"; 纯可视化绑定不参与触发匹配 -->
        <el-table-column label="适用地图" min-width="140">
          <template #default="{ row }">
            <div class="condition-tags">
              <el-tag
                v-for="mid in (row.source_cond?.map_ids || [])"
                :key="mid"
                size="small"
                type="success"
                effect="plain"
                class="cond-tag"
              >{{ mapNameById(mid) }}</el-tag>
              <span v-if="!(row.source_cond?.map_ids || []).length" class="text-secondary">-</span>
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
            <!-- [SIMPLE-EDIT 2026-09-03] 行内编辑改走简易抽屉 (高频字段一键编辑);
                 完整 VLM/互斥/抑制/动作编排到「高级模式新建」或模拟调试入口 -->
            <el-button size="small" type="primary" link @click="openSimpleEdit(row)">编辑</el-button>
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

    <!-- ===== 规则编辑抽屉 ===== (append-to-body: 嵌入模式下外壳 display:none,
         抽屉须 teleport 到 body 才可见 — [SCENE-EDIT-INPLACE]) -->
    <el-drawer v-model="drawerVisible" :title="editingRule ? '编辑联动规则' : '新建联动规则'" size="520px" direction="rtl" :close-on-click-modal="false" destroy-on-close append-to-body>
      <div class="editor-body">
        <el-form :model="form" label-position="top" size="default" :rules="formRules" ref="formRef">
          <!-- [vp7 向导 2026-09-01] 双形态切换: el-steps 分步向导 / 全览 (原单页表单)
               [vp6-SIMPLE 2026-09-02] 简易模式入口 = vp6 纯净表单: 无向导条无 AI 增强无确认预览 -->
          <div v-if="!simpleEntryMode" class="wizard-bar">
            <el-steps :active="wizardStep" simple style="flex: 1; min-width: 0">
              <el-step v-for="(s, i) in WIZARD_STEPS" :key="s" :title="s" style="cursor: pointer" @click="wizardStep = i" />
            </el-steps>
            <el-switch v-model="wizardMode" active-text="分步" inactive-text="全览" size="small" style="flex-shrink: 0" />
          </div>

          <div v-show="sectionVisible(0)">
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
                <!-- [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭秒 (新建/编辑都可见):
                     0 = 永不自动关闭 (推荐, 对齐海康 iVMS / 大华 DSS 报警弹窗常驻语义);
                     >0 = 打开 N 秒后自动关闭 (低优先级告警降噪场景)。
                     仅作用于 WS 命中本规则的弹窗, 详情入口弹窗不受此控制。 -->
                <el-col :span="12">
                  <el-form-item label="弹窗自动关闭(秒)">
                    <el-input-number v-model="form.popupAutoCloseS" :min="0" :max="3600" :step="5" controls-position="right" style="width: 100%" />
                    <span class="text-secondary" style="margin-left: 8px; font-size: 12px">0 = 永不自动关闭</span>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-collapse-item>
          </el-collapse>
          </div>

          <div v-show="sectionVisible(1)">
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
          <div v-for="cond in conditionDefs" :key="cond.type" v-show="condStepVisible(cond.type)" class="condition-card" :class="{ 'is-enabled': form.conditions[cond.type].enabled }">
            <!-- [FIX 2026-09-02] 单开关重构 (对标海康 iVMS/宇视 NVR 联动规则编辑器):
                 ① 去重: 仅保留头部开关 (原 cond-body 顶部 cond-enable-bar 重复开关已删)
                 ② 事件类型 = 必备核心条件, 无开关无折叠箭头, 条件体常显
                 ③ 开关关闭 = 条件体折叠, 开启 = 展开 (off→on 时自动展开) -->
            <div class="cond-header" :class="{ 'is-static': cond.type === 'eventType' }" @click="cond.type !== 'eventType' && toggleCollapse(cond.type)">
              <div class="cond-title">
                <span class="cond-icon">{{ cond.icon }}</span>
                <span class="cond-label">{{ cond.label }}</span>
              </div>
              <div v-if="cond.type !== 'eventType'" class="cond-switch-zone" @click.stop>
                <span class="cond-switch-label">{{ form.conditions[cond.type].enabled ? '已启用' : '已禁用' }}</span>
                <el-switch
                  v-model="form.conditions[cond.type].enabled"
                  size="default"
                  :width="44"
                  inline-prompt
                  active-text="ON"
                  inactive-text="OFF"
                  :active-color="'#67c23a'"
                  :inactive-color="'#dcdfe6'"
                  @change="(v: any) => { if (v) collapsedConditions[cond.type] = false }"
                />
              </div>
              <el-icon v-if="cond.type !== 'eventType'" class="cond-arrow" :class="{ 'is-rotated': condBodyVisible(cond.type) }" @click.stop="toggleCollapse(cond.type)"><ArrowDown /></el-icon>
            </div>

            <!-- 条件体可见性: 事件类型常显; 其他 = 开关启用 且 未手动折叠 -->
            <div v-show="condBodyVisible(cond.type)" class="cond-body">
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
                <!-- [STAGE1 P1-2 2026-09-10] 布防时段 4 模板 chip: 华为 ivm_02_0043
                     口径 (全天候/工作日/周末/工作时间), 点击仅改 draft, 不直接保存;
                     与后端 LinkageEngine 判定逻辑解耦, 不触碰 .cpp 判定代码 -->
                <div class="time-presets">
                  <span class="cond-sub-label">快速模板</span>
                  <div class="time-preset-chips">
                    <el-tooltip v-for="p in TIME_PRESETS" :key="p.id" :content="p.tooltip" placement="top" :show-after="200">
                      <el-tag
                        class="time-preset-chip"
                        :class="{ 'is-active': isTimePresetActive(p) }"
                        effect="plain"
                        round
                        size="small"
                        @click="applyTimePreset(p)"
                      >{{ p.label }}</el-tag>
                    </el-tooltip>
                  </div>
                </div>
                <div class="time-template-actions">
                  <el-button size="small" text @click="showTimeTemplateDialog = true">管理时段模板</el-button>
                </div>
              </template>

              <!-- 空间条件 -->
              <template v-if="cond.type === 'region'">
                <!-- [FEAT guard-badge 2026-09-10] 绑定通道插件层布防状态:
                     规则空间条件(引擎过滤)与算法检测区(插件触发)是两层, 徽标把
                     "插件层未布防"暴露给规则编辑者 — 消灭"规则开好了却永远无
                     告警"的静默空转 (海康/华为智能事件区域必填同理, 不让两层
                     脱节; 对标 AXIS 默认全画面/海康默认警戒面的可见性哲学)。 -->
                <el-form-item v-if="guardStates.length" label="通道布防状态" label-position="top" class="cond-form-item">
                  <div style="width: 100%">
                    <div v-for="st in guardStates" :key="st.channel" style="display:flex; align-items:center; gap:8px; margin-bottom:4px">
                      <span class="text-secondary" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" :title="st.channel">{{ st.label }}</span>
                      <el-tag v-if="st.loading" size="small" type="info">查询中…</el-tag>
                      <el-tag v-else-if="st.error" size="small" type="warning">状态未知</el-tag>
                      <el-tag v-else-if="st.count === 0" size="small" type="danger" effect="dark">未布防</el-tag>
                      <el-tag v-else-if="st.fullscreen" size="small" type="primary">全画面</el-tag>
                      <el-tag v-else size="small" type="success">{{ st.count }} 个布防 (区/线)</el-tag>
                    </div>
                    <el-alert v-if="hasUnguarded" type="warning" :closable="false" style="margin-top:4px">
                      <template #title>
                        标红通道无任何启用的检测区/绊线 — 周界类算法(入侵/攀爬/越界)不会产生告警 (未布防=不触发, 对标海康/大华语义); 可在上方画板点「⛶ 满屏」一键布防后再叠加排除区
                      </template>
                    </el-alert>
                  </div>
                </el-form-item>
                <el-form-item label="物理位置" label-position="top" class="cond-form-item">
                  <!-- [FIX area-cascade-label 2026-09-11] 扁平位置列表 → 「区域 (N 台设备)→设备」
                       树形单选 (对标 ChannelView/LiveView 区域→设备主体范式): 区域节点 value=
                       区域 id (引擎按 resolved 快照展开, 语义与旧下拉一致), 设备节点 value=设备 id
                       (旧设备位置 fallback 语义); 旧版位置实体/老设备 id 不在树中 → legacy
                       disabled 节点只读回显 (同 legacyPointEcho 模式), 不裸显未知 id。
                       保存链不变: spatial_cond.location_id = cleanLocation(config.location)。 -->
                  <el-tree-select
                    v-model="form.conditions.region.config.location"
                    :data="locationTreeData"
                    node-key="value"
                    :props="{ label: 'label', children: 'children' }"
                    check-on-click-node
                    clearable filterable
                    placeholder="选择安保区域或设备"
                    style="width: 100%"
                    @focus="loadDeviceGroups"
                  />
                </el-form-item>
                <el-form-item label="关联通道(快照背景)" label-position="top" class="cond-form-item">
                  <!-- [FIX area-cascade-label 2026-09-11] 池收窄 (症状 2): 区域已选时仅列
                       「区域 resolved 摄像头 ∪ 绑定通道中摄像头」+ 当前值池外 fallback,
                       无关通道不再淹没; label 升级「通道名 (设备名)」 (症状 3) —
                       老规则 20 位串从 sc.location_id 回填时也走目录反查, 不裸显数字 -->
                  <el-select v-model="form.conditions.region.config.channelId" placeholder="选择通道加载快照" clearable filterable style="width: 100%" @change="onRegionChannelChange">
                    <el-option v-for="ch in snapshotChannelOptions" :key="ch.value" :label="ch.label" :value="ch.value" />
                    <template #empty><span class="text-secondary">暂无摄像头通道</span></template>
                  </el-select>
                </el-form-item>
                <el-form-item label="ROI绘制区域" label-position="top" class="cond-form-item">
                  <!-- [FIX 2026-09-02] 形状范式 (对标海康 iVMS/大华 DSS 联动规则编辑器);
                       绘制提示在画布下方状态栏 (画布内零提示文字)。
                       多边形/矩形进 roi_polygon+roi_shapes_json 由后端 pointInPolygon 判定
                       (矩形按 4 顶点多边形退化); 绊线保存时自动镜像到算法库并关联
                       tripwire_id。
                       [algo-view-readonly 2026-09-12 绘制收敛] 算法页绘制已整体下线,
                       全部 ROI 绘制收敛到本画板: 绊线按消费算法集放行 (4 插件,
                       写库 algo_id 跟随消费算法); 关注点 (point) 仅回显不参与判定
                       — 入口移除, 存量随 modelValue 全量保留不丢。 -->
                  <!-- [ROI-PER-CHANNEL 2026-09-12] 逐通道绘制入口 (对标海康多通道 ROI):
                       绑定 ≥2 通道时列出通道页签, 点击切换画布+快照底图; 首次在页签下
                       编辑即进入逐通道模式 (保存写 roi_shapes_by_channel, 未绘通道不
                       触发 — 与引擎严格模式同契约; 单通道/未点击页签 = 通用模式)。 -->
                  <div v-if="roiTabChannels.length >= 2 || roiStrictMode" class="roi-ch-tabs">
                    <span class="roi-ch-tabs__label">绘制通道</span>
                    <!-- [UX-UNPAINTED 2026-09-12] 未绘通道红色警示 (对标海康"警戒面必填"强反馈):
                         激活=primary / 已绘=info / 未绘=danger (与引擎严格模式"不绘不触发"同口径) -->
                    <el-tag
                      v-for="t in roiTabChannels"
                      :key="t.value"
                      size="small"
                      :effect="t.value === activeRoiChannel ? 'dark' : 'plain'"
                      :type="t.value === activeRoiChannel ? 'primary' : (isChannelUnpainted(t.value) ? 'danger' : 'info')"
                      class="roi-ch-tag"
                      @click="switchRoiChannel(t.value)"
                    >{{ t.label }} · {{ roiPackBadge(t.value) }}</el-tag>
                    <el-button v-if="roiStrictMode" size="small" text type="info" @click="clearRoiPerChannel">清除逐通道数据</el-button>
                  </div>
                  <div v-if="roiTabChannels.length >= 2 || roiStrictMode" class="roi-ch-toolbar">
                    <el-button size="small" @click="openCopyRoiDialog">复制到其他通道</el-button>
                    <el-button size="small" @click="fillRoiFromBaseline">填充通用形状</el-button>
                    <span class="roi-ch-hint">
                      {{ roiStrictMode
                        ? '逐通道模式: 各通道独立绘制与判定, 未绘制通道不会触发本规则 (保存前会提示)'
                        : '点击通道名开始逐通道绘制 (未进入 = 所有绑定通道共用同一份形状)' }}
                    </span>
                  </div>
                  <RoiPolygonEditor
                    v-model="form.conditions.region.config.roiPolygon"
                    :background-image-url="roiBackgroundUrl"
                    :canvas-width="440" :canvas-height="248"
                    :types="legalRoiTypes"
                  />
                  <!-- [ROI-GAP 2026-09-06] 多区域组合语义 (引擎 matchRoiShapes v2):
                       并集=任一检测区命中即通过 / 交集=全部命中才通过;
                       排除区恒为拦截语义 (命中即拦) 不参与组合计数。 -->
                  <div v-if="activeAreaRoiCount >= 2" style="display:flex; align-items:center; gap:8px; margin-top:6px; flex-wrap:wrap">
                    <span class="cond-sub-label">多区域组合</span>
                    <el-radio-group v-model="form.conditions.region.config.roiCombine" size="small">
                      <el-radio-button value="union">并集 (任一命中)</el-radio-button>
                      <el-radio-button value="intersection">交集 (全部命中)</el-radio-button>
                    </el-radio-group>
                  </div>
                </el-form-item>
                <!-- [FIX 2026-08-27 P0-PERIMETER v3] 绊线 (Tripwire) 联动
                     [FIX tw-route 2026-09-12] 同契约 gate: 绊线/方向按消费算法集显示
                     (tripwire/boundary/客流/违停 4 类事件; 其余事件选绊线 id 不参与
                     判定) — 画板画的绊线保存时按消费算法写库。 -->
                <el-form-item v-if="isTripwireRule" label="绊线" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.tripwireId" placeholder="选择已有绊线 (不选=不限)" clearable style="width: 100%" @focus="loadTripwireOptions" v-loading="tripwireLoading">
                    <template v-if="tripwireOptions.length > 0">
                      <el-option v-for="t in tripwireOptions" :key="t.id" :label="t.label" :value="t.id" />
                    </template>
                    <template #empty><span class="text-secondary">{{ tripwireEmptyHint }}</span></template>
                  </el-select>
                  <p class="cond-hint">可在上方画板直接画绊线（选"绊线"类型，点击两点后点「确认添加」，保存规则时自动同步到算法库并关联）；或从下方下拉选择本通道已保存的绊线</p>
                </el-form-item>
                <el-form-item v-if="isTripwireRule" label="绊线方向" label-position="top" class="cond-form-item">
                  <el-radio-group v-model="form.conditions.region.config.direction">
                    <el-radio value="">不限</el-radio>
                    <el-radio value="A_TO_B">A → B</el-radio>
                    <el-radio value="B_TO_A">B → A</el-radio>
                    <el-radio value="BOTH">双向</el-radio>
                  </el-radio-group>
                  <p class="cond-hint" style="margin-top:4px">
                    💡 仅选择绊线后, 方向过滤才生效; 仅选择方向则任意绊线的该方向都会触发。
                  </p>
                </el-form-item>
                <!-- [pw-in-rule 2026-09-12 绘制收敛] 尾随通道绘制并入规则页: 算法查看页
                     PassagewayEditor 下线 → 本表单承接绘制 (直写通道库, 实时生效);
                     已保存列表带开关/删除。显示层过滤 _ch0 结尾为防御 (通道库无
                     自动镜像机制: upsertPassageway 单条写入, 与绊线
                     createTripwireWithMirror 不同), 过滤仅兼容存量/未来形态。 -->
                <el-form-item v-if="isTailgatingRule" label="尾随通道" label-position="top" class="cond-form-item">
                  <div style="width: 100%">
                    <p class="cond-hint" style="margin: 0 0 8px">
                      通道多边形供尾随判定消费: 点击 ≥3 个顶点围成通行区后点「确认添加」；删除/停用立即生效, 不随规则保存/丢弃。
                    </p>
                    <PassagewayEditor
                      v-if="form.conditions.region.config.channelId"
                      :key="`pw_${form.conditions.region.config.channelId}`"
                      :image-url="roiBackgroundUrl"
                      :saved="displayPassageways"
                      @confirm="onPassagewayConfirm"
                    />
                    <el-empty v-else description="请先选择上面的「关联通道(快照背景)」" :image-size="60" />
                    <div v-if="displayPassageways.length" class="pw-list">
                      <div v-for="pw in displayPassageways" :key="pw.id" class="pw-list__item">
                        <span>
                          <el-switch
                            :model-value="pw.enabled !== false"
                            size="small"
                            style="margin-right: 8px"
                            :title="pw.enabled === false ? '已停用 (检测不生效)' : '生效中'"
                            @change="(v: any) => toggleRulePassagewayEnabled(pw, !!v)"
                          />
                          {{ pw.name }}
                          (sens={{ pw.sensitivity }}, {{ pw.direction_in ? '进入' : '离开' }} {{ pw.suppress_mode }}<template v-if="pw.migrated_from_tripwire">, 迁移自绊线#{{ pw.migrated_from_tripwire }}</template>)
                        </span>
                        <el-button text size="small" type="danger" @click="deleteRulePassageway(pw)">删除</el-button>
                      </div>
                    </div>
                    <div class="pw-toolbar-row">
                      <el-button size="small" @click="migrateTripwiresToPassageways">老绊线迁移</el-button>
                      <span class="pw-mig-hint">绊线→矩形通道 (幂等, detector 首帧自动执行)</span>
                    </div>
                  </div>
                </el-form-item>
                <el-form-item label="安保区域" label-position="top" class="cond-form-item">
                  <!-- [P1 2026-09-10 更名] 远程区域列表 (替代旧硬编码); 选中后展示覆盖设备/通道数;
                       引擎按区域 resolved 快照展开匹配 (任一通道命中即触发) -->
                  <el-select v-model="form.conditions.region.config.group" placeholder="选择安保区域 (按区域圈定触发范围)" clearable filterable style="width: 100%" @focus="loadDeviceGroups">
                    <el-option v-for="g in deviceGroupOptions" :key="g.value" :label="g.label" :value="g.value" />
                    <template #empty><span class="text-secondary">暂无区域（可在安保区域页创建）</span></template>
                  </el-select>
                  <div v-if="selectedGroupInfo" class="cond-hint" style="margin-top:4px">
                    ✅ 区域「{{ selectedGroupInfo.name }}」覆盖 {{ selectedGroupInfo.device_count ?? selectedGroupInfo.device_ids.length }} 台设备 / {{ selectedGroupInfo.channel_count ?? selectedGroupInfo.resolved_channel_ids.length }} 路通道；事件来自其中任一通道即按本规则空间判定触发。
                  </div>
                </el-form-item>
                <el-form-item label="绑定通道（多选，显式圈定）" label-position="top" class="cond-form-item">
                  <!-- [vp9 2026-09-01] spatial_cond.bound_channel_ids: 与分组/ROI/绊线共同决定触发范围;
                       引擎侧任一命中即通过 (与 source_cond 取并集, 避免规则静默) -->
                  <el-select v-model="boundChannelDraft" multiple filterable clearable collapse-tags collapse-tags-tooltip placeholder="按设备逐个勾选通道 (不选 = 不按通道收窄)" style="width: 100%" @change="onBoundChannelsChange">
                    <!-- [AREA-CASCADE 2026-09-11] 友好 label (通道名 (设备名)/·IP) + 区域已选时收窄至
                         resolved 通道 ∪ 已绑通道; 池外已选值注入 fallback, tag/tooltip 永远可读 -->
                    <el-option v-for="ch in boundChannelOptions" :key="ch.value" :label="ch.label" :value="ch.value" />
                  </el-select>
                  <p class="cond-hint" style="margin-top:4px">对标 NVIDIA sensor-scene 显式绑定：勾选后仅这些通道的事件进入本规则的 ROI/绊线判定；留空则由事件源与分组决定。</p>
                </el-form-item>
              </template>

              <!-- 位置条件 -->
              <!-- [AREA-CASCADE 2026-09-11] 三级级联改造 (区域→设备→通道, 参考LiveView 通道目录树范式):
                   第一级仅安保区域 (带设备/通道徽标, 不混设备旧位置); 第二级区域设备可展开勾选;
                   第三级仅已选设备名下通道。旧规则 point 走 legacyPointEcho 只读回显 (兼容读保留)。 -->
              <template v-if="cond.type === 'location'">
                <el-form-item label="安保区域" label-position="top" class="cond-form-item">
                  <el-select v-model="areaCascadeAreaId" placeholder="选择安保区域 (按区域圈定范围)" clearable filterable style="width: 100%" @focus="loadDeviceGroups">
                    <el-option v-for="o in areaCascadeAreaOptions" :key="o.value" :label="o.label" :value="o.value" />
                    <el-option v-if="legacyPointEcho" :key="legacyPointEcho.value" :label="legacyPointEcho.label" :value="legacyPointEcho.value" disabled />
                    <template #empty><span class="text-secondary">暂无安保区域（可在安保区域页创建）</span></template>
                  </el-select>
                  <p class="cond-hint" style="margin-top:4px">层级: 园区/楼栋/楼层 (安保区域页维护)；旧规则中的设备位置仍兼容显示 (不可新选)。</p>
                </el-form-item>
                <el-form-item v-if="areaCascadeAreaId" label="设备/通道圈定" label-position="top" class="cond-form-item">
                  <el-tree
                    ref="cascadeTreeRef"
                    :key="cascadeTreeKey"
                    :data="areaCascadeTreeData"
                    :default-checked-keys="cascadeDefaultCheckedKeys"
                    node-key="key"
                    :props="{ label: 'label', children: 'children' }"
                    show-checkbox
                    :expand-on-click-node="false"
                    class="cascade-tree"
                    @check="onCascadeCheck"
                  >
                    <template #default="{ data }">
                      <span class="casc-node" :title="data.label">
                        <span class="casc-label">{{ data.label }}</span>
                      </span>
                    </template>
                  </el-tree>
                  <p class="cond-hint" style="margin-top:4px">不勾任何通道 = 整区域生效 (按区域 resolved 快照展开)；勾选后仅所选设备/通道的事件进入本规则判定。</p>
                </el-form-item>
                <div v-if="selectedLocationChannels" class="cond-hint" style="margin-top:2px; color: var(--el-color-success)">
                  ✅ 区域「{{ selectedLocationChannels.areaName }}」共 {{ selectedLocationChannels.devices.length }} 台设备 / {{ selectedLocationChannels.totalChannels }} 路通道<template v-if="areaCascadeChannelIds.size">；已显式圈定 {{ areaCascadeChannelIds.size }} 路</template>。
                </div>
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
                          <!-- [R6 P1-4 2026-09-12] event-coverage 三档标注: B 档 VLM 兜底标签 / C 档预留位灰字提示 -->
                          <el-tag v-if="et.coverageTier === 'B'" size="small" type="warning" effect="plain" class="tier-tag-b">AI 研判兜底</el-tag>
                          <span v-else-if="et.coverageTier === 'C'" class="tier-hint-c">预留位·算法就绪后生效</span>
                        </span>
                      </el-checkbox>
                    </div>
                  </template>
                  <template v-else>
                    <el-checkbox v-for="et in fallbackEventTypes" :key="et.value" :label="et.label" :value="et.value" size="small" />
                  </template>
                </el-checkbox-group>
                <!-- [R6 P1-4 2026-09-12] 预留位事件显式预期管理 (doc §5.4): 选中 C 档事件时
                     告知「当前无算法支撑，规则将在算法可用后生效」— 空壳从静默失效变显式告知 -->
                <el-alert v-if="selectedReservedEventLabels.length" type="warning" :closable="false" show-icon
                  class="reserved-event-alert"
                  :title="`含 ${selectedReservedEventLabels.length} 个预留位事件（当前无算法支撑，规则将在算法可用后生效）：${selectedReservedEventLabels.join('、')}`" />
                <!-- [FIX 2026-09-02] 空类型语义修正: 未选择 = 不匹配任何事件 (对齐引擎新语义),
                     匹配所有事件的通配规则会放大 TPU/联动动作资源开销 → 必选阻断 (与简易模式 L237 一致) -->
                <p v-if="form.conditions.eventType.config.types.length === 0" class="cond-hint" style="color: #E6A23C; margin-top: 4px">⚠ 事件类型为必选项，未选择 = 不匹配任何事件（无法保存）</p>
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
                <!-- [FLOOR-MAP 2026-09-03] 适用平面图多选: 纯可视化绑定 (告警弹窗
                     地图 Tab 消费), 不参与触发匹配; 保存走 source_cond.map_ids 透传;
                     [2026-09-04] scene_tag 分组展示 (大华 DSS9000 同场景包对标) -->
                <el-form-item label="适用平面图" label-position="top" class="cond-form-item" style="margin-top: 8px">
                  <el-select v-model="form.mapIds" multiple collapse-tags collapse-tags-tooltip filterable
                    placeholder="不选=不限 (可在平面图页维护)" style="width: 100%">
                    <template v-for="g in mapGroupsByScene" :key="g.label">
                      <el-option-group :label="g.label">
                        <el-option v-for="m in g.items" :key="m.id"
                          :label="`${m.floor || m.name} · ${m.cameras?.length ? m.cameras.length + ' 路绑定' : '未绑定'}`" :value="m.id" />
                      </el-option-group>
                    </template>
                    <template #empty><span class="text-secondary">暂无平面图（可在 AI 智能 → 平面图页创建）</span></template>
                  </el-select>
                </el-form-item>
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

          <!-- [r25 2026-09-02] 设备通道多选从原步 4 提升到步 1 末尾 -->
          <div style="margin-top: 12px">
            <DeviceChannelPicker v-model="deviceChannelValue" />
          </div>
          </div>

          <div v-show="sectionVisible(2)">
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

          <!-- [FLOOR-MAP 2026-09-04] 联动平面图快捷卡: 常驻展示 (一等入口, 不必先钻
               客户端 tab 勾选动作); switch 直绑 actionState.CLIENT_SHOW_MAP —— 与动作
               tabs 内「联动地图位置」勾选框同源双向 (任一侧切换同步另一侧)。
               华为 iVMS 楼层联动配置独立对标 — map_ids 多选与触发条件区同源 (form.mapIds
               双向同步), FloorMapCanvas 只读预览与告警弹窗同渲染 (所见即所得);
               楼层展示顺序 = 平面图页绑定 is_primary 优先 (后端 getBindingsByChannel 排序) -->
          <div class="map-action-panel">
            <div class="map-action-head">
              <el-switch v-model="actionState.CLIENT_SHOW_MAP" />
              <span class="map-action-title">联动平面图 (楼层图包)</span>
              <span class="map-action-sub">触发时告警弹窗自动定位平面图 + 落点涟漪</span>
            </div>
            <template v-if="actionState.CLIENT_SHOW_MAP">
            <el-alert type="info" :closable="false" show-icon style="margin: 10px 0"
              title="告警弹窗将自动定位至平面图并投影告警落点涟漪 (触发即定位); 多图时主图默认在前、支持楼层切换" />
            <el-row :gutter="12">
              <el-col :span="10">
                <el-form-item label="关联平面图 (可多选, 与触发条件区同步)" label-position="top">
                  <el-select v-model="form.mapIds" multiple collapse-tags collapse-tags-tooltip filterable
                    placeholder="不选=不限 (按通道绑定反查)" style="width: 100%"
                    @change="previewMapId = 0">
                    <template v-for="g in mapGroupsByScene" :key="g.label">
                      <el-option-group :label="g.label">
                        <el-option v-for="m in g.items" :key="m.id"
                          :label="`${m.floor || m.name} · ${m.cameras?.length ? m.cameras.length + ' 路绑定' : '未绑定'}`" :value="m.id" />
                      </el-option-group>
                    </template>
                    <template #empty><span class="text-secondary">暂无平面图（可在 AI 智能 → 平面图页创建）</span></template>
                  </el-select>
                  <div class="map-action-tip">
                    主图与楼层顺序在「AI 智能 → 平面图」绑定管理中维护 (is_primary 优先);
                    摄像头落点/FOV 拖拽微调亦在该页编辑
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="14">
                <!-- 只读预览 (华为对标): 底图+摄像头+FOV 扇形, 与告警弹窗 plan 模式同渲染 -->
                <div v-if="previewMap" class="map-action-preview">
                  <FloorMapCanvas :map="previewMap" :bindings="previewMap.cameras || []" />
                </div>
                <div v-else class="map-action-preview-empty">选择平面图后预览渲染</div>
              </el-col>
            </el-row>
            </template>
          </div>
          </div>

          <!-- [r25 2026-09-02] 化简向导为 3 步 (基本信息/触发条件/动作编排):
               步 3 AI 增强/步 4 计划与防区/步 5 确认预览 整体隐藏。
               VLM 二次验证保留在「基本信息·冲突处理与高级配置」折叠里 (后端 LinkageEngine.cpp:3579 真触发)。
               DeviceChannelPicker 从原步 4 提升到步 1 触发条件末尾, 让用户在配置条件时直接选设备通道。 -->
        </el-form>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="handleDryRun" :loading="dryRunLoading" :disabled="!editingRule">
            模拟测试
          </el-button>
          <div style="flex:1" />
          <template v-if="wizardMode">
            <el-button :disabled="wizardStep === 0" @click="wizardStep--">上一步</el-button>
            <el-button v-if="wizardStep < WIZARD_STEPS.length - 1" type="primary" plain @click="wizardStep++">下一步</el-button>
          </template>
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">保存规则</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ═══ [vp8 双模式 / REVERT 2026-09-02] 简易创建抽屉: 新建默认入口,
         choice 页仅剩 从模板库选择(tune 微调) 与 切换到高级模式(全功能抽屉) 两入口 -->
    <SimpleRuleDrawer
      v-model="simpleDrawerOpen"
      :committing="simpleCommitting || editSaving"
      :editing-rule-id="editRuleId"
      :initial-tune="editTune"
      edit-simple-advanced
      @commit="commitSimple"
      @switch-advanced="onSimpleSwitchAdvanced"
    />

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
    <!-- dryRun 由编辑抽屉 footer「模拟测试」触发 — 编辑链一环, 嵌入模式需 append-to-body -->
    <el-dialog v-model="showDryRunDialog" title="规则模拟测试结果" width="680px" destroy-on-close append-to-body>
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

    <!-- ===== [ROI-PER-CHANNEL 2026-09-12] 逐通道形状复制对话框 ===== -->
    <!-- 编辑链一环 (对标海康"参数复制到其他通道"): 编辑抽屉为 append-to-body, 本弹窗同 -->
    <el-dialog v-model="showCopyRoiDialog" title="复制当前通道形状到其他通道" width="440px" destroy-on-close append-to-body>
      <el-form label-position="top">
        <el-form-item label="目标通道 (可多选)">
          <!-- [UX-UNPAINTED 2026-09-12] 批量提效: 一键勾选全部未绘通道 (追加式) -->
          <div style="margin-bottom:4px">
            <el-button size="small" link type="primary" @click="copyTargetsSelectUnpainted">一键勾选全部未绘通道</el-button>
          </div>
          <el-checkbox-group v-model="copyRoiTargets">
            <el-checkbox v-for="t in copyRoiOptions" :key="t.value" :value="t.value" style="display:block; margin:4px 0">
              {{ t.label }} <span :style="{ color: isChannelUnpainted(t.value) ? 'var(--el-color-danger, #f56c6c)' : undefined }">({{ roiPackBadge(t.value) }})</span>
            </el-checkbox>
          </el-checkbox-group>
          <p class="cond-hint" v-if="copyRoiOptions.length === 0">无其他通道可复制 (请先在绑定通道/关联通道中添加)</p>
        </el-form-item>
        <el-form-item label="复制方式">
          <el-radio-group v-model="copyRoiMode">
            <el-radio value="overwrite">覆盖目标通道已绘形状</el-radio>
            <el-radio value="append">追加到目标通道 (保留原形状)</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCopyRoiDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCopyRoi">确定复制</el-button>
      </template>
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
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Search, Plus, Document, Link, Bell, Setting, ArrowDown, Download, Upload, Refresh, WarningFilled, DataLine } from '@element-plus/icons-vue'
import { linkageApi, ACTION_TYPE_MAP, ACTION_TYPE_REVERSE_MAP, getTargetForActionType, unwrapRuleTemplates } from '@/api/linkage'
import { regionApi } from '@/api/region'  // [FIX 2026-08-28] 画板绊线自动创建 (createTripwireWithMirror)
import type { LinkageRule, LinkageAction, LinkageLog, ActionLogEntry, TimeTemplate, LinkagePlan, CEPPattern, ConditionNode, RuleConflict, RuleTriggerStat } from '@/api/linkage'
import { useLinkageOptions, type ChannelOption } from '@/composables/useLinkageOptions'
// [FIX area-cascade-label 2026-09-11] 通道友好 label/回显反查兑底/区域收窄 纯函数 (自内联提取)
// [FIX ghost-chan 2026-09-12] locationFilterKind: 位置树节点类型判定 (区域/设备),
//   设备节点时已选绑定通道严格跟随收窄 (消除幽灵通道)
import { friendlyChannelLabelOf, channelFallbackLabel, narrowSnapshotChannels, filterChannelsByLocation, locationFilterKind } from '@/composables/useFriendlyChannelLabel'
// [FIX area-cascade-label 2026-09-11] 目录反查 (fallback 四段降级中段; 首调懒加载目录)
import { devNameOf, chNameOf } from '@/composables/useAlarmDeviceLabel'
import { deviceApi } from '@/api/device'   // [AREA-CASCADE 2026-09-11] 级联树设备名解析
// [FIX 2026-09-04 老规则通道反解] 编辑存量规则时哈希反解需要
// [R6 P1-3 2026-09-12] safeChannelHash 迁至 utils/channelHash (原 useAlgoRuleSync 随算法页降视图删除)
import { safeChannelHash } from '@/utils/channelHash'
// [FLOOR-MAP 2026-09-03] 适用平面图多选: 地图列表缓存 (与平面图页共用单例)
import { useFloorMap } from '@/composables/useFloorMap'
// [FLOOR-MAP 2026-09-04] 联动平面图动作面板: scene_tag 分组标签 + 只读预览画布
import { sceneTagLabel, type FloorMapWithCameras } from '@/types/floorMap'
import FloorMapCanvas from '@/components/map/FloorMapCanvas.vue'
import { validateTemplateImport } from '@/api/templateSchema'
import RoiPolygonEditor from '@/components/RoiPolygonEditor.vue'
// [pw-in-rule 2026-09-12 绘制收敛] 尾随通道绘制并入规则页 (算法查看页只读化后承接)
import PassagewayEditor from '@/components/PassagewayEditor.vue'
import type { PassagewayDef, SuppressMode } from '@/types/region'
import TimeTemplateEditor from '@/components/TimeTemplateEditor.vue'
import EventTestDrawer from '@/components/EventTestDrawer.vue'
import { testApi } from '@/api/test'
import type { EventCoverageItem } from '@/api/test'
import PlanEditor from '@/components/PlanEditor.vue'
import CEPPatternEditor from '@/components/CEPPatternEditor.vue'
import ConditionTreeEditor from '@/components/ConditionTreeEditor.vue'
// [vp7 向导 2026-09-01] 新建事件规则向导子组件 (设备通道多选/NLG/模板库/AI 增强/确认预览)
import DeviceChannelPicker from '@/components/linkage/DeviceChannelPicker.vue'
// [REVERT 2026-09-02] TemplateGallery 不再在本视图使用: 工具栏/卡片已有"从模板库创建"语义,
//   编辑场景下浏览模板参考是画蛇添足。组件本体保留给 SimpleRuleDrawer 的 tune 微调视图复用。
// [r25 2026-09-02] 删除 RuleNlgInput/AiEnhancePanel/RulePreviewPanel 三个 import:
//   步 3/4/5 整段隐藏 (WIZARD_STEPS 3 步化), 三个组件本身已全部删除。
//   VLM 二次验证保留在「冲突处理与高级配置」折叠里 (后端 LinkageEngine.cpp:3579 真触发)
import SimpleRuleDrawer from '@/components/linkage/SimpleRuleDrawer.vue'
import type { SimpleCommitPatch, SimpleCommitEvent } from '@/components/linkage/SimpleRuleDrawer.vue'
import { useSimpleRuleEdit } from '@/composables/useSimpleRuleEdit'
import { securityAreaApi } from '@/api/securityAreas'
import type { SecurityArea, DeviceLocation } from '@/api/securityAreas'
import type { RoiData } from '@/composables/useRoiCanvas'
import { isFullscreenPoints } from '@/composables/useAlarmShapes'  // [FEAT guard-badge] 满屏识别同口径 (与弹窗角标/满屏按钮一致)

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

// [STAGE1 P1-2 2026-09-10] 布防时段 4 模板 (华为 ivm_02_0043 口径):
//   全天候=7×24, 工作日=周一-五, 周末=六-日, 工作时间=周一-五 09:00-18:00
//   仅作为草稿快捷填充, 不动 LinkageEngine 判定口径。
const TIME_PRESETS = [
  { id: 'all_day',        label: '全天候',   start: '00:00', end: '23:59', weekdays: [1, 2, 3, 4, 5, 6, 7],
    tooltip: '7×24 生效: 周一至周日 00:00-23:59 全时段布防' },
  { id: 'workday',        label: '工作日',   start: '00:00', end: '23:59', weekdays: [1, 2, 3, 4, 5],
    tooltip: '周一至周五 00:00-23:59 (周末不布防)' },
  { id: 'weekend',        label: '周末',     start: '00:00', end: '23:59', weekdays: [6, 7],
    tooltip: '周六、周日 00:00-23:59 (工作日不布防)' },
  { id: 'business_hours', label: '工作时间', start: '09:00', end: '18:00', weekdays: [1, 2, 3, 4, 5],
    tooltip: '周一至周五 09:00-18:00 上班时段布防' },
] as const

// 动态选项 (从后端加载)
const { eventTypeOptions, eventTypeGrouped, severityColor, channelOptions: channelOptionsDynamic, locationOptions: locationOptionsDynamic, loading: optionsLoading, fetchOptions } = useLinkageOptions()

// [R6 P1-4 2026-09-12] 预留位 (C 档) 选中集中文名 — 表单级显式预期管理提示
//   (doc §5.4: 预留位仍可选, 但不再"静默空壳", 选中即告知算法就绪后生效)
const selectedReservedEventLabels = computed(() => {
  const sel = new Set(form.conditions.eventType.config.types)
  return eventTypeOptions.value
    .filter((o) => o.coverageTier === 'C' && sel.has(o.value))
    .map((o) => o.label)
})

// [P1.3 2026-09-10 更名] 安保区域/位置远程实体 (独立管理页维护, 替代旧硬编码下拉)
const deviceGroups = ref<SecurityArea[]>([])
const remoteLocations = ref<DeviceLocation[]>([])
async function loadDeviceGroups() {
  try {
    const [gRes, lRes] = await Promise.all([
      securityAreaApi.listAreas(),
      securityAreaApi.listLocations(),
    ])
    const gData = (gRes as any)?.data?.data ?? (gRes as any)?.data
    deviceGroups.value = gData?.items || []
    const lData = (lRes as any)?.data?.data ?? (lRes as any)?.data
    remoteLocations.value = lData?.items || []
    // [FIX area-cascade-label 2026-09-11] 物理位置树设备节点名解析 (fire-and-forget,
    //   cascadeDevices 就绪后 locationTreeData 自动重算)
    loadCascadeDevices()
  } catch { /* 分组服务不可用时静默降级到设备位置 fallback */ }
}
// 分组下拉: value=id (LinkageEngine 按 resolved 快照展开), label=名称+覆盖数 (华为"分组视图"语义)
const deviceGroupOptions = computed(() => deviceGroups.value.map(g => ({
  value: g.id,
  label: `${g.name} (${g.device_count ?? g.device_ids.length} 设备 / ${g.channel_count ?? g.resolved_channel_ids.length} 通道)`,
})))
// 选中分组的覆盖范围展示 (规则内确认范围)
const selectedGroupInfo = computed(() => deviceGroups.value.find(g => g.id === form.conditions.region.config.group) || null)
// 位置下拉: 位置表实体优先 (正确语义: 先选位置), 设备提取位置 fallback (向后兼 容老规则)
const locationOptionsMerged = computed(() => {
  const remote = remoteLocations.value.map(l => ({ label: l.name, value: l.id }))
  const remoteVals = new Set(remote.map(r => r.value))
  const legacy = locationOptionsDynamic.value.filter(l => !remoteVals.has(l.value))
  return [...remote, ...legacy]
})
// [FIX area-cascade-label 2026-09-11] 物理位置树 (症状 1): 一级=安保区域 (label 带
//   设备数, 选中=区域 id, 引擎 resolved 快照展开语义不变); 二级=区域下设备
//   (cascadeDeviceName 解析, 未就绪时 fallback 设备 id)。旧值不在树中 (旧位置实体/
//   老设备 id/手工串) → legacy disabled 只读节点置顶, 不裸显未知 id。
//   与 location 条件分支三级树 (areaCascadeTreeData) 数据源同根 (deviceGroups),
//   但本树服务 region 分支单选 location 字段, 仅两级且不做勾选集。
const locationTreeData = computed(() => {
  const nodes = deviceGroups.value.map(g => ({
    value: g.id as string,
    label: `${g.name} (${g.device_ids?.length ?? 0} 台设备)`,
    disabled: false,
    children: (g.device_ids || []).map((dv: string) => ({
      value: dv,
      label: cascadeDeviceName(dv),
    })),
  }))
  const cur = form.conditions.region.config.location
  if (cur && !nodes.some(n => n.value === cur || (n.children || []).some(c => c.value === cur))) {
    const hit = locationOptionsMerged.value.find(l => l.value === cur)
    nodes.unshift({ value: cur, label: `旧版位置: ${hit?.label || cur}`, disabled: true, children: [] })
  }
  return nodes
})
// 选位置 → 区域维度设备/通道清单 (hint 消费)
// [AREA-CASCADE 2026-09-11] 全量重写: 原仅返回 deviceGroups.length 无实义; 新口径
//   { areaId, areaName, devices:[{id,name,channelIds}], totalChannels } 供模板 hint
const selectedLocationChannels = computed(() => {
  const pid = form.conditions.location.config.point
  const rloc = form.conditions.region.config.location
  const areaId = areaCascadeAreaId.value
    || (areaByIdMap.value.has(pid) ? pid : '')
    || (areaByIdMap.value.has(rloc) ? rloc : '')
  const area = areaByIdMap.value.get(areaId)
  if (!area) return null   // 非安保区域实体 → 不展示
  const devices = (area.device_ids || []).map(id => ({
    id,
    name: cascadeDeviceName(id),
    channelIds: (cascadeChannelsByDevice.value.get(id) || []).map(c => c.value),
  }))
  const total = new Set<string>([...(area.resolved_channel_ids || []), ...(area.channel_ids || [])])
  return { areaId, areaName: area.name, devices, totalChannels: total.size }
})

// ── [AREA-CASCADE 2026-09-11] location 页签三级级联 (区域→设备→通道) ──
//   原交互: locationOptionsMerged 区域+设备旧位置混选, 选完还要去绑定通道多选翻通道, 链路割裂;
//   新交互: 第一级仅安保区域 (带设备/通道徽标, 不混旧位置), 第二级该区域设备可展开勾选,
//   第三级仅已选设备名下通道 — 勾选并集写 spatial_cond.area_id/area_device_ids/bound_channel_ids
const areaByIdMap = computed(() => new Map(deviceGroups.value.map(g => [g.id, g])))
// 层级路径名 (园区/楼栋/楼层, parent_id 链上溯)
function areaNamePath(id: string): string {
  const parts: string[] = []
  let cur = areaByIdMap.value.get(id)
  let guard = 0
  while (cur && guard++ < 8) { parts.unshift(cur.name); cur = cur.parent_id ? areaByIdMap.value.get(cur.parent_id) : undefined }
  return parts.join(' / ')
}
const areaCascadeAreaOptions = computed(() => deviceGroups.value.map(g => ({
  value: g.id,
  // 徽标口径与 selectedGroupInfo/deviceGroupOptions 一致 (后端 count ?? 前端展开)
  label: `${areaNamePath(g.id)}（${g.device_count ?? g.device_ids.length} 设备 / ${g.channel_count ?? g.resolved_channel_ids.length} 通道）`,
})))
// 旧规则 point (device_location/设备旧位置) 回显 disabled option — 兼容读保留, 不允许新选
const legacyPointEcho = computed(() => {
  const p = form.conditions.location.config.point
  if (!p || areaByIdMap.value.has(p)) return null
  const hit = locationOptionsMerged.value.find(l => l.value === p)
  return { value: p, label: `旧版位置: ${hit?.label || p}` }
})

// 设备名解析池 (级联树设备节点 label; 无通道设备也需展示)
const cascadeDevices = ref<Map<string, { name: string; ip: string }>>(new Map())
const cascadeDevLoaded = ref(false)
async function loadCascadeDevices() {
  if (cascadeDevLoaded.value) return
  try {
    const devRes: any = await deviceApi.getList()
    const raw = devRes?.data
    const devices: any[] = raw?.data?.devices ?? raw?.data ?? raw?.devices ?? raw?.items ?? []
    const m = new Map<string, { name: string; ip: string }>()
    for (const d of devices) {
      const id = String(d?.id ?? '')
      if (id) m.set(id, { name: d?.name || '', ip: d?.ip || d?.deviceIp || d?.config?.ip || '' })
    }
    cascadeDevices.value = m
    cascadeDevLoaded.value = true
  } catch { /* 降级: 设备节点退回显示原始 id */ }
}
function cascadeDeviceName(id: string): string {
  return cascadeDevices.value.get(id)?.name || id
}
// 通道按设备分组 (channelOptionsDynamic 已带 deviceId/deviceName — AREA-CASCADE 扩展)
const cascadeChannelsByDevice = computed(() => {
  const m = new Map<string, Array<{ value: string; label: string }>>()
  for (const ch of channelOptionsDynamic.value) {
    if (!ch.deviceId) continue
    if (!m.has(ch.deviceId)) m.set(ch.deviceId, [])
    m.get(ch.deviceId)!.push({ value: ch.value, label: ch.deviceName ? `${ch.label} (${ch.deviceName})` : ch.label })
  }
  return m
})
function cascadeChannelLabel(id: string): string {
  for (const chs of cascadeChannelsByDevice.value.values()) {
    const hit = chs.find(c => c.value === id)
    if (hit) return hit.label
  }
  return id
}

// 级联勾选状态 (保存写 spatial_cond 三键: area_id / area_device_ids / bound_channel_ids)
const areaCascadeAreaId = ref('')
const areaCascadeDeviceIds = ref<Set<string>>(new Set())
const areaCascadeChannelIds = ref<Set<string>>(new Set())
const restoringCascade = ref(false)   // 回显窗口: 阻断 watch 副作用 (清勾选/清 point)
const cascadeTreeRef = ref()   // 保留实例 ref 供未来扩展 (当前勾选链路纯数据驱动)

// 树数据: 区域设备→其名下通道 (第三级不放全量, 消灭无关通道误勾保存后匹配不到的静默规则);
// 区域 channel_ids 直绑且不属于任何已列设备的通道归入「区域直绑通道」虚拟节点 (resolved 语义完整性)
const areaCascadeTreeData = computed(() => {
  const area = areaByIdMap.value.get(areaCascadeAreaId.value)
  if (!area) return []
  const nodes: Array<{ key: string; type: 'device' | 'direct' | 'channel'; label: string; children?: any[] }> = []
  for (const devId of area.device_ids || []) {
    const chs = cascadeChannelsByDevice.value.get(devId) || []
    nodes.push({
      key: `dev:${devId}`, type: 'device',
      label: `${cascadeDeviceName(devId)}${chs.length ? ` (${chs.length} 通道)` : ' (无在线通道)'}`,
      children: chs.map(c => ({ key: c.value, type: 'channel' as const, label: c.label })),
    })
  }
  const claimed = new Set(nodes.flatMap(n => (n.children || []).map(c => c.key)))
  const direct = (area.channel_ids || []).filter(id => !claimed.has(id))
  if (direct.length) {
    nodes.push({
      key: 'areadirect', type: 'direct', label: `区域直绑通道 (${direct.length})`,
      children: direct.map(id => ({ key: id, type: 'channel' as const, label: cascadeChannelLabel(id) })),
    })
  }
  return nodes
})
// 树勾选 → 两级 Set (设备节点勾选 = 全选其通道; 仅统计实选, 半选不计入 device_ids)
// [AREA-CASCADE FIX] 改用 @check 回调参数 checked.checkedNodes (数据驱动) —
//   此前经 cascadeTreeRef.value.getCheckedNodes() 在按需导入下 ref 代理缺方法,
//   回调参数自带勾选集零依赖且包含折叠未渲染节点 (级联在 store 层生效)
function onCascadeCheck(_data: unknown, checked: unknown) {
  if (restoringCascade.value) return
  const nodes = ((checked as any)?.checkedNodes || []) as Array<{ key: string | number; type?: string }>
  const devIds: string[] = []
  const chIds: string[] = []
  for (const nd of nodes) {
    if (nd.type === 'device') devIds.push(String(nd.key).slice(4))
    else if (nd.type === 'channel') chIds.push(String(nd.key))
  }
  areaCascadeDeviceIds.value = new Set(devIds)
  areaCascadeChannelIds.value = new Set(chIds)
}
// 区域切换: 清勾选集 + 与旧位置单选互斥 (新选择走 area_id 链路)
watch(areaCascadeAreaId, v => {
  if (restoringCascade.value) return
  areaCascadeDeviceIds.value = new Set()
  areaCascadeChannelIds.value = new Set()
  if (v) {
    form.conditions.location.config.point = ''
    loadCascadeDevices()
  }
})
// 回显重放: 区域/数据源变化 → key 变 → 树重建 → default-checked-keys 重放勾选集
//   (数据驱动, 不依赖组件实例方法; Set 是勾选 SSOT, 重建后状态无损)
const cascadeTreeKey = computed(() =>
  `${areaCascadeAreaId.value}|${cascadeDevLoaded.value ? 1 : 0}|${channelOptionsDynamic.value.length}`)
// 重放勾选集: 通道 keys + 设备 keys 并集 (设备 key 勾选会级联其全部通道, 与 chIds 一致无冲突;
// 无通道设备只有设备 key, 仅放通道 keys 会丢其勾选视觉)
const cascadeDefaultCheckedKeys = computed(() => [
  ...areaCascadeChannelIds.value,
  ...[...areaCascadeDeviceIds.value].map(id => `dev:${id}`),
])

// [vp9 2026-09-01] 绑定通道多选代理 (spatial_cond.bound_channel_ids; 国标字符串形态)
const boundChannelDraft = computed<string[]>({
  get: () => form.conditions.region.config.boundChannelIds || [],
  set: v => { form.conditions.region.config.boundChannelIds = v },
})
// [FIX cam-ch 2026-09-07] 快照背景通道仅列摄像头 (IPCamera) 设备的通道 —
//   ROI 画板背景需拉实时快照, NVR/DVR/EdgeBox 通道无快照语义;
//   绑定通道/事件源等多选不受限 (NVR 子通道仍是合法告警源)。
const cameraChannelOptions = computed(() =>
  channelOptionsDynamic.value.filter(ch => !ch.deviceType || ch.deviceType === 'IPCamera'))

// [FIX area-cascade-label 2026-09-11] 快照背景通道池 (症状 2/3): 区域已选时收窄为
//   「区域 resolved 摄像头 ∪ 绑定通道中摄像头」, 未选区域维持全量摄像头 (现状);
//   当前值 (含老规则从 sc.location_id 回填的 20 位串) 池外注入 fallback option —
//   el-select tag 永不裸显数字。收窄/双形态/fallback 逻辑抽到
//   useFriendlyChannelLabel.narrowSnapshotChannels (纯函数可测, LinkageRuleView.cascade.test.ts 覆盖)。
// [FIX area-dev-narrow2 2026-09-11] 位置树选中 → 设备维度直滤 (治形态鸿沟):
//   上一版 locationNarrowIds 走「通道 id 名单中转」, 但区域 resolved/channel_ids
//   存国标 20 位串 (SecurityAreaStore.h L59) 而通道池 value 混合形态
//   (RTSP=int32 通道 id, GB 设备=20 位), 名单∩池在鸿沟两侧互不命中 →
//   收窄失效回退全量 (用户实测: 选华盾展厅设备后仍见其他设备通道)。
//   治本: ch.deviceId 与区域 device_ids 同为设备表 id, 形态天然一致, 直接按
//   归属过滤; 通道 id 仅作区域直绑白名单补充 (双形态比对内置)。
//   优先级: 位置树直滤 > 分组 resolved 名单收窄 > 全量。
const locationFilteredChannels = computed(() =>
  filterChannelsByLocation(
    cameraChannelOptions.value,
    form.conditions.region.config.location,
    areaByIdMap.value,
    deviceGroups.value.map(g => g.device_ids || []),
  ))
const snapshotChannelOptions = computed(() => {
  const locFiltered = locationFilteredChannels.value
  if (locFiltered) {
    // 位置树已选: 直滤结果 ∪ 已绑定通道中池内项 (显式选择不静默消失, 置后);
    //   名单/绑定维度已由直滤+extras 完成, narrowSnapshotChannels 仅负责
    //   label 友好化 + 当前快照值池外 fallback 注入
    const known = new Set(locFiltered.map(c => c.value))
    // [FIX ghost-chan 2026-09-12] 设备节点: extras 不再注入已绑草稿中的外部设备通道
    //   (快照背景下拉同步严格); channelId 池外兑底保留 — 快照背景单选回显契约,
    //   避免旧规则底图/ROI 丢失副作用, 非告警圈定语义
    const extras = locationFilterKind(
      form.conditions.region.config.location,
      areaByIdMap.value,
      deviceGroups.value.map(g => g.device_ids || []),
    ) === 'device'
      ? []
      : cameraChannelOptions.value.filter(ch => boundChannelDraft.value.includes(ch.value) && !known.has(ch.value))
    return narrowSnapshotChannels(
      [...locFiltered, ...extras],
      [],
      [],
      form.conditions.region.config.channelId,
      { chNameOf, devNameOf },
    )
  }
  return narrowSnapshotChannels(
    cameraChannelOptions.value,
    (selectedGroupInfo.value?.resolved_channel_ids || []) as string[],
    boundChannelDraft.value,
    form.conditions.region.config.channelId,
    { chNameOf, devNameOf },
  )
})

// ── [AREA-CASCADE 2026-09-11] region 绑定通道 option 池: 友好 label + 区域收窄 + 已选兜底 ──
//   原问题: 编辑回显时 tag 直接渲染 GB28181 20 位串 (双形态/池缺失时 el-select 无 label 可匹配);
//   修复: ① label 升级「通道名 (设备名)」/「通道名 · 设备IP」; ② 区域已选时只显该区域
//   resolved 通道 + 已显式绑定通道 (并集, 避免区域缩窄后已绑通道从下拉消失而静默丢失);
//   ③ 池外已选值注入 fallback option (双形态/已删通道), tag/tooltip 永远可读。
//   未选区域时维持全量 channelOptionsDynamic (现状不变)。
function friendlyChannelLabel(ch: ChannelOption): string {
  if (ch.deviceName) return `${ch.label} (${ch.deviceName})`
  if (ch.deviceIp) return `${ch.label} · ${ch.deviceIp}`
  return ch.label
}
const baseChannelId = (v: string) => v.replace(/_ch\d+$/, '')
// [FIX area-cascade-label 2026-09-11] fallback 反查升级 (症状 3): 原「池不中→通 道 <id>」
//   两段降级升级为四段 (通道池 → 目录通道名 → 目录设备名 → 通道 <id>), 与
//   DisposeDialog [FIX dev-name-num] 同款思路, 逻辑抽到 useFriendlyChannelLabel 纯函数
function fallbackBoundLabel(v: string): string {
  return channelFallbackLabel(v, channelOptionsDynamic.value, { chNameOf, devNameOf })
}
const boundChannelOptions = computed<ChannelOption[]>(() => {
  const pool = channelOptionsDynamic.value
  const draft = boundChannelDraft.value
  // [FIX area-dev-narrow2 2026-09-11] 位置树设备维度直滤优先 (形态鸿沟治本,
  //   详见 snapshotChannelOptions 处锚点注释); 无位置选择 → 分组名单收窄 → 全量。
  const locFiltered = filterChannelsByLocation(
    pool,
    form.conditions.region.config.location,
    areaByIdMap.value,
    deviceGroups.value.map(g => g.device_ids || []),
  )
  let list: ChannelOption[]
  // [FIX ghost-chan 2026-09-12] 设备节点: 严格只保留该设备名下通道 — 已绑定草稿
  //   中的外部通道不注入 draftExtras/fallbacks (拉平历史 bound_channel_ids 里
  //   区域维度/级联勾选并入的跨设备值); 草稿本体由 location watch 跟随收窄,
  //   下拉/tag/保存三层数据一致
  const isDeviceLoc = locationFilterKind(
    form.conditions.region.config.location,
    areaByIdMap.value,
    deviceGroups.value.map(g => g.device_ids || []),
  ) === 'device'
  if (locFiltered) {
    list = locFiltered
  } else {
    const groupResolved = (selectedGroupInfo.value?.resolved_channel_ids || []) as string[]
    if (groupResolved.length) {
      // 双形态匹配: resolved 存国标 20 位主形态, 通道 value 可能带 _chN 子码流后缀
      const resolvedBase = new Set(groupResolved.map(baseChannelId))
      list = pool.filter(ch => resolvedBase.has(baseChannelId(ch.value)))
    } else {
      list = pool
    }
  }
  if (isDeviceLoc) {
    // 设备节点严格集: 草稿已跟随收窄, 无需 extras/兑底 (防御: 池未就绪窗口期也不放行外部通道)
    return [...list.map(ch => ({ ...ch, label: friendlyChannelLabel(ch) }))]
  }
  const known = new Set(list.map(c => c.value))
  const draftExtras = pool.filter(ch => draft.includes(ch.value) && !known.has(ch.value))
  list = [...list, ...draftExtras]
  const knownAll = new Set(list.map(c => c.value))
  const fallbacks = draft.filter(v => !knownAll.has(v)).map(v => ({ label: fallbackBoundLabel(v), value: v }))
  return [...list.map(ch => ({ ...ch, label: friendlyChannelLabel(ch) })), ...fallbacks]
})

// ── [FEAT guard-badge 2026-09-10] 绑定通道插件层布防状态 (区域库查询) ──
interface GuardState {
  channel: string
  label: string
  loading: boolean
  error: boolean
  count: number
  fullscreen: boolean
}
const guardStates = ref<GuardState[]>([])
const hasUnguarded = computed(() => guardStates.value.some(g => !g.loading && !g.error && g.count === 0))
// [FEAT guard-badge] 满屏识别统一用 useAlarmShapes.isFullscreenPoints (弹窗
//   角标/画板满屏按钮/布防徽标三处同口径, 容差 0.04 覆盖拖角微调)

/** 查绑定通道的插件层布防 (regions + tripwires 双表聚合):
 *  [FIX guard-semantics 2026-09-10] 实测铁证: 告警流 19/20 是 tripwire,
 *  绊线独立表 (channel 双写 _ch0 镜像) 驱动 — 只查 regions 会把「只画绊线
 *  的通道」误报未布防。两表 × 主/镜像双形态查询, 取 max 去重 (双写同源);
 *  include_disabled=false 只计启用布防 */
async function refreshGuardStates() {
  const channels = [...new Set(boundChannelDraft.value.filter(Boolean))]
  if (!channels.length) { guardStates.value = []; return }
  const labelOf = (ch: string) => {
    // [AREA-CASCADE 2026-09-11] 改用 boundChannelOptions (友好 label + 区域收窄 + fallback 兑底)
    const hit = boundChannelOptions.value.find(c => c.value === ch)
    return hit?.label ?? ch
  }
  guardStates.value = channels.map(ch => ({
    channel: ch, label: labelOf(ch), loading: true, error: false, count: 0, fullscreen: false,
  }))
  await Promise.all(guardStates.value.map(async st => {
    // [FIX tdz 注] 此函数仅由非 immediate watch 触发, form 必已初始化
    try {
      const q = st.channel.replace(/_ch\d+$/, '')
      const variants = [q, `${q}_ch0`]   // 主形态 + 双写镜像形态
      const cnt = { region: 0, tripwire: 0 }
      await Promise.all(variants.map(async v => {
        const rres: any = await regionApi.listRegions({ channel_id: 0, channel_id_str: v, include_disabled: false })
        const regions: any[] = rres?.data?.data?.regions ?? rres?.data?.regions ?? rres?.regions ?? []
        cnt.region = Math.max(cnt.region, regions.length)
        if (regions.some((r: any) => isFullscreenPoints(r?.polygon))) st.fullscreen = true
        const tres: any = await regionApi.listTripwires({ channel_id: 0, channel_id_str: v, include_disabled: false })
        const tws: any[] = tres?.data?.data?.tripwires ?? tres?.data?.tripwires ?? tres?.tripwires ?? []
        cnt.tripwire = Math.max(cnt.tripwire, tws.length)
      }))
      st.count = cnt.region + cnt.tripwire
    } catch {
      st.error = true
    } finally {
      st.loading = false
    }
  }))
}
// [FIX tdz 2026-09-10] guard-badge 的 watch 不在此处挂载: Vue watch 建立时
//   必执行一次 source getter 取初值 (与 immediate 无关) → boundChannelDraft
//   getter 访问 form → form 在后文声明 → TDZ ReferenceError → /linkage 白屏。
//   已投至 form 声明之后 (advancedCollapse 前)。

/// 选完通道联动预览: 无快照背景时取第一个摄像头通道加载 ROI 背景
/// [FIX cam-ch 2026-09-07] 背景快照仅摄像头 (IPCamera) 通道有快照语义 —
///   非盲取 ids[0] (绑定通道允许勾选 NVR/DVR 子通道, 但它们不能做背景)
function firstCameraChannel(ids: string[]): string {
  const camSet = new Set(cameraChannelOptions.value.map(c => c.value))
  return ids.find(id => camSet.has(id)) || ''
}
function onBoundChannelsChange(ids: string[]) {
  if (ids.length > 0 && !form.conditions.region.config.channelId) {
    const firstCam = firstCameraChannel(ids)
    if (firstCam) {
      form.conditions.region.config.channelId = firstCam
      loadChannelSnapshot(firstCam)
    }
  }
}

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

// ROI 编辑器背景快照
// [FIX 2026-08-28 SNAPSHOT-JSON-CONTRACT] 后端 /snapshot 返回 JSON {data:{url:"/snapshots/..."}},
// 旧实现把 JSON body 当图片 blob 塞给 <img> 必然解码失败 → 绘制区域无画面。
// 改为解析 url 后预加载校验 (nginx 已 alias /snapshots/ → /data/shield/snapshots/);
// ZLM getSnap 偶发产出 0 字节 JPEG (~3%), 加载失败自动重试一次。
const roiBackgroundUrl = ref('')

// ═══ [ROI-PER-CHANNEL 2026-09-12] 逐通道绘制状态 (海康式多通道 ROI) ═══
// 背景: 原规则级 roi_shapes_json 一份几何对全部绑定通道统一判定 — 不同视角
//   坐标含义不同 → 误报/漏报; 无逐通道绘制入口。对标海康/大华/华为端侧智能
//   事件 (ROI 是视角相关资产, per-channel 独立绘制, 不绘制不告警) + NVIDIA
//   per-stream ROI / AXIS per-camera profile。
// 语义: 专用优先通用回退 — roi_shapes_by_channel 非空 = 严格模式 (仅已绘制
//   通道触发); 空/缺失 = 通用模式 (存量规则零变更)。后端契约见 LinkageEngine.h。
// 本组状态: roiByChannel = 通道基准码 → 形状包 (list/combine/tripwire_refs);
//   roiTouched = 本次会话显式编辑过的通道; roiEchoed = 规则回显的已绘通道
//   (两者并集 = 保存时序列化集); roiGeneralBaseline = 进入逐通道前冻结的通用
//   基线 (回填"填充通用形状" + 回滚旧二进制的 roi_shapes_json 字段)。
interface RoiChannelPack {
  list: RoiData[]
  combine: 'union' | 'intersection'
  tripwireRefs: Array<{ id: string; direction: string }>
}
const roiByChannel = ref<Record<string, RoiChannelPack>>({})
const roiTouched = ref(new Set<string>())
const roiEchoed = ref(new Set<string>())
const roiGeneralBaseline = ref<RoiData[]>([])
/** 当前激活的通道页签 (基准码; '' = 未进入逐通道交互) */
const activeRoiChannel = ref('')
/** 程序性赋值抑制标记: 切换通道/回显/复制等写入 roiPolygon 时不误标 touched */
let roiSuppressTouch = false
/** 通道基准码 (剥 _chN 后缀; 与后端 channelBaseCode / stripChSuffix 同口径) */
const roiBaseOf = (ch: string) => String(ch || '').replace(/_ch\d+$/, '')
const roiClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
/** 通道页签集: 绑定通道 ∪ 快照通道 ∪ 已序列化/回显通道 (基准码去重) */
const roiTabChannels = computed<Array<{ value: string; label: string }>>(() => {
  const seen = new Map<string, string>()
  const push = (raw: string) => {
    const base = roiBaseOf(raw)
    if (base && !seen.has(base)) seen.set(base, '')
  }
  for (const c of form.conditions.region.config.boundChannelIds || []) push(String(c))
  push(String(form.conditions.region.config.channelId || ''))
  for (const k of roiEchoed.value) push(k)
  for (const k of roiTouched.value) push(k)
  const labeled = [...seen.keys()].map(base => {
    const hit = [...boundChannelOptions.value, ...snapshotChannelOptions.value]
      .find(o => roiBaseOf(String(o.value)) === base)
    return { value: base, label: hit?.label || base }
  })
  return labeled
})
/** 严格模式 (逐通道生效): 回显含 by_channel 或本次会话有触碰 */
const roiStrictMode = computed(() => roiEchoed.value.size > 0 || roiTouched.value.size > 0)
/** 保存序列化集 = 回显通道 ∪ 本次触碰通道 */
const roiSerializeKeys = computed(() => new Set<string>([...roiEchoed.value, ...roiTouched.value]))
/** 页签徽标: 已绘形状数 (区域类+绊线) / 未绘 */
/** 通道"激活且可判定"形状计数 (与引擎 hasActiveActionableShape 同口径:
 *  区域类/绊线且 is_active; point 仅回显不计数) — badge 与未绘警示共用 */
function roiActiveActionableCount(base: string): number {
  const list = base === activeRoiChannel.value
    ? form.conditions.region.config.roiPolygon
    : (roiByChannel.value[base]?.list || [])
  return list.filter(r => r.is_active && (AREA_ROI_TYPES.includes(r.roi_type) || r.roi_type === 'tripwire')).length
}
function roiPackBadge(base: string): string {
  const n = roiActiveActionableCount(base)
  return n > 0 ? `已绘 ${n}` : '未绘'
}
/** [UX-UNPAINTED 2026-09-12] 未绘通道判定 (页签红标 + 复制对话框快捷全选共用) */
function isChannelUnpainted(base: string): boolean {
  return roiActiveActionableCount(base) === 0
}
/** 一键勾选全部未绘通道 (追加式, 不清已有勾选) — 复制工具批量提效 */
function copyTargetsSelectUnpainted() {
  const unpainted = copyRoiOptions.value.filter(t => isChannelUnpainted(t.value)).map(t => t.value)
  copyRoiTargets.value = Array.from(new Set([...copyRoiTargets.value, ...unpainted]))
  if (unpainted.length === 0) ElMessage.info('没有未绘制的其他通道')
}
/** 当前工作副本 → 存档到激活通道包 (保留 tripwire_refs) */
function roiSyncWorkCopyToPack() {
  const key = activeRoiChannel.value
  if (!key) return
  const prev = roiByChannel.value[key]
  roiByChannel.value[key] = {
    list: roiClone(form.conditions.region.config.roiPolygon),
    combine: form.conditions.region.config.roiCombine,
    tripwireRefs: prev?.tripwireRefs || [],
  }
}
/** 激活逐通道模式 (幂等): 设置激活通道 + 首次进入时冻结通用基线 */
function roiEnsureActive(base: string) {
  if (!base) return
  if (!roiStrictMode.value && !activeRoiChannel.value) {
    // 首次进入逐通道: 冻结当前画布为通用基线 (回滚旧二进制 + 填充来源);
    //   已回显的通用基线 (roi_shapes_json) 不覆盖
    if (roiGeneralBaseline.value.length === 0) {
      roiGeneralBaseline.value = roiClone(form.conditions.region.config.roiPolygon)
    }
  }
  activeRoiChannel.value = base
}
/** 切换通道页签: 存档当前工作副本 → 载入目标包 (无包则继承通用基线副本) */
async function switchRoiChannel(target: string) {
  const base = roiBaseOf(target)
  if (!base || base === activeRoiChannel.value) return
  roiSyncWorkCopyToPack()
  roiEnsureActive(base)
  roiSuppressTouch = true
  const pack = roiByChannel.value[base]
  // [ROI-PER-CHANNEL 2026-09-12] 严格模式未绘通道 → 空画布 (未绘=不触发, 不给通用
  //   基线误导, 与回显口径一致); 首次进入 (非严格) → 通用基线副本作起点 (迁移便利,
  //   后续可继续调整或用「填充通用形状」显式回填)
  form.conditions.region.config.roiPolygon = pack
    ? roiClone(pack.list)
    : (roiStrictMode.value ? [] : roiClone(roiGeneralBaseline.value))
  form.conditions.region.config.roiCombine = pack?.combine || 'union'
  // 关联通道(快照背景) 跟随页签 — 底图与工作副本一致 (旧 watch 链 @change 失效, 手动加载)
  if (form.conditions.region.config.channelId !== base) {
    form.conditions.region.config.channelId = base
    await loadChannelSnapshot(base)
  }
  await nextTick()
  roiSuppressTouch = false
}
/** 关联通道下拉变更: 载入快照底图 + 逐通道模式下同步激活页签 (画布与底图一致) */
async function onRegionChannelChange(val: string) {
  await loadChannelSnapshot(val)
  if (roiStrictMode.value) {
    const base = roiBaseOf(String(val || ''))
    if (base && base !== activeRoiChannel.value) await switchRoiChannel(base)
  }
}
/** 标记当前激活通道已编辑 (watch roiPolygon 触发, 供保存序列化) */
function roiMarkTouched() {
  const key = activeRoiChannel.value
  if (!key) return
  roiTouched.value.add(key)  // reactive Set: 就地变更即可触发依赖
  roiSyncWorkCopyToPack()
}
// 逐通道数据清除 → 回通用模式 (保存后 roi_shapes_by_channel 发空串)
async function clearRoiPerChannel() {
  try {
    await ElMessageBox.confirm(
      '清除后本规则回到「通用区域」模式: 所有绑定通道共用同一份形状 (roi_shapes_json); 逐通道已绘数据将丢失。确定清除?',
      '清除逐通道绘制', { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' })
  } catch { return }
  roiByChannel.value = {}
  roiTouched.value.clear()
  roiEchoed.value.clear()
  activeRoiChannel.value = ''
  roiSuppressTouch = true
  form.conditions.region.config.roiPolygon = roiClone(roiGeneralBaseline.value)
  form.conditions.region.config.roiCombine = 'union'
  await nextTick()
  roiSuppressTouch = false
  ElMessage.success('已清除逐通道数据 (保存规则后回到通用模式)')
}
// ── 复制到其他通道 / 填充通用形状 ──
const showCopyRoiDialog = ref(false)
const copyRoiTargets = ref<string[]>([])
const copyRoiMode = ref<'overwrite' | 'append'>('overwrite')
const copyRoiOptions = computed(() =>
  roiTabChannels.value.filter(t => t.value !== activeRoiChannel.value))
function openCopyRoiDialog() {
  if (!activeRoiChannel.value) {
    roiEnsureActive(roiBaseOf(form.conditions.region.config.channelId) || roiTabChannels.value[0]?.value || '')
  }
  if (!activeRoiChannel.value) { ElMessage.warning('请先选择关联通道/绑定通道后再复制'); return }
  copyRoiTargets.value = []
  copyRoiMode.value = 'overwrite'
  showCopyRoiDialog.value = true
}
function confirmCopyRoi() {
  if (copyRoiTargets.value.length === 0) { ElMessage.warning('请勾选目标通道'); return }
  roiMarkTouched()  // 确认复制才真正进入逐通道模式 (取消关闭不改变模式)
  const src = roiByChannel.value[activeRoiChannel.value] || {
    list: roiClone(form.conditions.region.config.roiPolygon),
    combine: form.conditions.region.config.roiCombine,
    tripwireRefs: [],
  }
  for (const t of copyRoiTargets.value) {
    const key = roiBaseOf(t)
    if (!key || key === activeRoiChannel.value) continue
    const prev = roiByChannel.value[key]
    const base = copyRoiMode.value === 'append' && prev ? prev.list : []
    roiByChannel.value[key] = {
      list: [...roiClone(base), ...roiClone(src.list)],
      combine: copyRoiMode.value === 'append' && prev ? prev.combine : src.combine,
      tripwireRefs: copyRoiMode.value === 'append' && prev ? prev.tripwireRefs : [],
    }
    roiTouched.value.add(key)
  }
  ElMessage.success(`已复制到 ${copyRoiTargets.value.length} 个通道`)
  showCopyRoiDialog.value = false
}
function fillRoiFromBaseline() {
  if (!activeRoiChannel.value) {
    roiEnsureActive(roiBaseOf(form.conditions.region.config.channelId) || roiTabChannels.value[0]?.value || '')
  }
  if (!activeRoiChannel.value) return
  if (roiGeneralBaseline.value.length === 0) { ElMessage.warning('当前没有可填充的通用形状 (通用画布为空)'); return }
  roiSuppressTouch = true
  form.conditions.region.config.roiPolygon = roiClone(roiGeneralBaseline.value)
  form.conditions.region.config.roiCombine = 'union'
  roiSuppressTouch = false
  roiMarkTouched()
  ElMessage.success('已填充通用形状 (可继续调整)')
}
// [FIX tdz 2026-09-12] 画板 roiPolygon watch 已投至 form 声明之后 (guard-badge watch 旁):
//   watch 建立即同步取 source 初值, 此处 form 未初始化 → TDZ 崩溃 /linkage 白屏
//   (同 09-10 boundChannelDraft watch 先例; 本文件多处注释已沉淀该陷阱)


// [ROI-GAP 2026-09-06] 区域类形状 (引擎 matchRoiShapes pointInPolygon 判定,
//   组合语义作用域): 绊线走 tripwire_id 镜像链路, 关注点仅持久化回显不参与
//   空间判定 (契约文档化, 对标海康检测区+排除区组合 / DeepStream ROI-Filter)。
//   提为组件级常量: combine 选择器显隐 + handleSave 兼容字段同源引用。
const AREA_ROI_TYPES = ['detection_zone', 'exclusion_zone', 'rectangle']
// [FIX tw-route 2026-09-12 绘制收敛] 绊线库按算法隔离 (一算法一份库, 全仓 4 插件
//   实锚 — 与算法查看页 ALGO_EXCLUSIVE_RES 同源): 规则画板画绊线时按本规则事件
//   的消费算法写库 (原固定写 tripwire 库 → boundary/客流/违停规则画了不起作用)。
const TRIPWIRE_CONSUMER_BY_KEY: Record<string, string> = {
  tripwire: 'shield.algo.perimeter.tripwire',
  boundary: 'shield.algo.perimeter.boundary',
  people_count: 'shield.algo.metric.people_count',
  parking_violation: 'shield.algo.traffic.parking_violation',
}
const TRIPWIRE_CONSUMER_ALGOS = new Set(Object.values(TRIPWIRE_CONSUMER_BY_KEY))
/** 事件类型 → 是否绊线消费 (覆盖率矩阵 algo_id 优先; 未就绪短名兜底)。
 *  覆盖率条目 algo_id 非消费集时如实排除 (防无关事件误放行)。 */
function isTripwireConsumerEvent(t: string): boolean {
  const c = eventCoverageMap.value[t]
  if (c?.algo_id) return TRIPWIRE_CONSUMER_ALGOS.has(String(c.algo_id))
  const seg = String(t).split('.').pop() || String(t)
  return seg in TRIPWIRE_CONSUMER_BY_KEY
}
/** 本规则绊线写库 algo_id 推导 (与区域镜像同口径: 覆盖率优先 → 短名兜底)。
 *  未命中返回 '' —— 调用方必须已按 isTripwireRule 门控。原 fallback 回落
 *  tripwire 库是幽灵绊线写库根因: 不可画绊线的事件 (intrusion 等) 画板残留
 *  形状被写进越界库 → 未启用的越界检测持续报警 ([FIX tw-route 2026-09-12])。 */
function deriveTripwireAlgoId(): string {
  for (const et of form.conditions.eventType.config.types) {
    const c = eventCoverageMap.value[String(et)]
    if (c?.algo_id && TRIPWIRE_CONSUMER_ALGOS.has(String(c.algo_id))) return String(c.algo_id)
  }
  for (const et of form.conditions.eventType.config.types) {
    const seg = String(et).split('.').pop() || ''
    if (TRIPWIRE_CONSUMER_BY_KEY[seg]) return TRIPWIRE_CONSUMER_BY_KEY[seg]
  }
  return ''
}
// [FIX algo-roi-effective 2026-09-09] ROI 形态按规则事件类型收紧 (用户铁律:
//   只显示真正被消费、绘制后实际起作用的形态 — 禁止「画了不起作用」入口):
//   面类 (检测/排除/矩形) 进规则 roi_polygon 由 AlarmCheckPlugin pointInPolygon
//   判定 (L232/L262 实锚) — 任何事件合法; 绊线按消费算法集放行 (4 插件,
//   [FIX tw-route 2026-09-12] 原仅越界事件可画 → 扩至 boundary/客流/违停);
//   point (关注点) 仅回显不判定 — 移除。事件类型存短名 (id 末段, L2113) 或
//   全 id, 两种都匹配。
const legalRoiTypes = computed<string[]>(() => {
  const evTypes = (form.conditions.eventType?.config?.types ?? []).map(t => String(t).trim())
  const hasTw = evTypes.some(isTripwireConsumerEvent)
  return hasTw ? [...AREA_ROI_TYPES, 'tripwire'] : [...AREA_ROI_TYPES]
})
// 同判定复用: 绊线/方向两个表单字段仅在绊线消费算法集事件下显示
const isTripwireRule = computed(() => legalRoiTypes.value.includes('tripwire'))
// 激活区域类形状数 ≥2 时展示「并集/交集」组合选择器 (单形状无组合语义)
const activeAreaRoiCount = computed(() =>
  form.conditions.region.config.roiPolygon
    .filter(r => r.is_active && AREA_ROI_TYPES.includes(r.roi_type)).length)
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
    // [FIX tw-options-empty 2026-09-09] GB 通道下拉恒空修复: REST 09-08 收紧后
    //   无参查询 (不传 channel_id_str) 会滤掉所有 channel_id_str 非空记录 —
    //   GB 20 位编码场景绊线全带 str → 无参恒空 → 下拉永远「暂无越界绊线」,
    //   用户无法显式关联已有绊线。改逐通道 str 聚合 (页面通道选项为源, 剥
    //   _ch0 后缀去重; 通道数少, focus 一次性开销)。后端无参=全量语义收紧
    //   已入库待下次二进制部署, 部署后可回退为单次无参查询。
    const chValues = new Set<string>()
    for (const c of [...cameraChannelOptions.value, ...channelOptionsDynamic.value]) {
      const v = String(c?.value ?? '').replace(/_ch\d+$/, '')
      if (v) chValues.add(v)
    }
    const chList = [...chValues]
    const results = await Promise.allSettled(chList.map(ch =>
      fetch(`/api/v1/algos/tripwires?channel_id_str=${encodeURIComponent(ch)}&include_disabled=true`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)))
    const list = results.flatMap((x: any) =>
      x?.status === 'fulfilled' && x?.value ? (x.value?.tripwires ?? x.value?.data?.tripwires ?? []) : [])
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
    tripwireEmptyHint.value = tripwireOptions.value.length === 0 ? '本通道暂无已保存绊线 — 可直接在上方画板绘制, 保存规则后自动同步' : ''
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

// [FIX 2026-09-04 老规则通道反解] 存量规则 (vp9 2026-09-01 前) 通道绑定只落
//   source_cond.channel_ids (safeChannelHash int32; 真机实证 2056149937 =
//   hash('11010500001110000001_ch0') 带后缀形态), 无 spatial_cond.bound_channel_ids
//   字符串形态 → 编辑回填时绑定通道为空/事件源勾选不回显/ROI 快照无通道可加载。
//   对通道选项双形态 (原样 + 剥 _chN) 建 hash→id 映射反解, 与后端逐位一致。
function buildChannelHashIndex(): Map<number, string> {
  const m = new Map<number, string>()
  for (const opt of channelOptionsDynamic.value) {
    const id = String(opt?.value ?? '')
    if (!id) continue
    m.set(safeChannelHash(id), id)
    const base = id.replace(/_ch\d+$/, '')
    if (base && base !== id) m.set(safeChannelHash(base), id)
  }
  return m
}
/** 哈希数组 → 通道串数组 (去重保序; 选项未就绪/反解不出时丢弃该项) */
function resolveChannelsFromHashes(hashes: unknown): string[] {
  if (!Array.isArray(hashes) || hashes.length === 0) return []
  if (channelOptionsDynamic.value.length === 0) return [] // 深链竞态: 选项未就绪, 由下方 watch 补偿
  const idx = buildChannelHashIndex()
  const out: string[] = []
  for (const h of hashes) {
    const id = idx.get(Number(h))
    if (id && !out.includes(id)) out.push(id)
  }
  return out
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
// [r26 修复] 默认全部展开所有条件卡, 让用户一眼看到 cond-header 里的开关与 cond-body 里的所有内容
const collapsedConditions = reactive<Record<string, boolean>>({ time: false, region: false, location: false, eventType: false, eventSource: false, autoMerge: false })
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
    region: { enabled: false, config: { location: '', roi: '', group: '', roiPolygon: [] as RoiData[], channelId: '', tripwireId: '', direction: '', boundChannelIds: [] as string[], roiCombine: 'union' as 'union' | 'intersection' } },
    location: { enabled: false, config: { point: '' } },
    eventType: { enabled: true, config: { types: [] as string[], minSeverity: 3, minConfidence: 50 } },
    eventSource: { enabled: false, config: { channels: [] as string[] } },
    autoMerge: { enabled: false, config: { windowMs: 10000, maxCount: 10, dimension: 'channel' } },
  }
}

// [FLOOR-MAP 2026-09-03] 适用平面图: 地图缓存 + id→名称 (列表列/抽屉 options 共用)
const { maps: floorMaps, loadMaps: loadFloorMaps } = useFloorMap()
function mapNameById(id: number): string {
  return floorMaps.value.find((m) => m.id === id)?.name || `#${id}`
}

// [FLOOR-MAP 2026-09-04] 联动平面图位置动作面板: 勾选 CLIENT_SHOW_MAP 后展示。
//   华为 iVMS 楼层联动配置对标 — map_ids 多选与触发条件区同源 (form.mapIds);
//   scene_tag 分组 (大华 DSS9000 同场景包对标); FloorMapCanvas 只读预览与告警
//   弹窗 plan 模式同渲染。map_ids 仍走 source_cond 透传, 引擎匹配零改动
const previewMapId = ref(0)
const previewMap = computed<FloorMapWithCameras | null>(() => {
  const id = previewMapId.value && form.mapIds.includes(previewMapId.value)
    ? previewMapId.value
    : form.mapIds[0]
  return floorMaps.value.find((m) => m.id === id) || null
})
const mapGroupsByScene = computed(() => {
  const groups = new Map<string, FloorMapWithCameras[]>()
  for (const m of floorMaps.value) {
    const key = m.scene_tag || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }
  return [...groups.entries()].map(([tag, items]) => ({
    label: tag ? `${sceneTagLabel(tag)} (${tag})` : '未分类',
    items,
  }))
})
watch(() => actionState.CLIENT_SHOW_MAP, (on) => {
  // 面板展开时懒加载地图列表 (30s TTL 单例, 平面图页已拉过则直接吃缓存)
  if (on && !floorMaps.value.length) loadFloorMaps().catch(() => {})
})

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
  // [r25] VLM 默认启用 (后端 LinkageEngine.cpp:3579/3641 真触发 VLM 复核, 阈值 0.85)
  enableVlmVerify: true,
  // [P2-1] 治理字段: 关闭条件/响应时限
  closeCondition: '',
  responseDeadlineS: 0,
  // [POPUP-AUTOCLOSE 2026-09-03] 弹窗自动关闭秒: 0=永不自动关闭 (默认, 对齐海康 iVMS / 大华 DSS),
  //   >0=打开 N 秒后自动关闭。仅作用于 WS 命中本规则的弹窗, 详情入口弹窗不受此控制
  popupAutoCloseS: 0,
  // [FLOOR-MAP 2026-09-03] 适用平面图多选 (source_cond.map_ids 透传;
  //   纯可视化绑定, 引擎匹配零改动)
  mapIds: [] as number[],
  conditions: defaultConditions(),
})
// [FIX tdz 2026-09-10] guard-badge 的 watch 从 guard-badge 块投至此 (form 之后):
//   Vue watch 建立即同步取 source 初值, boundChannelDraft getter 读 form,
//   声明顺序错误 = setup 崩溃。挂载后回填/勾选/重置均自然触发刷新。
watch(boundChannelDraft, () => { refreshGuardStates() })

// [FIX tdz 2026-09-12] 画板 roiPolygon 变更 → 标记当前激活通道 (自 form 前投至此, TDZ 修复);
//   程序性赋值经 roiSuppressTouch 抑制
watch(() => form.conditions.region.config.roiPolygon, () => {
  if (roiSuppressTouch) return
  if (!activeRoiChannel.value) return  // 未进入逐通道交互 → 保持通用模式 (存量行为零变更)
  roiMarkTouched()
}, { deep: true })

// [FIX ghost-chan 2026-09-12] 物理位置选设备节点 → 已绑通道跟随收窄 (幽灵通道治本):
//   boundChannelOptions 只治「下拉选项」层, 历史草稿 (区域维度/级联勾选并集保存的
//   跨设备值) 若不同步收窄, tag 裸显 GB 串且保存链照旧写入 — UI 与规则圈定不一致。
//   严格契约: 设备节点 = 该设备名下通道 (双形态归一: 子码流形态值映射回池内
//   主形态 option value, 同物理通道只留一项); 区域节点/未选/旧版值不干预 (现状不变)。
//   防误伤: 池未就绪 (编辑回显早期 fetchOptions 未完成) 跳过, 选项就绪后用户
//   下次改选位置时自然收齐; 回显本身不改草稿 (打开编辑器零静默变更)。
watch(() => form.conditions.region.config.location, (loc) => {
  const pool = channelOptionsDynamic.value
  if (!pool.length) return
  if (locationFilterKind(loc, areaByIdMap.value, deviceGroups.value.map(g => g.device_ids || [])) !== 'device') return
  const filtered = filterChannelsByLocation(pool, loc, areaByIdMap.value, deviceGroups.value.map(g => g.device_ids || []))
  if (!filtered?.length) return
  const normByBase = new Map(filtered.map(c => [baseChannelId(c.value), c.value]))
  const next: string[] = []
  const seenBase = new Set<string>()
  for (const v of boundChannelDraft.value) {
    const b = baseChannelId(String(v))
    const norm = normByBase.get(b)
    if (norm && !seenBase.has(b)) { next.push(norm); seenBase.add(b) }
  }
  if (next.length !== boundChannelDraft.value.length || next.some((v, i) => v !== boundChannelDraft.value[i])) {
    boundChannelDraft.value = next
  }
})
const advancedCollapse = ref<string[]>([])

// ── 高级条件模式 ──
const advancedConditionMode = ref(false)
const conditionTreeValue = ref<ConditionNode | undefined>(undefined)

// ═══ [r25 2026-09-02 化简向导] ═══
// 3 步向导: 0 基本信息 → 1 触发条件 → 2 动作编排 (含设备通道多选, 原步 4 归并);
// el-steps 分步 / 全览双形态切换保留。隐藏原步 3 AI 增强/步 4 计划与防区/步 5 确认预览。
const WIZARD_STEPS = ['基本信息', '触发条件', '动作编排']
// [REVERT 2026-09-02] 恢复 vp8 之前默认形态: 打开抽屉默认分步向导 (wizardMode=true),
// 同一套功能分步引导展示 (vp8 曾改为全览一页铺开, 用户反馈观感即"高级模式才有的字段");
// 右上角「分步/全览」切换保留。
// [TPL-VP6 r2 2026-09-03 用户反馈] 默认改全览: 模板落地/高级入口打开即一页铺开
// (字段已预填, 全览可直接检阅全部能力), 需引导时右上角切「分步」。
const wizardMode = ref(false)
// [vp6-SIMPLE 2026-09-02] 简易模式入口: vp6 纯净表单 (单页普通模式, 隐藏向导条/AI 增强/确认预览)
const simpleEntryMode = ref(false)
const wizardStep = ref(0)
const sectionVisible = (s: number) => !wizardMode.value || wizardStep.value === s
/** 条件卡片分步归属: time 归「计划与防区」(布防计划语义), 其余归「触发条件」 */
// [r25] 化简: 全模式/分步模式均把所有条件卡归到步 1 (time 卡从原步 4 归并)
const condStepVisible = (_type: string) => sectionVisible(1)

// ── 防区选择 (DeviceChannelPicker): channelIds String 化单向同步进 eventSource.channels,
//    保存链 source_cond 组装 (数字/字符串双形态分拣) 零改动复用。 [r25] 从步 4 提升到步 1 末尾 ──
const deviceChannelValue = ref<{ deviceIds: string[]; channelIds: number[] }>({ deviceIds: [], channelIds: [] })
// [COND-PERSIST 2026-09-03] 回填抑制: resetEditorState 程序化恢复 picker 时, watch 的
//   「picker 非空 ⇒ eventSource.enabled」推断会覆盖禁用态保留的勾选 (enabled=false +
//   勾选快照); 回填期间抑制, flush 后解除 (用户后续操作恢复正常同步)
let suppressPickerSync = false
watch(deviceChannelValue, (v) => {
  if (suppressPickerSync) return
  form.conditions.eventSource.enabled = v.deviceIds.length > 0 || v.channelIds.length > 0
  form.conditions.eventSource.config.channels = v.channelIds.map(String)
}, { deep: true })

// [r25] VLM 抑制阈值保留 (后端 LinkageEngine.cpp:3662 真用 `result.confidence >= rule.vlm_suppress_threshold`, 默认 0.85)
//   删除 fusion_* (fusion_modalities/threshold/min_sources 后端 nlohmann 宽容解析不读, 字段沉冗) / aiEst 算力预估 / onAiEst 回调
const vlmSuppressThreshold = ref(0.85)

// [r25] 删除 applyNlg: RuleNlgInput 组件已删除 (步 3 NLG 整段隐藏)

// ── 模板一键应用到当前表单: RuleTemplate 字段 → 表单 (海康 iVMS-8700 式导入;
//    与既有 applyTemplate (直接从模板创建新规则) 语义不同, 勿合并) ──
function applyTemplateToForm(t: any) {
  if (!form.name && t.name) form.name = `${t.name}`
  if (typeof t.priority === 'number') form.priority = t.priority
  if (typeof t.cooldown_ms === 'number') form.cooldownMs = t.cooldown_ms
  if (t.description && !form.description) form.description = t.description
  if (Array.isArray(t.tags) && t.tags.length) form.tags = [...new Set([...form.tags, ...t.tags])]
  if (t.time_cond) {
    form.conditions.time.enabled = !!(t.time_cond.time_start || t.time_cond.weekdays?.length)
    form.conditions.time.config.startTime = t.time_cond.time_start || form.conditions.time.config.startTime
    form.conditions.time.config.endTime = t.time_cond.time_end || form.conditions.time.config.endTime
    if (t.time_cond.weekdays?.length) form.conditions.time.config.weekdays = [...t.time_cond.weekdays]
  }
  const src = t.source_cond
  if (src?.event_types?.length || src?.algorithm_ids?.length) {
    form.conditions.eventType.enabled = true
    form.conditions.eventType.config.types = [...new Set([...form.conditions.eventType.config.types, ...(src.algorithm_ids?.length ? src.algorithm_ids : src.event_types)])]
  }
  if (src?.min_severity !== undefined) form.conditions.eventType.config.minSeverity = src.min_severity
  if (src?.min_confidence !== undefined) form.conditions.eventType.config.minConfidence = Math.round(src.min_confidence * 100)
  if (Array.isArray(src?.channel_ids) && src.channel_ids.length) {
    form.conditions.eventSource.enabled = true
    form.conditions.eventSource.config.channels = [...new Set([...form.conditions.eventSource.config.channels, ...src.channel_ids.map(String)])]
  }
  if (t.merge_cond?.enabled) {
    form.conditions.autoMerge.enabled = true
    form.conditions.autoMerge.config.windowMs = t.merge_cond.window_ms || 10000
  }
  // [COND-PERSIST 2026-09-03] 模板 spatial_cond 防御性落地 (当前模板库 0/276 携带,
  //   后续模板若带位置/绊线/分组字段则原值预填; 有任一字段即启用区域条件)
  const tsc = (t as any).spatial_cond
  if (tsc && typeof tsc === 'object') {
    let hasAny = false
    if (tsc.location_id) { form.conditions.location.enabled = true; form.conditions.location.config.point = tsc.location_id; hasAny = true }
    if (tsc.region_id) { form.conditions.region.config.roi = tsc.region_id; hasAny = true }
    // [P1 2026-09-10 更名] area_id ?? device_group_id 双键读 (存量规则旧键回显兼容)
    const legacyGroupId = tsc.area_id ?? ((tsc as any).device_group_id || '')
    if (legacyGroupId) { form.conditions.region.config.group = legacyGroupId; hasAny = true }
    if (tsc.tripwire_id) { form.conditions.region.config.tripwireId = String(tsc.tripwire_id); hasAny = true }
    if (tsc.direction) { form.conditions.region.config.direction = tsc.direction; hasAny = true }
    if (Array.isArray(tsc.bound_channel_ids) && tsc.bound_channel_ids.length) {
      form.conditions.region.config.boundChannelIds = tsc.bound_channel_ids.map(String); hasAny = true
    }
    if (tsc.roi_shapes_json) {
      try {
        // [ROI-GAP 2026-09-06] v2 形态 {combine, shapes} 兼容 (同编辑回显链)
        const parsedTpl = JSON.parse(tsc.roi_shapes_json)
        const shapes = (Array.isArray(parsedTpl) ? parsedTpl
          : Array.isArray(parsedTpl?.shapes) ? parsedTpl.shapes : []) as Array<{ shape: string; name?: string; active?: boolean; direction?: string; points: number[] }>
        if (!Array.isArray(parsedTpl) && typeof parsedTpl?.combine === 'string') {
          form.conditions.region.config.roiCombine = parsedTpl.combine === 'intersection' ? 'intersection' : 'union'
        }
        if (shapes.length) {
          form.conditions.region.config.roiPolygon = shapes.filter(s => s && Array.isArray(s.points)).map((s, i) => ({
            roi_id: `roi_tpl_${Date.now()}_${i}`,
            roi_name: s.name || `区域 ${i + 1}`,
            roi_type: s.shape as any,
            polygon: s.points.map((v, k) => Math.round(k % 2 === 0 ? v * 1920 : v * 1080)),
            is_active: s.active !== false,
            direction: (s.direction || undefined) as any,
          }))
          hasAny = true
        }
      } catch { /* 模板形状快照损坏 → 忽略, 不阻断落地 */ }
    }
    if (hasAny) form.conditions.region.enabled = true
  }
  // 模板动作 → 勾选 + 参数
  let applied = 0
  for (const a of t.actions || []) {
    const key = ACTION_TYPE_REVERSE_MAP[a.type]
    if (!key) continue
    actionState[key] = true
    const { type: _at, target: _tg, name: _an, enabled: _ae, ...rest } = a
    if (Object.keys(rest).length) actionParams[key] = { ...(actionParams[key] || {}), ...rest }
    applied++
  }
  ElMessage.success(`模板「${t.name}」已应用 (${applied} 动作 / 标签 ${t.tags?.length || 0} 项); 可在高级模式中补全防区范围`)
}

// [r25] 删除 conditionSummary/previewActions: RulePreviewPanel 组件已删除 (步 5 确认预览整段隐藏)
//   预览能力由「页脚 模拟测试」按铉保留 (handleDryRun 另走点)

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

// ── [pw-in-rule 2026-09-12 绘制收敛] 尾随通道绘制并入规则页 ──
//   算法查看页已整体只读化 (PassagewayEditor 下线) → 全部绘制收敛到事件规则:
//   尾随 (tailgating) 事件的规则表单内嵌 PassagewayEditor + 已保存列表 (开关/
//   删除), 直写通道库 (algo_id 固定尾随插件 id, 与插件 getAlgoId() 全等闭环);
//   实时生效语义 (同算法页先例): 画/删/停立即落库, 不随规则保存/丢弃。
//   注: 本块置于 loadEventCoverage 之后 — watch 建立即同步取 source 初值,
//   前文 (eventCoverageMap/form 未就绪) 引用会 TDZ 崩溃 (本文件 09-10 先例)。
const TAILGATING_ALGO_ID = 'shield.algo.perimeter.tailgating'
const TAILGATING_EVENT_KEYS = new Set(['tailgating', 'tailgate', 'face_tailgate'])
/** 事件类型 → 是否尾随消费 (覆盖率矩阵优先; 未就绪短名/别名兑底) */
function isTailgatingEvent(t: string): boolean {
  const c = eventCoverageMap.value[t]
  if (c?.algo_id) return String(c.algo_id) === TAILGATING_ALGO_ID
  const seg = String(t).split('.').pop() || String(t)
  return TAILGATING_EVENT_KEYS.has(seg)
}
const isTailgatingRule = computed(() =>
  (form.conditions.eventType?.config?.types ?? []).some(t => isTailgatingEvent(String(t).trim())))

const rulePassageways = ref<PassagewayDef[]>([])
/** 显示层过滤 _ch0 结尾 (防御存量形态; 通道库无自动镜像机制 — 见模板注释。
 *  toggle 的镜像同步翻转仍基于全量 rulePassageways, 不随显示过滤丢失) */
const displayPassageways = computed(() =>
  rulePassageways.value.filter((p) => !String(p.channel_id_str || '').endsWith('_ch0')))
async function loadRulePassageways() {
  const chStr = String(form.conditions.region.config.channelId || '').replace(/_ch\d+$/, '')
  if (!chStr) { rulePassageways.value = []; return }
  try {
    const res = await regionApi.listPassageways({ channel_id_str: chStr, algo_id: TAILGATING_ALGO_ID, include_disabled: true })
    rulePassageways.value = ((res.data as any)?.data?.passageways ?? (res.data as any)?.passageways ?? [])
      .filter((p: any) => String(p.channel_id_str || '').replace(/_ch\d+$/, '') === chStr)
  } catch { rulePassageways.value = [] }
}
// 关联通道切换 → 重载已保存通道 (画布底图由既有 @change=loadChannelSnapshot 链负责)
watch(() => form.conditions.region.config.channelId, (v) => {
  if (v && isTailgatingRule.value) loadRulePassageways()
  else rulePassageways.value = []
})
// 事件类型切换 → 进入/退出尾随上下文时刷新
watch(isTailgatingRule, (on) => { if (on) loadRulePassageways() })

async function onPassagewayConfirm(payload: {
  transit_polygon: [number, number][]
  direction_in: boolean
  sensitivity: number
  suppress_mode: SuppressMode
  cooldown_sec: number
}) {
  const chIdStr = String(form.conditions.region.config.channelId || '')
  if (!chIdStr) { ElMessage.warning('请先选择"关联通道(快照背景)"再绘制通道'); return }
  const chIdNum = Number(chIdStr)
  try {
    await regionApi.upsertPassageway({
      channel_id: Number.isFinite(chIdNum) && Number.isSafeInteger(chIdNum) ? chIdNum : 0,
      // 剥 _ch0 后缀: 插件 getPassagewaysByChannelStr 精确匹配此键
      channel_id_str: chIdStr.replace(/_ch\d+$/, ''),
      algo_id: TAILGATING_ALGO_ID,
      name: `pw_${Date.now() % 10000}`,
      transit_polygon: payload.transit_polygon,
      direction_in: payload.direction_in,
      sensitivity: payload.sensitivity,
      suppress_mode: payload.suppress_mode,
      cooldown_sec: payload.cooldown_sec,
      enabled: true,
    })
    ElMessage.success('通道已添加')
    await loadRulePassageways()
  } catch (e: any) {
    ElMessage.error(`添加通道失败: ${e?.message ?? e}`)
  }
}

async function deleteRulePassageway(pw: PassagewayDef) {
  try {
    await ElMessageBox.confirm(`确定删除通道「${pw.name}」? 删除立即生效, 不随规则保存/丢弃。`, '删除确认', { type: 'warning' })
    await regionApi.deletePassageway(pw.id)
    ElMessage.success('已删除')
    await loadRulePassageways()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(`删除失败: ${e?.message ?? e}`)
  }
}

// [FIX tw-toggle 先例] 开关: upsert 按 id 只翻 enabled。镜像 (_ch0) 同步翻转为
//   防御性保留: 通道库无自动镜像机制 (upsertPassageway 单条写入, 与绊线
//   createTripwireWithMirror 不同) — 若存量/未来出现镜像行, 显示层虽已过滤,
//   仍随主形态同步翻转, 避免隐形镜像状态漂移。
async function toggleRulePassagewayEnabled(pw: PassagewayDef, enabled: boolean) {
  try {
    const mirror = rulePassageways.value.find(
      (p) => (p.channel_id_str || '') === `${pw.channel_id_str || ''}_ch0`)
    const bodies = [{ ...pw, enabled }, ...(mirror ? [{ ...mirror, enabled }] : [])]
    await Promise.all(bodies.map((b) => regionApi.upsertPassageway(b as PassagewayDef)))
    ElMessage.success(enabled ? '通道已启用' : '通道已停用 (检测不再触发)')
    await loadRulePassageways()
  } catch (e: any) {
    ElMessage.error(`操作失败: ${e?.message ?? e}`)
    await loadRulePassageways()
  }
}

async function migrateTripwiresToPassageways() {
  try {
    const res = await regionApi.migratePassageways(TAILGATING_ALGO_ID)
    const n = (res.data as any)?.data?.migrated ?? (res.data as any)?.migrated ?? 0
    ElMessage.success(n > 0 ? `已迁移 ${n} 条老绊线为通道` : '无可迁移的老绊线 (或已全部迁移)')
    await loadRulePassageways()
  } catch (e: any) {
    ElMessage.error(`迁移失败: ${e?.message ?? e}`)
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
  if (sc && (sc.region_id || sc.location_id || sc.area_id || (sc as any).device_group_id || sc.roi_polygon?.length || sc.tripwire_id || sc.direction || (sc as any).roi_shapes_json))
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

// [FIX 2026-09-02] 条件体可见性: 事件类型 (必备核心条件) 常显;
// 其他条件 = 开关启用 且 未手动折叠 (开关关闭 → 条件体折叠隐藏)
function condBodyVisible(type: string): boolean {
  if (type === 'eventType') return true
  return (form.conditions as Record<string, { enabled: boolean }>)[type]?.enabled === true && !collapsedConditions[type]
}
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
    // [R6 P1-3 2026-09-12] 反向联动 syncAlgosForRule 已废除: 调度态唯一入口 = 规则,
    //   启停后算法部署由 AlgoDeploymentReconciler 对账收敛 (前端不再维护调度串)
    ElMessage.success(rule.enabled ? '已启用' : '已停用')
  } catch (e: any) {
    rule.enabled = !rule.enabled
    const msg = e?.response?.data?.message || '操作失败'
    ElMessage.error(msg)
  }
}

// ── 编辑器: 打开/恢复 ──

// [vp8 双模式] 表单重置与抽屉打开解耦: 简易模式 commit 需在后台重置表单后
// 直接复用 handleSave 唯一保存链, 不打开高级抽屉 (校验失败时才落高级表单补全)。
function resetEditorState(rule: LinkageRule | null) {
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
  // [POPUP-AUTOCLOSE 2026-09-03] 恢复弹窗自动关闭秒 (整型兜底, 缺省 0=永不自动关闭)
  form.popupAutoCloseS = Number(rule?.popup_auto_close_s ?? 0) || 0
  // [r25] 向导步归零 + 防区选择/AI 增强字段回填 (fusion_* 删除, 后端 nlohmann 宽容不读)
  wizardStep.value = 0
  // [COND-PERSIST 2026-09-03] picker 先清空 (编辑态稍后由 ui_state 恢复):
  //   suppress 防止 deep watch 的「picker 非空 ⇒ enabled」推断在 flush 时
  //   覆盖刚回填的 eventSource (尤其禁用态保留勾选场景); nextTick 后恢复同步
  suppressPickerSync = true
  deviceChannelValue.value = { deviceIds: [], channelIds: [] }
  nextTick(() => { suppressPickerSync = false })
  // [AREA-CASCADE 2026-09-11] 级联状态同步清空 (编辑态稍后由 ui_state.areaCascade 恢复)
  restoringCascade.value = true
  areaCascadeAreaId.value = ''
  areaCascadeDeviceIds.value = new Set()
  areaCascadeChannelIds.value = new Set()
  nextTick(() => { restoringCascade.value = false })
  // [ROI-PER-CHANNEL 2026-09-12] 逐通道状态清空 (编辑态稍后由回显重建; 新建态保持空)
  //   suppress 覆盖整个 reset (回显/清空赋值不误标 touched), 函数尾 nextTick 释放
  roiSuppressTouch = true
  roiByChannel.value = {}
  roiTouched.value = new Set()
  roiEchoed.value = new Set()
  roiGeneralBaseline.value = []
  activeRoiChannel.value = ''
  vlmSuppressThreshold.value = typeof (rule as any)?.vlm_suppress_threshold === 'number' ? (rule as any).vlm_suppress_threshold : 0.85
  // [r25] 折叠默认收起条件中删除 enableVlmVerify/responseDeadlineS (这两项不再为用户主动配置,
  //   VLM 已默认启用 (新建 enableVlmVerify=true)、response_deadline_s 后端仅存不用, 不该在高级折叠里提示)
  advancedCollapse.value = (form.mutexGroup || form.suppressAfterRule || form.suppressLowerPriority || form.closeCondition) ? ['advanced'] : []
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
    // [COND-PERSIST 2026-09-03] 前端 UI 态快照 (handleSave 全量写入, 此处优先消费;
    //   老规则无此字段 → 各处回退内容推断, 行为与旧版一致)
    const sc0 = (rule as any).spatial_cond || {}
    const ui = (() => {
      try {
        const raw = sc0.ui_state_json
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    })() as any
    // time_cond → time ([COND-PERSIST] enabled 优先 ui 态, 老规则回退内容推断)
    const tc = rule.time_cond || {} as any
    form.conditions.time = {
      enabled: ui?.time?.enabled ?? !!(tc.time_start || tc.time_end || tc.weekdays?.length || tc.monthdays?.length),
      config: { startTime: tc.time_start || '08:00', endTime: tc.time_end || '20:00', weekdays: tc.weekdays || [1, 2, 3, 4, 5], monthdays: tc.monthdays || [] },
    }
    // spatial_cond → region + location
    const sc = rule.spatial_cond || {} as any
    // [FIX 2026-09-02] 画板形状回显: roi_shapes_json (归一化 [0,1]) → RoiData[] (1920×1080);
    //   修复编辑重开时画布恒空 (原回填写死 []); 含绊线方向/矩形角点/点坐标完整恢复。
    //   无 roi_shapes_json 的老规则维持空画板 (原行为, roi_polygon 不可反推形状类型)。
    //   [ROI-GAP 2026-09-06] v2 形态 {combine, shapes} 兼容: shapes 回填画板,
    //   combine 回填组合选择器 (老 v1 数组默认 union)。
    const roiShapesEcho = (() => {
      const empty = { list: [] as RoiData[], combine: 'union' as 'union' | 'intersection' }
      try {
        const raw = (sc as any).roi_shapes_json
        if (!raw) return empty
        const parsed = JSON.parse(raw)
        const arr = (Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.shapes) ? parsed.shapes : []) as Array<{ shape: string; name?: string; active?: boolean; direction?: string; points: number[] }>
        const combine: 'union' | 'intersection' =
          (!Array.isArray(parsed) && parsed?.combine === 'intersection') ? 'intersection' : 'union'
        const list = arr.filter(s => s && Array.isArray(s.points)).map((s, i) => ({
          roi_id: `roi_echo_${Date.now()}_${i}`,
          roi_name: s.name || `区域 ${i + 1}`,
          roi_type: s.shape as RoiData['roi_type'],
          polygon: s.points.map((v, k) => Math.round(k % 2 === 0 ? v * 1920 : v * 1080)),
          is_active: s.active !== false,
          direction: (s.direction || undefined) as RoiData['direction'],
        }))
        return { list, combine }
      } catch { return empty }
    })()
    // [ROI-PER-CHANNEL 2026-09-12] 逐通道回显: roi_shapes_by_channel 非空 → 重建通道包
    //   (roiByChannel/roiEchoed); roi_shapes_json 保留为通用基线 (回滚旧二进制 +
    //   "填充通用形状"来源)。损坏 JSON 退化通用模式 (存量行为)。
    const byChPacksEcho: Record<string, RoiChannelPack> = {}
    {
      const rawByCh = (sc as any).roi_shapes_by_channel
      if (typeof rawByCh === 'string' && rawByCh) {
        try {
          const m = JSON.parse(rawByCh)
          if (m && typeof m === 'object' && !Array.isArray(m)) {
            for (const k of Object.keys(m)) {
              const e = (m as any)[k]
              if (!e || typeof e !== 'object') continue
              const arr = (Array.isArray(e.shapes) ? e.shapes : []) as Array<{ shape: string; name?: string; active?: boolean; direction?: string; points: number[] }>
              const list = arr.filter(s => s && Array.isArray(s.points)).map((s, i) => ({
                roi_id: `roi_ch_${Date.now()}_${i}`,
                roi_name: s.name || `区域 ${i + 1}`,
                roi_type: s.shape as RoiData['roi_type'],
                polygon: s.points.map((v, k2) => Math.round(k2 % 2 === 0 ? v * 1920 : v * 1080)),
                is_active: s.active !== false,
                direction: (s.direction || undefined) as RoiData['direction'],
              }))
              const refs = Array.isArray(e.tripwire_refs)
                ? e.tripwire_refs.filter((r: any) => r && r.id !== undefined && r.id !== null)
                    .map((r: any) => ({ id: String(r.id), direction: String(r.direction || '') }))
                : []
              byChPacksEcho[k] = { list, combine: e.combine === 'intersection' ? 'intersection' : 'union', tripwireRefs: refs }
            }
          }
        } catch { /* 损坏忽略 → 通用模式 */ }
      }
    }
    roiByChannel.value = byChPacksEcho
    roiEchoed.value = new Set(Object.keys(byChPacksEcho))
    // [FIX 2026-09-04 老规则通道反解] 记录编辑源规则 (深链竞态 watch 补偿用); bound_channel_ids
    //   缺失 (vp9 前存量规则) 时从 source_cond.channel_ids 哈希反解字符串形态 (绑定多选/快照通道回填来源)
    lastEditSource = rule
    const hasSpatial = !!(sc.region_id || sc.location_id || sc.area_id || (sc as any).device_group_id || sc.roi_polygon?.length || sc.tripwire_id || sc.direction || (sc as any).bound_channel_ids?.length || (sc as any).roi_shapes_json || (sc as any).roi_shapes_by_channel)
    const boundRaw = (((sc as any).bound_channel_ids as unknown[]) || []).map(String)
    const boundResolved = boundRaw.length > 0
      ? boundRaw
      : resolveChannelsFromHashes(((rule.source_cond || {}) as any).channel_ids)
    // 激活通道 = 快照通道命中优先 (回显含该通道条目), 否则首个已绘通道; 无逐通道数据则 ''
    const echoChannelId = ui?.region?.channelId || firstCameraChannel(boundResolved) || (/^\d{20}$/.test(sc.location_id || '') ? sc.location_id : '')
    const echoChBase = roiBaseOf(echoChannelId)
    const echoActive = roiEchoed.value.has(echoChBase) ? echoChBase
      : (roiEchoed.value.size > 0 ? [...roiEchoed.value][0] : '')
    activeRoiChannel.value = echoActive
    roiGeneralBaseline.value = roiShapesEcho.list
    // 工作副本: 激活通道包命中 → 用其形状; 未命中 (严格模式未绘通道) → 空画板
    //   (未绘=不触发, 不给通用基线误导); 非逐通道模式 → 通用基线 (存量行为)
    const workEcho = echoActive && byChPacksEcho[echoActive]
      ? byChPacksEcho[echoActive]
      : (echoActive ? { list: [] as RoiData[], combine: 'union' as const } : roiShapesEcho)
    form.conditions.region = {
      // [COND-PERSIST 2026-09-03] enabled/location/channelId 优先 ui 态 (channelId 后端无
      //   白名单字段, 唯一持久化途径; location 解决与 location.point 混写折叠)
      enabled: ui?.region?.enabled ?? hasSpatial,
      // [FIX 2026-08-27 P0-PERIMETER v3] tripwire + direction 从后端读出
      // [vp9 2026-09-01] bound_channel_ids 显式绑定通道回填 (字符串形态直存)
      // [FIX 2026-09-02] roiPolygon 从 roi_shapes_json 完整回显 (多形状/方向/角点)
      // [ROI-PER-CHANNEL 2026-09-12] roiPolygon 换为"激活通道工作副本" (见 workEcho)
      // [ROI-SYNC 2026-09-08] channelId 三级兜底末位补 location_id (GB 20 位编码形态):
      //   模板导入规则 bound_channel_ids/ui_state 双空, 通道实际存 location_id
      //   (设备实锚: 徘徊规则 location_id=3402... 但画板关联通道空 → 保存时
      //   区域/绊线镜像拿不到通道而跳过, 算法配置区永远看不到镜像)。
      config: { location: ui?.region?.location ?? (sc.location_id || ''), roi: sc.region_id || '', group: sc.area_id || (sc as any).device_group_id || '', roiPolygon: workEcho.list, channelId: echoChannelId, tripwireId: sc.tripwire_id || '', direction: sc.direction || '', boundChannelIds: boundResolved, roiCombine: workEcho.combine },
    }
    form.conditions.location = {
      // [COND-PERSIST] enabled/point 优先 ui 态 (解决与 region.location 混写折叠)
      enabled: ui?.location?.enabled ?? !!sc.location_id,
      config: { point: ui?.location?.point ?? (sc.location_id || '') },
    }
    // [AREA-CASCADE 2026-09-11] 级联状态恢复: ui_state.areaCascade 优先 (新规则全量往返);
    //   旧规则 (无 ui 态) 回退 sc.area_id/device_group_id — 区域可视化展开但不自动勾选
    //   (bound_channel_ids 已回填 region 侧, 并集保存零丢失)
    restoringCascade.value = true
    areaCascadeAreaId.value = ui?.areaCascade?.areaId || sc.area_id || (sc as any).device_group_id || ''
    areaCascadeDeviceIds.value = new Set<string>(ui?.areaCascade?.deviceIds || [])
    areaCascadeChannelIds.value = new Set<string>(ui?.areaCascade?.channelIds || [])
    if (areaCascadeAreaId.value) loadCascadeDevices()
    nextTick(() => { restoringCascade.value = false })
    // source_cond → eventType + eventSource
    const src = rule.source_cond || {} as any
    // [FLOOR-MAP 2026-09-03] 适用平面图回填 (map_ids 可选字段, 老规则无此字段默认空)
    form.mapIds = ((src as any).map_ids || []).map(Number)
    form.conditions.eventType = {
      enabled: true,
      config: {
        types: src.algorithm_ids?.length ? src.algorithm_ids : (src.event_types || []),
        minSeverity: src.min_severity ?? 3,
        // 后端 GET 时已将小数乘以 100 转成百分比,这里直接 round 即可,不要重复 * 100
        minConfidence: Math.round(src.min_confidence ?? 50),
      },
    }
    // [COND-PERSIST 2026-09-03] eventSource: enabled 优先 ui 态; 禁用态勾选从 ui 快照
    //   恢复 (source_cond 已被保存链清空, 引擎语义不变 — 不限通道, 仅 UI 保留)
    const esEnabled = ui?.eventSource?.enabled ?? !!(src.channel_ids?.length || src.device_ids?.length)
    // [FIX 2026-08-28 双形态归一] device_ids 可能同时存主形态(不带 _ch0)与
    //   子码流形态(带 _ch0) — 同一通道只回填一个勾选值(带后缀优先,
    //   与通道选项 value 形态一致), 保存时再展开双形态。
    // [FIX 2026-09-04 老规则通道反解] channel_ids 哈希先反解为通道串再归一 (原 map(String)
    //   直落哈希串, 与通道选项 value (国标串) 不匹配 → 事件源勾选回显失败)
    const esChannels = esEnabled
      ? dedupeChannelForms([...resolveChannelsFromHashes(src.channel_ids), ...(src.device_ids || [])])
      : (ui?.eventSource?.channels || [])
    form.conditions.eventSource = {
      enabled: esEnabled,
      config: { channels: esChannels },
    }
    // [COND-PERSIST] DeviceChannelPicker 完整值恢复 (ui 优先; 老规则从数值通道反推)。
    //   suppress 仍生效中 (nextTick 才解除), 不触发「picker 非空 ⇒ enabled」覆盖
    if (ui?.picker) {
      deviceChannelValue.value = { deviceIds: [...(ui.picker.deviceIds || [])], channelIds: [...(ui.picker.channelIds || [])] }
    } else {
      const nums: number[] = []
      for (const c of esChannels) {
        const n = parseInt(c, 10)
        if (!isNaN(n) && String(n) === c.trim()) nums.push(n)
      }
      deviceChannelValue.value = { deviceIds: [], channelIds: nums }
    }
    // merge_cond → autoMerge ([COND-PERSIST] enabled 优先 ui 态)
    const mc = rule.merge_cond || {} as any
    form.conditions.autoMerge = {
      enabled: ui?.autoMerge?.enabled ?? !!mc.enabled,
      config: { windowMs: mc.window_ms || 10000, maxCount: mc.max_merge_count || 10, dimension: mc.merge_by || 'channel' },
    }
    // [FIX 2026-09-04 老规则快照] 编辑回填后 ROI 背景快照自动加载 (原仅 ROI 通道选择器
    //   @change 触发; 老规则无 ui 态 channelId → 打开编辑画布恒空)
    const snapChannel = form.conditions.region.config.channelId
    if (snapChannel) loadChannelSnapshot(snapChannel)
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

  // [ROI-PER-CHANNEL 2026-09-12] 释放回显期间的 touched 抑制 (nextTick 覆盖同拍 watch flush)
  nextTick(() => { roiSuppressTouch = false })
}

// [FIX 2026-09-04 老规则通道反解] 编辑源规则快照 (深链竞态补偿 watch 用; 声明在 setup 顶层,
//   resetEditorState 运行时已初始化)
let lastEditSource: LinkageRule | null = null
// 深链/嵌入编辑在 rules 就绪即打开, 通道选项 (fetchOptions) 可能未返回 → 哈希反解映射为空,
// 绑定通道/快照/事件源回填落空。选项就绪后对当前编辑规则补填一次。
watch(channelOptionsDynamic, (opts) => {
  if (opts.length === 0 || !lastEditSource) return
  const cfg = form.conditions.region.config
  const src = (lastEditSource.source_cond || {}) as any
  if (cfg.boundChannelIds.length === 0) {
    const resolved = resolveChannelsFromHashes(src.channel_ids)
    if (resolved.length > 0) {
      cfg.boundChannelIds = resolved
      if (!cfg.channelId) {
        // [FIX cam-ch 2026-09-07] 背景快照优先摄像头通道 (同编辑回填口径)
        const firstCam = firstCameraChannel(resolved)
        if (firstCam) {
          cfg.channelId = firstCam
          loadChannelSnapshot(firstCam)
        }
      }
    }
  }
  if (form.conditions.eventSource.enabled && form.conditions.eventSource.config.channels.length === 0) {
    const esResolved = dedupeChannelForms([...resolveChannelsFromHashes(src.channel_ids), ...((src.device_ids || []) as string[])])
    if (esResolved.length > 0) form.conditions.eventSource.config.channels = esResolved
  }
})

function openEditor(rule: LinkageRule | null) {
  resetEditorState(rule)
  // [SIMPLE-EDIT 2026-09-03] 行编辑已迁简易抽屉, 本入口现仅服务高级模式新建 (全功能形态)
  simpleEntryMode.value = false
  drawerVisible.value = true
}

// ═══ [vp8 双模式 2026-09-01] 简易创建抽屉 (choice 页: 模板 / 高级两入口) ═══
// [REVERT 2026-09-02] 按用户要求移除 'custom' 高频字段子表单 (SimpleRuleDrawer 卡片 2):
//   仅保留 模板微调 (tune → commit 回填高级表单) 与 切换到高级模式 两条链路; 新建仍默认开选择抽屉。
// [SIMPLE-EDIT 2026-09-03] 行内编辑统一走简易抽屉: 与新建共享同一挂载; [UX-ALIGN]
//   编辑也从 choice 入口进, 且「简易/高级模式」卡片均复用新建同一 vp6 表单回显编辑
//   (resetEditorState 整包回显 + handleSave 原生 update 分支), 不另建编辑表单。
//   注: composable 的 editingRule 别名为 editSourceRule (本地 L1664 已有同名编辑器状态)。
const simpleDrawerVisible = ref(false)
const simpleCommitting = ref(false)
const { editVisible, editSaving, editRuleId, editTune, editingRule: editSourceRule, openSimpleEdit, clearSimpleEdit, commitSimpleEdit } =
  useSimpleRuleEdit({ onSaved: () => fetchRules() })

/** 共享挂载开关桥: 新建(simpleDrawerVisible) 或 编辑(editVisible) 任一打开;
 *  关闭时同步回落 (编辑关闭清 editVisible, 防编辑态渗入新建流程的 choice 入口) */
const simpleDrawerOpen = computed({
  get: () => simpleDrawerVisible.value || editVisible.value,
  set: (v: boolean) => {
    simpleDrawerVisible.value = v
    if (!v) editVisible.value = false
  },
})

/** 新建 → 选择抽屉 (模板优先 / 切高级); 清除编辑态防止上一轮编辑的预填残留 */
function openNewRuleDrawer() {
  resetEditorState(null)
  clearSimpleEdit()
  simpleDrawerVisible.value = true
}

/** 简易时间四档 → time 条件 (night 跨夜与高级表单同语义) */
function applySimpleTime(p: SimpleCommitPatch) {
  if (p.timePreset === 'all') { form.conditions.time.enabled = false; return }
  form.conditions.time.enabled = true
  form.conditions.time.config.startTime = p.timeStart || '08:00'
  form.conditions.time.config.endTime = p.timeEnd || '20:00'
  form.conditions.time.config.weekdays = p.weekdays?.length ? [...p.weekdays] : [1, 2, 3, 4, 5]
}

/** 高频字段草稿 → 内部表单 (动作参数等高级语义由模板整包/高级模式承载)
 *  [POPUP-AUTOCLOSE 2026-09-03] popup_auto_close_s 一并合入: 修复 create 链路
 *  (commitSimple 模板分支 / TPL-VP6 switch-advanced 模板落地) 该字段不进 form 的缺口 */
function applySimplePatch(p: SimpleCommitPatch) {
  form.name = p.name
  if (typeof p.priority === 'number') form.priority = p.priority
  if (typeof p.cooldownMs === 'number') form.cooldownMs = p.cooldownMs
  // [POPUP-AUTOCLOSE] 弹窗自动关闭秒 (整型化兑底, 与 handleSave 提交倒钳位对称)
  if (typeof p.popup_auto_close_s === 'number') form.popupAutoCloseS = Math.max(0, Math.floor(p.popup_auto_close_s) || 0)
  // [FLOOR-MAP 2026-09-04] 地图联动草稿回填: 简易→高级切换时 map_ids 与 CLIENT_SHOW_MAP
  //   动作态随草稿进 vp6 表单 (快捷卡 switch 与条件区多选同源同步)
  if (Array.isArray(p.map_ids)) form.mapIds = [...p.map_ids]
  if (typeof p.map_linked === 'boolean') actionState.CLIENT_SHOW_MAP = p.map_linked
  form.conditions.eventType.enabled = true
  form.conditions.eventType.config.types = [...(p.eventTypes || [])]
  applySimpleTime(p)
  deviceChannelValue.value = { deviceIds: [...(p.deviceIds || [])], channelIds: [...(p.channelIds || [])] }
  if (p.actions) {
    Object.keys(actionState).forEach(k => delete actionState[k])
    for (const key of p.actions) actionState[key] = true
  }
}

/** 简易抽屉统一保存入口: update=高频字段直 PATCH (composable), create=模板分支走 handleSave 唯一保存链
 *  [TPL-VP6 2026-09-03] 模板创建已改走 onSimpleSwitchAdvanced 落地 vp6 全功能表单由用户手动保存,
 *  此 create 分支保留防御 (未来若恢复就地创建入口仍可用) */
async function commitSimple(e: SimpleCommitEvent) {
  if (e.mode === 'update') {
    await commitSimpleEdit(e)
    return
  }
  const p = e.payload
  simpleCommitting.value = true
  try {
    resetEditorState(null)
    if (p.template) applyTemplateToForm(p.template) // 模板整包合入 (保动作参数)
    applySimplePatch(p)
    if (p.template) form.name = p.name // 模板分支: 用户微调名优先
    simpleDrawerVisible.value = false
    const ok = await handleSave()
    if (!ok) { simpleEntryMode.value = false; drawerVisible.value = true } // 校验失败落全功能表单补全
  } finally { simpleCommitting.value = false }
}

/** 切换全功能表单: 简易卡片=vp6 纯净单页 (simple), 高级卡片/模板页切高级=全功能全览 (full)
 *  [UX-ALIGN 2026-09-03] 编辑态简易/高级卡片: 复用新建同一 vp6 表单回显编辑
 *  (resetEditorState 整包回显, 草稿 p 忽略 — 回显数据比高频字段草稿更全;
 *  不走 openEditor 因其写死 simpleEntryMode=false; handleSave 原生支持 update)
 *  [TPL-VP6 2026-09-03] 模板选中即切 vp6 全功能表单: p.template 整包合入
 *  (动作勾选+参数/优先级/冷却/描述/标签/时间/事件/通道) + 高频字段覆盖, 与
 *  commitSimple 模板分支同序 — 落地页具备动作编排/互斥组/抑制链/VLM 复核/元数据全部能力 */
function onSimpleSwitchAdvanced(p: SimpleCommitPatch | null, mode?: 'simple' | 'full') {
  if (editVisible.value && editSourceRule.value) {
    const row = editSourceRule.value
    simpleDrawerOpen.value = false // 经桥关闭 (同步清 editVisible, 防渗入新建)
    resetEditorState(row)
    simpleEntryMode.value = mode !== 'full' // 简易卡片=vp6 纯净单页; 高级卡片=全功能全览
    wizardMode.value = false // [TPL-VP6 r2] 默认全览 (用户反馈), 右上角可切分步
    drawerVisible.value = true
    return
  }
  simpleDrawerVisible.value = false
  if (p) {
    resetEditorState(null)
    // [TPL-VP6] 模板整包先合入 (保动作参数/元数据), 高频字段覆盖其后 — 与 commitSimple 模板分支同序
    if (p.template) applyTemplateToForm(p.template)
    applySimplePatch(p)
    if (p.name) form.name = p.name
  }
  simpleEntryMode.value = mode !== 'full' // 简易卡片=vp6 纯净表单 (无向导/AI 增强/确认预览)
  wizardMode.value = false // [TPL-VP6 r2 2026-09-03 用户反馈] 默认全览: 模板落地/高级入口一页铺开, 右上角可切「分步」
  drawerVisible.value = true
}

/** 工具栏新建下拉: 选择抽屉(默认) / 高级 / 模板库 */
function onNewCommand(cmd: string) {
  if (cmd === 'advanced') openEditor(null)
  else if (cmd === 'template') openTemplateLibrary()
  else openNewRuleDrawer()
}

// ── 编辑器: 保存 (内部表单 → 后端格式) ──

async function handleSave(): Promise<boolean> {
  // 表单验证 (返回 boolean: commitSimple 依据结果决定是否落高级表单补全)
  if (!form.name.trim()) { ElMessage.warning('请输入规则名称'); return false }
  if (form.priority < 1 || form.priority > 100) { ElMessage.warning('优先级范围 1-100'); return false }
  if (form.cooldownMs < 1000) { ElMessage.warning('冷却时间最小 1000ms'); return false }

  const enabledActions = Object.entries(actionState).filter(([, v]) => v)
  if (enabledActions.length === 0) { ElMessage.warning('请至少选择一个联动动作'); return false }

  // [FIX 2026-09-02] 事件类型必选硬校验 (废除 v7.9 BUG-3 的"通配确认"弹窗):
  //   引擎侧空 event_types 用户规则已改为"不匹配任何事件"(仅 default_*/system_* 系统
  //   兜底规则保留通配); 通配语义易放大 TPU/联动动作资源开销 → 源头阻断,
  //   与简易模式 SimpleRuleDrawer validateCommon 的必选校验对齐。
  if (form.conditions.eventType.config.types.length === 0) {
    ElMessage.warning('请至少选择一个事件类型（未选择 = 不匹配任何事件，规则不会触发）')
    return false
  }

  saving.value = true
  try {
    // [FIX tw-route 2026-09-12] 覆盖率矩阵前置加载 (幂等有缓存): isTripwireRule /
    //   deriveTripwireAlgoId 在多处同源消费, 就绪后 'crowd'(algo=people_count)
    //   等覆盖率形态不被短名兑底误判。
    await loadEventCoverage()
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
    // [FIX 2026-09-02] 绊线方向统一源 (大写形态): 条件卡"越界方向"显式选择优先,
    //   未选且画板恰一条绊线时回退其自身方向; 多条绊线不回退 (各线方向独立,
    //   统一回退首条会误伤其他方向的事件 — [FIX tw-mirror-sync 2026-09-09])。
    //   供 spatial_cond.direction 两处复用, 避免漂移。
    const activeTwRoisAll = rc.config.roiPolygon.filter(r => r.is_active && r.roi_type === 'tripwire')
    // [FIX tw-route 2026-09-12] 绊线态按事件类型门控: 画板存量残留形状不得参与
    //   非绊线消费规则的同步/方向/关联 (幽灵绊线写库根因)。
    const activeTwRois = isTripwireRule.value ? activeTwRoisAll : []
    const activeTwRoi = activeTwRois.length === 1 ? activeTwRois[0] : undefined
    const dirUpper = isTripwireRule.value
      ? (rc.config.direction || (activeTwRoi?.direction ? String(activeTwRoi.direction).toUpperCase() : ''))
      : ''
    // [FIX tw-mirror-sync 2026-09-09] 画板绊线 → 算法绊线库全量同步重写 — 修三缺陷:
    //   ① 原只镜像 drawnTripwires[0] 第一条: 画 2 条只入库 1 条 (实锚 09-09
    //      夜间周界入侵规则: 画板 2 条, 库只有 id=161 一条, 第 2 条告警无绊线可触发);
    //   ② effectiveTripwireId 已设后画板改动永不同步: 二次保存 PUT 无 POST
    //      (日志实锚 09:06:57), 算法配置页位置永久停留首次保存值 — 用户报
    //      「算法配置中线的位置和事件规则中不同」的直接机制;
    //   ③ 坐标原样写 0-1920 像素域, 与算法配置页 TripwireEditor 0-1 归一化
    //      口径分裂 (库内双形态混存实锚: [414,620] vs [0.63,0.69])。
    //   同步策略: 查本通道已有绊线按 name 防重 — 命中且几何+方向一致跳过,
    //   漂移 upsert 主+镜像同步, 未命中 createTripwireWithMirror 新建;
    //   坐标统一写归一化 (写侧 SSOT 收口, 读侧 normPt/后端 >1.5 兼容仍在)。
    //   tripwire_id 关联: 下拉显式选择优先; 画板恰 1 条关联该条; 多条留空
    //   (引擎单值匹配下多线任一触发=不限绊线, 防第 2 条告警静默)。
    //   存量兼容: 回显的 tripwireId (上次保存残留) 不再阻断同步 — 画板有绊线
    //   即同步 (否则老规则永久失同步, 实锚夜间周界入侵 tw=161); 同步后按
    //   新几何重新决策关联。仅画板无绊线时才保留显式选择不动。
    // [ROI-PER-CHANNEL 2026-09-12] 保存前未绘通道警示 (海康式"不绘制不告警" —
    //   防隐性破坏: 只画了部分通道就保存, 其余通道静默停触发。确认弹窗列名 +
    //   "返回绘制"出口; 用户可继续=显式接受该通道不触发)。
    //   先同步落袋工作副本, 保证序列化集/警示用最新画布状态。
    roiSyncWorkCopyToPack()
    if (rc.enabled && roiStrictMode.value && roiTabChannels.value.length >= 2) {
      const effTypes = isTripwireRule.value ? [...AREA_ROI_TYPES, 'tripwire'] : AREA_ROI_TYPES
      const unpainted = roiTabChannels.value.filter(t => {
        const list = t.value === activeRoiChannel.value
          ? rc.config.roiPolygon
          : (roiByChannel.value[t.value]?.list || [])
        return list.filter(r => r.is_active && effTypes.includes(r.roi_type)).length === 0
      })
      if (unpainted.length > 0) {
        try {
          await ElMessageBox.confirm(
            `以下 ${unpainted.length} 个通道未绘制检测区/绊线: ${unpainted.map(u => u.label).join('、')}。` +
            '保存后这些通道不会触发本规则 (对标海康"不绘制不告警"), 可用「复制到其他通道」或「填充通用形状」补齐。',
            '存在未绘制通道', { type: 'warning', confirmButtonText: '继续保存', cancelButtonText: '返回绘制' })
        } catch { return false }
      }
    }
    // [ROI-PER-CHANNEL 2026-09-12] 逐通道同步单元: 严格模式逐通道 (激活通道用工作
    //   副本, 其余用存档); 通用模式单通道 (关联通道 = 快照背景, 行为同旧版)。
    const roiSyncUnits: Array<{ ch: string; list: RoiData[] }> = roiStrictMode.value
      ? [...roiSerializeKeys.value].map(k => ({
          ch: k,
          list: k === activeRoiChannel.value ? rc.config.roiPolygon : (roiByChannel.value[k]?.list || []),
        }))
      : [{ ch: roiBaseOf(rc.config.channelId), list: rc.config.roiPolygon }]
    let effectiveTripwireId = isTripwireRule.value ? (rc.config.tripwireId || '') : ''
    // [FIX tw-route 2026-09-12] 非绊线消费事件: 不写库 + 全库清理历史残留
    //   (namePrefix 匹配, 含本规则旧名; 删除级联镜像对)。设备实锚: 「周界禁区
    //   闯入」(intrusion) 画板残留 2 条绊线形状被旧 fallback 写进越界库 →
    //   越界检测持续报警 (系统未启用任何越界规则)。
    if (!isTripwireRule.value) {
      const prefixes = new Set<string>([`${form.name || '规则'}_绊线`])
      // 编辑态且已改名: 清旧名残留 (新建态 lastEditSource 可能残留上次编辑值, 需 editRuleId 门控)
      if (editRuleId.value && lastEditSource?.name && String(lastEditSource.name) !== form.name) {
        prefixes.add(`${String(lastEditSource.name)}_绊线`)
      }
      try {
        const res = await regionApi.listTripwires({})
        const allTw: any[] = ((res.data as any)?.data?.tripwires ?? (res.data as any)?.tripwires ?? [])
        const seen = new Set<string>()
        let cleaned = 0
        for (const t of allTw) {
          const nm = String(t.name || '')
          if (![...prefixes].some(p => nm === p || nm.startsWith(p + '_'))) continue
          const key = `${nm}|${String(t.algo_id || '')}|${String(t.channel_id_str || '').replace(/_ch\d+$/, '')}`
          if (seen.has(key)) continue
          seen.add(key)
          try { await regionApi.deleteTripwire(Number(t.id)); cleaned++ } catch { /* 单条失败不阻断保存主链 */ }
        }
        if (cleaned > 0) {
          ElMessage.info(`已清理 ${cleaned} 条历史残留绊线 (本规则事件类型不使用绊线, 防越界误报)`)
        }
      } catch { /* 清理失败不阻断保存主链 */ }
    }
    // [ROI-PER-CHANNEL 2026-09-12] 逐通道绊线同步 (原单通道链路按 roiSyncUnits
    //   展开): 严格模式 → 各已绘通道分别同步并回写 tripwire_refs (引擎白名单);
    //   通用模式 → 单 unit (关联通道), 行为与旧版一致。
    let totSynced = 0, totSkipped = 0, totDrawn = 0
    const twUsedIds = new Set<string>()
    const twRefsByChannel: Record<string, Array<{ id: string; direction: string }>> = {}
    if (isTripwireRule.value) {
        // [FIX tw-route 2026-09-12] 写库 algo_id 按本规则事件消费算法推导 (与区域
        //   镜像同口径): boundary/客流/违停规则画的绊线进各自算法库, 插件才查得到;
        //   覆盖率未就绪短名兑底 (均未命中不回落 — 上游 isTripwireRule 门控已
        //   保证本分支必为绊线消费事件, derive 必非空)。
        await loadEventCoverage()
        const twAlgoId = deriveTripwireAlgoId()
        // [FIX tw-route 2026-09-12] 防重查询改全量 + 本地过滤 (本通道+本算法库):
        //   原查询带 algo_id 过滤, 无法覆盖 diff 清理扫描域 (含其他算法库残留)。
        let allTw: any[] = []
        try {
          const res = await regionApi.listTripwires({})
          allTw = ((res.data as any)?.data?.tripwires ?? (res.data as any)?.tripwires ?? [])
        } catch { /* 查询失败按全新建 */ }
        const mirrorOf = (mainId: any, ch: string) => allTw.find((t: any) =>
          String(t.channel_id_str || '').endsWith('_ch0')
          && String(t.channel_id_str || '').replace(/_ch\d+$/, '') === ch
          && String(t.algo_id || '') === twAlgoId
          && String(t.name) === String(allTw.find((m: any) => String(m.id) === String(mainId))?.name ?? '###'))
        const normPt1920 = (arr: number[]): [number, number] =>
          [arr[0] > 1.5 ? arr[0] / 1920 : arr[0], arr[1] > 1.5 ? arr[1] / 1080 : arr[1]]
        const namePrefix = `${form.name || '规则'}_绊线`
        for (const unit of roiSyncUnits) {
          const chStr = unit.ch
          const drawnTripwires = unit.list.filter(r => r.is_active && r.roi_type === 'tripwire')
          if (drawnTripwires.length === 0) {
            // [ROI-PER-CHANNEL 2026-09-12] 本通道画板无绊线 → refs 清空 (防 stale:
            //   用户删光绊线后旧 refs 仍指向已删 id → 该通道绊线事件永不命中;
            //   空 refs = 不设绊线门槛, 与"未画绊线不设限"语义一致)
            if (roiStrictMode.value && chStr) twRefsByChannel[chStr] = []
            continue
          }
          totDrawn += drawnTripwires.length
          if (!chStr) {
            ElMessage.warning('画了绊线但未选"关联通道", 绊线未同步到算法库; 请选择通道后重新保存')
            continue
          }
          let synced = 0, skipped = 0
          const idByIndex: string[] = []
          for (let i = 0; i < drawnTripwires.length; i++) {
            const r = drawnTripwires[i]
            const p = r.polygon || []
            if (p.length < 4) continue
            // 0-1920 画布域 → 0-1 归一化 (写侧统一口径)
            const pa: [number, number] = [p[0] / 1920, p[1] / 1080]
            const pb: [number, number] = [p[2] / 1920, p[3] / 1080]
            const dirLower = String(r.direction || '').toLowerCase()
            const direction = dirLower === 'a_to_b' ? 'a_to_b' : dirLower === 'b_to_a' ? 'b_to_a' : 'both'
            // name 防重: 老形态首条无序号, 新形态带序号 (画板列表顺序稳定)
            const cand = allTw.find((t: any) => !String(t.channel_id_str || '').endsWith('_ch0')
              && String(t.channel_id_str || '').replace(/_ch\d+$/, '') === chStr
              && String(t.algo_id || '') === twAlgoId
              && (t.name === (i === 0 ? namePrefix : `${namePrefix}_${i + 1}`) || t.name === `${namePrefix}_${i + 1}`))
            if (cand) {
              const oldA = normPt1920(Array.isArray(cand.point_a) ? cand.point_a : [0, 0])
              const oldB = normPt1920(Array.isArray(cand.point_b) ? cand.point_b : [0, 0])
              const drift = Math.abs(oldA[0] - pa[0]) > 0.002 || Math.abs(oldA[1] - pa[1]) > 0.002
                || Math.abs(oldB[0] - pb[0]) > 0.002 || Math.abs(oldB[1] - pb[1]) > 0.002
              const dirChanged = String(cand.direction || 'both') !== direction
              if (!drift && !dirChanged && cand.enabled !== false) { skipped++; idByIndex[i] = String(cand.id); continue }
              // 漂移更新: 主形态 + 镜像同步 (插件按 _ch0 查询, 只改主不生效)
              try {
                await regionApi.upsertTripwire({ ...cand, point_a: pa, point_b: pb, direction, enabled: r.is_active !== false } as any)
                const mir = mirrorOf(cand.id, chStr)
                if (mir) await regionApi.upsertTripwire({ ...mir, point_a: pa, point_b: pb, direction, enabled: r.is_active !== false } as any)
                synced++; idByIndex[i] = String(cand.id)
              } catch (e: any) {
                ElMessage.error(`绊线「${r.roi_name || i + 1}」(通道 ${chStr}) 同步失败: ${e?.message ?? e}`)
                idByIndex[i] = String(cand.id)  // [FIX tw-route] 同步失败不误清理 (画板意图保留)
              }
            } else {
              try {
                const newId = await regionApi.createTripwireWithMirror({
                  channel_id: 0,
                  channel_id_str: chStr,
                  algo_id: twAlgoId,
                  name: drawnTripwires.length === 1 ? namePrefix : `${namePrefix}_${i + 1}`,
                  point_a: pa,
                  point_b: pb,
                  direction,
                  enabled: true,
                })
                synced++; idByIndex[i] = String(newId)
              } catch (e: any) {
                ElMessage.error(`绊线创建失败 (通道 ${chStr}): ${e?.message ?? e} (规则仍会保存)`)
              }
            }
          }
          // [ROI-PER-CHANNEL 2026-09-12] 回写本通道绊线引用 (引擎严格模式白名单):
          //   id + 方向 (大写形态; 空 = 不约束方向)。同步失败槽位跳过 (refs 空
          //   → 引擎不约束, 防误杀 — 契约见 LinkageEngine.h)。
          const refs: Array<{ id: string; direction: string }> = []
          for (let i = 0; i < drawnTripwires.length; i++) {
            if (!idByIndex[i]) continue
            const dUpper = String(drawnTripwires[i].direction || '').toUpperCase()
            if (!refs.some(x => x.id === idByIndex[i])) refs.push({ id: idByIndex[i], direction: dUpper })
          }
          twRefsByChannel[chStr] = refs
          for (const id of idByIndex) if (id) twUsedIds.add(String(id))
          totSynced += synced; totSkipped += skipped
          // tripwire_id 决策 (单值兼容字段; 严格模式引擎走 refs 白名单, 此值仅回显):
          //   仅激活通道 (或通用模式单通道) 参与, 防多通道轮转时末位覆盖。
          if (chStr === activeRoiChannel.value || !roiStrictMode.value) {
            if (drawnTripwires.length === 1 && idByIndex[0]) {
              effectiveTripwireId = idByIndex[0]
            } else if (drawnTripwires.length > 1) {
              effectiveTripwireId = ''
            }
          }
          if (drawnTripwires.length > 1) {
            ElMessage.info(`通道 ${chStr} 已同步 ${synced} 条绊线 (共 ${drawnTripwires.length} 条, 规则不限具体绊线, 任一触发)`)
          }
        }
        // [ROI-PER-CHANNEL 2026-09-12] 严格模式: refs 回写通道包 (序列化段组装
        //   roi_shapes_by_channel 时读取; 无绊线绘制的通道保留回显 refs 不动)
        if (roiStrictMode.value) {
          for (const [ch, refs] of Object.entries(twRefsByChannel)) {
            const pack = roiByChannel.value[ch]
            if (pack) pack.tripwireRefs = refs
          }
        }
        // [FIX tw-route 2026-09-12] 画板 → 库 diff 清理 (跨通道): 本规则 namePrefix
        //   名下未出现在本次同步集合的残留删除 (画板删线/改名旧名/改绑通道旧通道),
        //   级联镜像对。算法页手工线名字不带规则名前缀, 不受影响。
        {
          const usedIds = twUsedIds
          const stalePfxs = new Set<string>([namePrefix])
          if (editRuleId.value && lastEditSource?.name && String(lastEditSource.name) !== form.name) {
            stalePfxs.add(`${String(lastEditSource.name)}_绊线`)
          }
          const mainByName = new Map<string, any>()
          for (const t of allTw) {
            if (String(t.channel_id_str || '').endsWith('_ch0')) continue
            mainByName.set(`${String(t.name)}|${String(t.algo_id || '')}|${String(t.channel_id_str || '').replace(/_ch\d+$/, '')}`, t)
          }
          const seen = new Set<string>()
          let cleanedTw = 0
          for (const t of allTw) {
            const nm = String(t.name || '')
            if (![...stalePfxs].some(p => nm === p || nm.startsWith(p + '_'))) continue
            const key = `${nm}|${String(t.algo_id || '')}|${String(t.channel_id_str || '').replace(/_ch\d+$/, '')}`
            if (seen.has(key)) continue
            const main = mainByName.get(key)
            if (main && usedIds.has(String(main.id))) continue  // 画板在用, 保留
            seen.add(key)
            try { await regionApi.deleteTripwire(Number(t.id)); cleanedTw++ } catch { /* 单条失败不阻断 */ }
          }
          if (cleanedTw > 0) ElMessage.info(`已清理 ${cleanedTw} 条画板外残留绊线`)
        }
        if (totSynced > 0) {
          ElMessage.success('绊线已同步到算法库 (插件最多 5 分钟自动加载)')
        }
        if (totSkipped > 0 && totSynced === 0 && totDrawn > 1) {
          ElMessage.info(`${totSkipped} 条绊线无变化, 未重复同步`)
        }
        tripwireOptions.value = []  // 失效缓存, 下次 focus 重新加载
    }
    // [ROI-SYNC 2026-09-08] 画板区域形状 → 镜像到算法区域库 (RegionStore):
    //   事件规则与算法配置此前双 SSOT 不互通 (规则画区域只存 roi_shapes_json,
    //   算法配置画板/插件判定/弹窗②回退链均看不到), 对齐绊线镜像先例 (上块)。
    //   detection/exclusion 直映射; rectangle 按 4 顶点多边形退化映射 detection
    //   (同引擎判定语义); point 关注点不镜像 (无判定语义)。
    //   防重: 按 name 匹配 — 命中且几何+类型一致跳过, 漂移则 upsert 更新
    //   (保留原 id/algo 形态, 避免重复堆积)。
    // [ROI-PER-CHANNEL 2026-09-12] 按 roiSyncUnits 逐通道展开 (与上方绊线同步同
    //   单元口径): 严格模式 → 每个已绘通道各自镜像+diff 清理; 通用模式 → 单
    //   unit (关联通道), 行为与旧版一致。algo_id 为规则级推导 (事件类型决定),
    //   移出循环多通道共享。
    if (rc.enabled) {
      // algo_id 推导: 覆盖率矩阵优先, 兜底事件类型裸短 id (与区域库存量形态一致,
      //   插件 getEffectiveRegions 兜底链两种形态均已兼容)
      await loadEventCoverage()
      let areaAlgoId = ''
      for (const et of form.conditions.eventType.config.types) {
        const c = eventCoverageMap.value[et]
        if (c?.algo_id) { areaAlgoId = c.algo_id; break }
      }
      if (!areaAlgoId && form.conditions.eventType.config.types.length > 0) {
        areaAlgoId = form.conditions.eventType.config.types[0]
      }
      const areaMulti = roiSyncUnits.length > 1
      for (const unit of roiSyncUnits) {
        const drawnAreas = unit.list.filter(r => r.is_active &&
          (r.roi_type === 'detection_zone' || r.roi_type === 'exclusion_zone' || r.roi_type === 'rectangle'))
        const areaChStr = String(unit.ch || '').replace(/_ch\d+$/, '')
        // [FIX roi-sync-delete 2026-09-11] 镜像补删除分支 (用户报告: 规则页删掉的区域
        //   跨页复活/删不掉最后 1 个): 原镜像只增不删 — 画板删掉的区域在 RegionStore
        //   永久残留, 算法配置页/布防判定/插件弹窗继续消费 = 「删除了还在弹」。
        //   现对齐算法页 onRegionsChange diff 先例: 保存时以画板名单为 SSOT,
        //   同通道同形态 (algo_id === areaAlgoId) 的孤儿区域一并清理;
        //   空画板保存 = 全清 (drawnAreas.length > 0 短路解除)。
        //   防误删: 仅清理规则镜像形态 (algo_id 精确等值), 算法页手工画的其他
        //   算法区域不动; 停用残留不查 (include_disabled 默认 false) 边界留待后续。
        if (drawnAreas.length > 0 && !areaChStr) {
          ElMessage.warning('画了区域但未选"关联通道", 区域未同步到算法库; 请选择通道后重新保存')
          continue
        }
        if (!areaChStr) continue
        try {
          // 现有区域 (str 主查+ch 回退去重后端已做; 不按 algo 过滤防双形态分裂)
          const exRes = await regionApi.listRegions({ channel_id: 0, channel_id_str: areaChStr })
          const existing: any[] = ((exRes as any)?.data?.data?.regions ?? (exRes as any)?.data?.regions ?? [])
          let synced = 0
          for (const area of drawnAreas) {
            const raw = area.polygon || []
            const polygon: [number, number][] = []
            for (let i = 0; i + 1 < raw.length; i += 2) polygon.push([raw[i], raw[i + 1]])
            if (polygon.length < 3) continue
            const regionType = area.roi_type === 'exclusion_zone' ? 'exclusion_zone' : 'detection_zone'
            const hit = existing.find(e => e.name === area.roi_name)
            const sameGeom = !!hit && Array.isArray(hit.polygon) && hit.polygon.length === polygon.length &&
              hit.polygon.every((p: any, i2: number) =>
                Math.abs(Number(p[0]) - polygon[i2][0]) < 0.001 && Math.abs(Number(p[1]) - polygon[i2][1]) < 0.001)
            if (sameGeom && hit.region_type === regionType) continue
            await regionApi.createRegion({
              id: hit?.id ?? 0,
              channel_id: hit?.channel_id ?? 0,
              channel_id_str: hit?.channel_id_str || areaChStr,
              algo_id: hit?.algo_id || areaAlgoId,
              name: area.roi_name,
              region_type: regionType,
              polygon,
              enabled: true,
            })
            synced++
          }
          // [FIX roi-sync-delete 2026-09-11] diff 清理: 画板名单外的同形态孤儿区域
          //   (含空画板全清路径 — 用户删掉最后 1 个后保存即真删, 跨页不再复活)
          const drawnNames = new Set(drawnAreas.map(a => a.roi_name))
          let cleaned = 0
          if (areaAlgoId) {
            for (const e of existing) {
              if (drawnNames.has(e.name)) continue
              if (e.algo_id !== areaAlgoId) continue
              try {
                await regionApi.deleteRegion(e.id)
                cleaned++
              } catch { /* 单个清理失败不阻断同步主链 */ }
            }
          }
          if (synced > 0 && cleaned > 0) ElMessage.success(areaMulti
            ? `通道 ${areaChStr}: 区域已同步 (${synced} 更新, ${cleaned} 清理)`
            : `区域已同步 (${synced} 更新, ${cleaned} 清理, 插件判定同几何)`)
          else if (cleaned > 0) ElMessage.success(areaMulti
            ? `通道 ${areaChStr}: 已清理 ${cleaned} 个画板已删除的区域`
            : `已同步清理 ${cleaned} 个画板已删除的区域`)
          else if (synced > 0) ElMessage.success(areaMulti
            ? `通道 ${areaChStr}: 区域已同步 (${synced} 个)`
            : `区域已同步 (${synced} 个, 插件判定同几何)`)
        } catch (e: any) {
          ElMessage.error(areaMulti
            ? `区域同步失败 (通道 ${areaChStr}): ${e?.message ?? e} (规则仍会保存, 算法库未更新)`
            : `区域同步失败: ${e?.message ?? e} (规则仍会保存, 算法库未更新)`)
        }
      }
    }
    // 清理 "全部XXX" 占位值，后端空字符串 = 不过滤
    const cleanLocation = (v: string) => (v && v.startsWith('全部') ? '' : v)
    const cleanGroup = (v: string) => (v && v.startsWith('全部') ? '' : v)
    // [FIX 2026-09-02] 画板形状序列化 (对标海康 iVMS 联动规则 ROI 持久化):
    //   roi_shapes_json = 画板全量形状快照 (类型/名称/启用/方向, 坐标归一化 [0,1]),
    //   供编辑回显 + 引擎多形状并集判定 (LinkageEngine matchRoiShapes)。
    //   同时修复两个历史 bug:
    //   ① 多 ROI flatMap 拼接 → 引擎 pointInPolygon 视为单个乱序大参边形(全错);
    //     现 roi_polygon 仅取第一个激活区域类形状 (兼容字段), 多形状判定走 roi_shapes_json;
    //   ② 坐标 [0,1920] 像素系直存 → 引擎 [ROI-UNIT-MISMATCH] pass-through (恒不拦截);
    //     现统一 /1920 /1080 归一化。
    const buildNormPoints = (poly: number[]): number[] => {
      const out: number[] = []
      for (let i = 0; i + 1 < poly.length; i += 2) {
        out.push(Math.round((poly[i] / 1920) * 10000) / 10000, Math.round((poly[i + 1] / 1080) * 10000) / 10000)
      }
      return out
    }
    // [ROI-GAP 2026-09-06] v2 形态: {combine:'union'|'intersection', shapes:[...]} —
    //   引擎 matchRoiShapes v2 解析 (组合语义可配, exclusion_zone 恒拦截);
    //   老数组 v1 形态仍被引擎/useAlarmShapes 兼容读取 (默认并集), 存量规则
    //   行为不变。
    const buildRoiShapesJson = (list: RoiData[]) => list.length === 0 ? '' : JSON.stringify({
      combine: rc.config.roiCombine === 'intersection' ? 'intersection' : 'union',
      shapes: list.map(r => ({
        shape: r.roi_type, name: r.roi_name, active: r.is_active,
        direction: r.direction || '', points: buildNormPoints(r.polygon),
      })),
    })
    // [ROI-PER-CHANNEL 2026-09-12] 逐通道条目序列化 (严格模式): 序列化集每通道一条
    //   {combine, shapes, tripwire_refs}; 引擎按事件通道基准码查表 (双形态归一),
    //   条目缺失 [ROI-PC-UNDRAWN] / shapes 空 [ROI-PC-EMPTY] → 不触发。
    //   已绘但后来全删的通道保留空条目 (回显通道列表不丢; 引擎等价不触发)。
    //   tripwire_refs: 仅绊线消费规则携带 (绊线同步段回写); 非绊线规则恒空 —
    //   防事件类型改绑后 stale refs 让 tripwire_id 为空的事件被白名单误拒
    //   (引擎: refs 非空但事件无 tripwire_id → reject)。
    //   非严格模式返回 '' (键缺席 = 通用模式, 引擎/存量规则零变更)。
    const buildChannelEntries = (): string => {
      if (!roiStrictMode.value) return ''
      const keys = [...roiSerializeKeys.value].filter(Boolean)
      if (keys.length === 0) return ''
      const out: Record<string, object> = {}
      for (const k of keys) {
        const isWork = k === activeRoiChannel.value
        const list = isWork ? rc.config.roiPolygon : (roiByChannel.value[k]?.list || [])
        const combine = isWork ? rc.config.roiCombine : (roiByChannel.value[k]?.combine || 'union')
        out[k] = {
          combine: combine === 'intersection' ? 'intersection' : 'union',
          shapes: list.filter(r => isTripwireRule.value || r.roi_type !== 'tripwire').map(r => ({
            shape: r.roi_type, name: r.roi_name, active: r.is_active,
            direction: r.direction || '', points: buildNormPoints(r.polygon),
          })),
          tripwire_refs: isTripwireRule.value
            ? (roiByChannel.value[k]?.tripwireRefs || []).map(x => ({
                id: String(x.id), direction: String(x.direction || '').toUpperCase(),
              }))
            : [],
        }
      }
      return JSON.stringify(out)
    }
    // 区域类形状 (组件级 AREA_ROI_TYPES: 引擎 pointInPolygon 判定);
    // 绊线走 tripwire_id 镜像链路, 关注点不做空间过滤
    const firstActiveArea = rc.config.roiPolygon.find(r => r.is_active && AREA_ROI_TYPES.includes(r.roi_type))
    // [AREA-CASCADE 2026-09-11] location 页签三级级联勾选集合并集写三键:
    //   area_id ← region.group 优先, 级联区域兑底 (单值键, 两入口不叠加);
    //   bound_channel_ids ← region 绑定多选 ∪ 级联通道勾选 (并集, 键名/形态不变);
    //   area_device_ids ← 级联设备勾选 (后端白名单暂丢弃, 真实持久化走 ui_state_json)
    const cascadeAreaId = lc.enabled ? areaCascadeAreaId.value : ''
    const cascadeChIds = lc.enabled ? [...areaCascadeChannelIds.value] : []
    const mergedBoundChannelIds = [...new Set([...(rc.config.boundChannelIds || []).map(String), ...cascadeChIds])]
    const spatial_cond = (rc.enabled || lc.enabled) ? {
      region_id: cleanLocation(rc.config.roi || ''),
      location_id: cleanLocation(lc.enabled ? (lc.config.point || rc.config.location) : (rc.config.location || '')),
      // [P1 2026-09-10 更名] 写新键 area_id (后端序列化双键镜像; 存量规则旧键双键读兼容)
      area_id: cleanGroup(rc.config.group || cascadeAreaId),
      // [vp9 2026-09-01] 显式绑定通道 (多选, 字符串形态与引擎侧双形态匹配兼容)
      bound_channel_ids: mergedBoundChannelIds,
      // [AREA-CASCADE 2026-09-11] 级联设备级勾选 (引擎不解析; ui_state_json 同步暂存往返)
      area_device_ids: (lc.enabled && cascadeAreaId) ? [...areaCascadeDeviceIds.value] : [] as string[],
      // [FIX 2026-09-02] 兼容字段: 第一个激活区域类形状 (归一化); 多形状并集见 roi_shapes_json
      roi_polygon: firstActiveArea ? buildNormPoints(firstActiveArea.polygon) : [] as number[],
      // [FIX 2026-09-02] 画板全量形状快照 (多形状并集判定 + 编辑回显 SSOT)
      // [FIX tw-route 2026-09-12] 非绊线消费事件剔除绊线残留形状 (快照自净:
      //   库内已清理, 快照保留会让下次保存"复活"上库)。
      // [ROI-PER-CHANNEL 2026-09-12] 严格模式: 本键冻结为通用基线 (旧二进制回滚
      //   读取 + "填充通用形状"来源); 逐通道判定走下一键。通用模式: 存量行为。
      roi_shapes_json: buildRoiShapesJson((roiStrictMode.value ? roiGeneralBaseline.value : rc.config.roiPolygon).filter(
        r => isTripwireRule.value || r.roi_type !== 'tripwire')),
      // [ROI-PER-CHANNEL 2026-09-12] 逐通道专属形状集 (海康式): 非空 = 严格模式
      //   (仅已绘通道触发, 引擎 [ROI-PC-UNDRAWN]/[ROI-PC-EMPTY]); 序列化集 =
      //   回显通道 ∪ 本次触碰通道。通用模式发空串 (键缺席语义 → 存量行为)。
      roi_shapes_by_channel: buildChannelEntries(),
      // [FIX 2026-08-27 P0-PERIMETER v3] tripwire 越界联动
      //   tripwireId 与 direction 都空 = 不启用 tripwire 过滤
      //   否则仅匹配的 tripwire + direction 才触发动作
      tripwire_id: effectiveTripwireId || '',
      direction: dirUpper,
    } : { region_id: '', location_id: '', area_id: '', roi_polygon: [] as number[], roi_shapes_json: '', roi_shapes_by_channel: '', tripwire_id: '', direction: '', bound_channel_ids: [] as string[], area_device_ids: [] as string[] }

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
    // [任务5] 事件源 / 设备过滤 关闭态: device_ids/channel_ids 设空数组 (不限维度生效)
    const source_cond = {
      channel_ids: esc.enabled ? numericChannels : [],
      device_ids: esc.enabled ? stringChannels : [],
      event_types,
      min_severity: etc.config.minSeverity,
      min_confidence: etc.config.minConfidence / 100,
      algorithm_ids: etc.config.types,
      // [FLOOR-MAP 2026-09-03] 适用平面图透传 (纯可视化, 引擎匹配零改动;
      //   后端 PUT contains 守卫 — toggleRule 只传 enabled 不丢绑定)
      map_ids: (form.mapIds || []).map(Number),
    }

    const mc = form.conditions.autoMerge
    const merge_cond = mc.enabled ? {
      enabled: true,
      window_ms: mc.config.windowMs,
      max_merge_count: mc.config.maxCount,
      merge_by: mc.config.dimension,
    } : { enabled: false, window_ms: 10000, max_merge_count: 10, merge_by: 'channel' }

    // [COND-PERSIST 2026-09-03] 前端 UI 态快照 (spatial_cond.ui_state_json 透传往返):
    //   cond enabled 精确状态 + ROI 快照通道 channelId + 事件源禁用时保留的勾选 +
    //   设备通道选择器完整值 — 后端白名单解析丢弃未知键, 此字段保证「保存 → 编辑」
    //   全字段原值回显 (resetEditorState 优先消费, 缺失回退内容推断, 兼容老规则)。
    //   与 spatial_cond 其他字段的 enabled 门控无关 (无条件全量写, 引擎不解析)
    const ui_state_json = JSON.stringify({
      v: 1,
      region: { enabled: rc.enabled, location: rc.config.location, channelId: rc.config.channelId },
      location: { enabled: lc.enabled, point: lc.config.point },
      eventSource: { enabled: esc.enabled, channels: [...esc.config.channels] },
      time: { enabled: tc.enabled },
      autoMerge: { enabled: mc.enabled },
      picker: { deviceIds: [...deviceChannelValue.value.deviceIds], channelIds: [...deviceChannelValue.value.channelIds] },
      // [AREA-CASCADE 2026-09-11] 级联态快照 (后端白名单丢弃 area_device_ids 的兑底持久化):
      //   保存 → 编辑全量回显 区域/设备勾选/通道勾选
      areaCascade: {
        areaId: areaCascadeAreaId.value,
        deviceIds: [...areaCascadeDeviceIds.value],
        channelIds: [...areaCascadeChannelIds.value],
      },
    })
    ;(spatial_cond as any).ui_state_json = ui_state_json // [COND-PERSIST] 运行时附加 (两分支字面量不侵入)

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
      // [r25] VLM 抑制阈值保留 (LinkageEngine.h:478 真实字段生效) + 删除 fusion_* 三个预留键
      //   后端 nlohmann 宽容解析不读 fusion_*, 字段沉冗; VLM 真用: LinkageEngine.cpp:3662
      //   `result.confidence >= rule.vlm_suppress_threshold` 才抑制
      vlm_suppress_threshold: vlmSuppressThreshold.value,
      // [P2-1] 治理字段提交: 关闭条件/响应时限
      close_condition: form.closeCondition || '',
      response_deadline_s: form.responseDeadlineS ?? 0,
      // [POPUP-AUTOCLOSE 2026-09-03] 提交弹窗自动关闭秒 (整数化, 钳位 >=0)
      popup_auto_close_s: Math.max(0, Math.floor(Number(form.popupAutoCloseS) || 0)),
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
    // [R6 P1-3 2026-09-12] 保存后反向联动已废除 (同 toggleRule): enabled 翻转即
    //   期望态变化, 算法行状态交 AlgoDeploymentReconciler 收敛
    drawerVisible.value = false
    fetchRules()
    return true
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '保存失败'
    ElMessage.error(msg)
    return false
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

// [STAGE1 P1-2 2026-09-10] 4 模板 chip 应用: 仅改 draft (start/end/weekdays),
//   启用时间条件开关, 不动 monthdays (留给用户按需选), 不触发保存。
function applyTimePreset(p: typeof TIME_PRESETS[number]) {
  form.conditions.time.enabled = true
  form.conditions.time.config.startTime = p.start
  form.conditions.time.config.endTime = p.end
  form.conditions.time.config.weekdays = [...p.weekdays]
  ElMessage.success(`已应用「${p.label}」模板 (草稿已更新, 点击「保存规则」后生效)`)
}

// [STAGE1 P1-2 2026-09-10] 当前 draft 是否与某预设一致 (用于 chip 高亮)
function isTimePresetActive(p: typeof TIME_PRESETS[number]): boolean {
  const cfg = form.conditions.time.config
  if (cfg.startTime !== p.start || cfg.endTime !== p.end) return false
  const a = [...cfg.weekdays].sort((x, y) => x - y)
  const b = [...p.weekdays].sort((x, y) => x - y)
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// ── [SCENE-EDIT-INPLACE 2026-09-03] 嵌入编辑模式 ──
// 宿主页 (五个场景 RulesView / AlgoConfigView) 就地渲染本组件并传 embedEditRuleId:
// 隐藏列表外壳, onMounted 深链自动打开该规则 choice 编辑入口 — 与平台行内编辑
// 同组件同表单同链路 (编辑器单一来源), 用户不离开当前页; 编辑抽屉链
// (choice 桥 + vp6 抽屉) 全部关闭时 emit edit-closed, 宿主卸载本实例并刷新列表
const props = defineProps<{ embedEditRuleId?: string }>()
const emit = defineEmits<{ (e: 'edit-closed'): void }>()
/** 嵌入编辑模式: 隐藏主外壳, 仅承载编辑抽屉链 */
const embedMode = computed(() => !!props.embedEditRuleId)
/** 深链已打开过编辑 (防初始 both-false 误触发 edit-closed) */
const embedStarted = ref(false)
watch([simpleDrawerOpen, drawerVisible], ([a, b]) => {
  if (embedMode.value && embedStarted.value && !a && !b) emit('edit-closed')
})

onMounted(() => {
  // [FLOOR-MAP 2026-09-03] 适用地图列/抽屉 options 预热 (30s TTL 缓存单例)
  loadFloorMaps().catch(() => {})
  // [校园二期 2026-08-30] 场景包 goRules 跳转预填 tag 过滤 (?tag=scene_pack)
  const route = useRoute()
  const qTag = route.query.tag
  if (!embedMode.value && qTag) tagFilter.value = [String(qTag)]
  // [SCENE-EDIT-UNIFY 2026-09-03] 场景页/算法页「编辑」入口; [SCENE-EDIT-INPLACE]
  //   改为嵌入模式就地渲染 (embedEditRuleId prop), 平台 ?editRuleId= 深链保留:
  //   规则列表加载完成后自动打开该规则编辑 (choice 三卡片 → 简易/高级卡片 →
  //   vp6 全功能表单), 与平台行内编辑同链路 — 编辑器单一来源
  const qEditRuleId = props.embedEditRuleId || route.query.editRuleId
  if (qEditRuleId) {
    // 防刷新重复打开: 清地址栏 query (仅平台 URL 深链; 嵌入模式无 query 可清)。注:
    // 不能用 router.replace — MainLayout 的 router-view 以 route.fullPath 为 :key,
    // 导航式清 query 会销毁重建本组件, 下述 watch 随之失效; history.replaceState
    // 不触发导航, key 不变
    if (!embedMode.value) {
      const cleaned = { ...route.query }
      delete cleaned.editRuleId
      const qs = new URLSearchParams(cleaned as Record<string, string>).toString()
      window.history.replaceState(window.history.state, '', route.path + (qs ? '?' + qs : ''))
    }
    const stopEditWatch = watch(rules, (list) => {
      if (!list.length) return // 首次赋值前/空列表继续等
      stopEditWatch()
      const row = list.find(r => r.id === qEditRuleId)
      if (row) {
        openSimpleEdit(row)
        embedStarted.value = true // 嵌入模式: 编辑链已启动, 全关后通知宿主卸载
      }
      else ElMessage.warning('未找到目标规则, 可能已被删除')
    })
  }
  fetchRules(); fetchOptions(); loadDeviceGroups()
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
/* ═══ [FLOOR-MAP 2026-09-04] 联动平面图位置动作面板 (华为 iVMS 楼层联动配置对标) ═══ */
.map-action-panel {
  margin-top: 12px;
  padding: 12px 12px 4px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-extra-light);
}
/* [FLOOR-MAP 2026-09-04] 常驻快捷卡头: switch + 标题 + 副说明 (一等入口) */
.map-action-head { display: flex; align-items: center; gap: 10px; }
.map-action-title { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.map-action-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.map-action-tip {
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.map-action-preview {
  height: 260px;
  border-radius: 4px;
  overflow: hidden;
}
.map-action-preview-empty {
  height: 260px;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
/* ── 页面容器 ── */
.linkage-page {
  /* padding: 20px 24px; */
  /* max-width: var(--content-max-width, 1440px); */
  /* margin: 0 auto; */
  animation: fadeIn 0.3s ease;

}

/* ── 主页面 Tabs ── */
.main-tabs :deep(.el-tabs__content) { padding: 16px; overflow: visible; }
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
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
/* [任务5] 启用态: 左边框高亮 + 微阴影, 作为明确视觉反馈 */
.condition-card.is-enabled { border-left: 3px solid #67c23a; box-shadow: 0 0 0 1px rgba(103,194,58,0.08); }
.cond-header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px; cursor: pointer;
  transition: background 0.2s ease;
}
.cond-header:hover { background: rgba(255,255,255,0.02); }
.cond-title { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.cond-icon { font-size: 14px; }
.cond-label { font-size: 13px; font-weight: 600; }
/* [任务5] 开关区域: 「全部 / switch / 单个设备」 水平布局 */
.cond-switch-zone { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 2px 8px; border: 1px solid var(--app-border); border-radius: 6px; background: var(--el-fill-color-extra-light); cursor: pointer; }
.cond-switch-label { font-size: 12px; font-weight: 600; color: var(--el-color-primary); min-width: 36px; text-align: center; }
/* [FIX 2026-09-02] 事件类型核心条件卡: 头部不可折叠, 移除手型/hover */
.cond-header.is-static { cursor: default; }
.cond-header.is-static:hover { background: transparent; }
.cond-arrow { font-size: 12px; color: var(--app-text-secondary); transition: transform 0.25s ease, color 0.2s ease; flex: 0 0 auto; }
.cond-arrow.is-rotated { transform: rotate(180deg); color: var(--el-color-primary); }
/* [任务5] 展开/收起过渡 */
.cond-body { padding: 8px 12px 12px; border-top: 1px solid var(--app-border); animation: condExpand 0.22s ease-out; }
@keyframes condExpand {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cond-form-item { margin-bottom: 8px; }
.cond-hint { font-size: 12px; color: var(--app-text-secondary); margin-bottom: 6px; }
/* [AREA-CASCADE 2026-09-11] location 三级级联树 (视觉对齐 LiveView live-tree) */
.cascade-tree :deep(.el-tree-node__content) { height: 28px; border-radius: 6px; margin-bottom: 1px; }
.cascade-tree :deep(.el-tree-node__content:hover) { background: var(--el-fill-color-light); }
.cascade-tree :deep(.el-tree__empty-block) { background: transparent; color: var(--el-text-color-secondary); }
.casc-node { display: flex; align-items: center; gap: 6px; min-width: 0; }
.casc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.is-rotated { transform: rotate(180deg); }

/* ── 星期/事件/通道网格 ── */
.weekdays { margin-top: 8px; }
.monthdays { margin-top: 8px; }
.cond-sub-label { font-size: 12px; color: var(--app-text-secondary); display: block; margin-bottom: 4px; }
.event-type-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.event-type-group { width: 100%; margin-bottom: 4px; }
.event-type-group__title { font-size: 11px; font-weight: 600; color: var(--color-primary-400, #3B82F6); margin-bottom: 2px; padding: 2px 0; }
.channel-grid { display: flex; flex-wrap: wrap; gap: 4px; }

/* ── [STAGE1 P1-2 2026-09-10] 布防时段快速模板 chip ── */
.time-presets { margin-top: 8px; }
.time-preset-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.time-preset-chip {
  cursor: pointer;
  user-select: none;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.time-preset-chip:hover { background-color: var(--el-color-primary-light-9, #ecf5ff); }
.time-preset-chip.is-active {
  background-color: var(--el-color-primary-light-8, #d9ecff);
  color: var(--el-color-primary, #409eff);
  border-color: var(--el-color-primary-light-5, #a0cfff);
}

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
/* [R6 P1-4 2026-09-12] event-coverage 三档标注 (B VLM 兜底标签 / C 预留位灰字) */
.tier-tag-b { margin-left: 4px; transform: scale(0.9); }
.tier-hint-c {
  margin-left: 4px; font-size: 11px;
  color: var(--el-text-color-placeholder, #A8ABB2);
}
.reserved-event-alert { margin-top: 6px; }

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

/* ── [vp7 向导 2026-09-01] 步骤条工具栏 ── */
.wizard-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 8px 10px; background: var(--el-fill-color-extra-light); border-radius: 6px; }
/* [vp8 双模式] 新建 split-button: 主区简易/下拉高级 */
.new-rule-split .new-rule-label { display: inline-flex; align-items: center; gap: 4px; }
.wizard-bar :deep(.el-step__title) { font-size: 12px; }

/* ── 抽屉底部 ── */
.drawer-footer { display: flex; justify-content: flex-end; gap: 12px; }

/* ── 辅助 ── */
.text-center { text-align: center; }
.text-secondary { color: var(--app-text-secondary); font-size: 13px; }

/* ── 调试控制台统计卡片 ── */
.debug-stat { text-align: center; }
.debug-stat-val { font-size: 28px; font-weight: 700; line-height: 1.2; }
.debug-stat-label { font-size: 12px; color: #909399; margin-top: 4px; }

/* ── [pw-in-rule 2026-09-12] 尾随通道: 已保存列表 + 迁移行 ── */
.pw-list { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto; }
.pw-list__item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--el-fill-color-light, #f5f7fa); border-radius: 4px; }
.pw-toolbar-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.pw-mig-hint { font-size: 12px; color: #909399; }

/* ── [ROI-PER-CHANNEL 2026-09-12] 逐通道绘制页签/工具栏 (海康式多通道 ROI) ── */
.roi-ch-tabs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.roi-ch-tabs__label { font-size: 12px; color: var(--app-text-secondary); }
.roi-ch-tag { cursor: pointer; user-select: none; }
.roi-ch-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.roi-ch-hint { font-size: 12px; color: var(--app-text-secondary); }
</style>
