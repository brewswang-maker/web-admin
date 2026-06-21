<template>
  <div class="linkage-page">
    <!-- ===== 主页面 Tabs ===== -->
    <el-tabs v-model="mainTab" type="border-card" class="main-tabs">
    <el-tab-pane label="联动规则" name="rules">

    <!-- ===== 统计卡片 ===== -->
    <el-row :gutter="16" class="stat-row">
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
            <el-option label="全部" :value="undefined as any" />
            <el-option label="已启用" :value="true" />
            <el-option label="已停用" :value="false" />
          </el-select>
          <el-select v-model="sortBy" style="width: 140px" @change="fetchRules">
            <el-option label="优先级排序" value="priority" />
            <el-option label="创建时间" value="created_at" />
            <el-option label="更新时间" value="updated_at" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <template v-if="selectedRows.length > 0">
            <el-button type="success" size="small" @click="handleBatchToggle(true)">
              批量启用 ({{ selectedRows.length }})
            </el-button>
            <el-button type="warning" size="small" @click="handleBatchToggle(false)">批量停用</el-button>
            <el-button type="danger" size="small" @click="handleBatchDelete">批量删除</el-button>
          </template>
          <el-button @click="showLogDialog = true">
            <el-icon><Document /></el-icon>执行日志
          </el-button>
          <el-button @click="openTemplateLibrary">
            <el-icon><CopyDocument /></el-icon>模板库
          </el-button>
          <el-button type="primary" @click="openEditor(null)">
            <el-icon><Plus /></el-icon>新建规则
          </el-button>
        </div>
      </div>
    </el-card>

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
        <el-table-column prop="name" label="规则名称" min-width="180">
          <template #default="{ row }">
            <div class="rule-name-cell">
              <span class="rule-name">{{ row.name }}</span>
              <el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain" class="priority-tag">P{{ row.priority }}</el-tag>
              <el-tag v-for="tag in (row.tags || [])" :key="tag" size="small" type="info" effect="plain" style="margin-left: 2px">{{ tag }}</el-tag>
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
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEditor(row)">编辑</el-button>
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
                <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" style="margin-top: 6px" />
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
                  <el-checkbox-group v-model="form.conditions.time.config.weekdays">
                    <el-checkbox v-for="d in weekdays" :key="d.value" :label="d.label" :value="d.value" size="small" />
                  </el-checkbox-group>
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
                  <RoiPolygonEditor v-model="form.conditions.region.config.roiPolygon" :background-image-url="roiBackgroundUrl" :canvas-width="440" :canvas-height="248" />
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
                <el-checkbox-group v-model="form.conditions.eventType.config.types" class="event-type-grid" v-loading="optionsLoading">
                  <template v-if="eventTypeOptions.length > 0">
                    <div v-for="(group, cat) in eventTypeGrouped" :key="cat" class="event-type-group">
                      <div class="event-type-group__title">{{ cat }}</div>
                      <el-checkbox v-for="et in group" :key="et.value" :label="et.label" :value="et.value" size="small" />
                    </div>
                  </template>
                  <template v-else>
                    <el-checkbox v-for="et in fallbackEventTypes" :key="et" :label="et" :value="et" size="small" />
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

    <!-- ===== 执行日志弹窗 ===== -->
    <el-dialog v-model="showLogDialog" title="联动执行日志" width="960px" destroy-on-close @open="fetchLogs">
      <el-tabs v-model="logViewMode" style="margin-bottom: 12px">
        <el-tab-pane label="表格视图" name="table" />
        <el-tab-pane label="时间线" name="timeline" />
      </el-tabs>
      <!-- 表格视图 -->
      <div v-if="logViewMode === 'table'">
        <el-table :data="logs" stripe v-loading="logLoading" size="small">
          <el-table-column prop="trigger_at" label="触发时间" width="170">
            <template #default="{ row }"><span class="time-text">{{ formatTime(row.trigger_at) }}</span></template>
          </el-table-column>
          <el-table-column prop="rule_name" label="规则" width="140" />
          <el-table-column prop="event_type" label="事件类型" width="100" />
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
      <!-- 时间线视图 -->
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
          <el-table-column prop="rule_name" label="规则名称" min-width="120" />
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
          <el-table-column prop="match_reason" label="原因" min-width="120" />
        </el-table>
        <div v-if="dryRunResult.simulated_actions?.length" style="margin-top: 12px">
          <div style="font-weight: 600; margin-bottom: 8px">将触发的动作:</div>
          <el-tag v-for="a in dryRunResult.simulated_actions" :key="a" type="success" effect="plain" style="margin: 2px">{{ a }}</el-tag>
        </div>
      </template>
      <template #footer><el-button @click="showDryRunDialog = false">关闭</el-button></template>
    </el-dialog>

    <!-- ===== 模板库对话框 ===== -->
    <el-dialog v-model="showTemplateDialog" title="规则模板库" width="820px" destroy-on-close>
      <div v-loading="templateLoading">
        <div v-for="(group, cat) in templatesByCategory" :key="cat" style="margin-bottom: 20px">
          <div style="font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #303133; border-left: 3px solid #6366F1; padding-left: 8px">{{ cat }}</div>
          <el-row :gutter="12">
            <el-col :span="8" v-for="tmpl in group" :key="tmpl.template_id">
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
                <el-button type="primary" size="small" @click="applyTemplate(tmpl)" style="width: 100%">一键应用</el-button>
              </el-card>
            </el-col>
          </el-row>
        </div>
        <el-empty v-if="!templateLoading && Object.keys(templatesByCategory).length === 0" description="暂无规则模板" />
      </div>
    </el-dialog>

    <!-- ===== 时段模板管理对话框 ===== -->
    <el-dialog v-model="showTimeTemplateDialog" title="布防时段模板管理" width="600px" destroy-on-close>
      <TimeTemplateEditor @apply="applyTimeTemplate" />
    </el-dialog>

    </el-tab-pane><!-- end 联动规则 -->

    <!-- ==================== 预案管理 Tab ==================== -->
    <el-tab-pane label="预案管理" name="plans">
      <div class="tab-toolbar">
        <el-button type="primary" size="small" @click="openPlanEditor(null)">+ 新建预案</el-button>
        <el-button size="small" @click="fetchPlans">刷新</el-button>
      </div>
      <el-table :data="plans" stripe v-loading="plansLoading" size="small" style="margin-top: 12px">
        <el-table-column prop="plan_id" label="ID" width="140" />
        <el-table-column prop="name" label="名称" width="160" />
        <el-table-column prop="description" label="描述" min-width="180" />
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
        <el-table-column prop="name" label="名称" width="180" />
        <el-table-column prop="description" label="描述" min-width="180" />
        <el-table-column label="操作符" width="100">
          <template #default="{ row }">
            <el-tag v-for="s in (row.steps || []).slice(0, 2)" :key="s.step_id" size="small" style="margin: 1px">{{ opLabel(s.op) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="窗口" width="100">
          <template #default="{ row }">{{ (row.window_ms / 1000).toFixed(0) }}s</template>
        </el-table-column>
        <el-table-column prop="output_event_type" label="输出事件" width="160" />
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
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Search, Plus, Document, Link, Bell, Setting, ArrowDown } from '@element-plus/icons-vue'
import { linkageApi, ACTION_TYPE_MAP, ACTION_TYPE_REVERSE_MAP, getTargetForActionType } from '@/api/linkage'
import type { LinkageRule, LinkageAction, LinkageLog, TimeTemplate, LinkagePlan, CEPPattern, ConditionNode } from '@/api/linkage'
import { useLinkageOptions } from '@/composables/useLinkageOptions'
import RoiPolygonEditor from '@/components/RoiPolygonEditor.vue'
import TimeTemplateEditor from '@/components/TimeTemplateEditor.vue'
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

// 动态选项 (从后端加载)
const { eventTypeOptions, eventTypeGrouped, channelOptions: channelOptionsDynamic, locationOptions: locationOptionsDynamic, loading: optionsLoading, fetchOptions } = useLinkageOptions()

// 静态回退选项
const fallbackEventTypes = ['周界入侵', '绊线', '烟火', '安全帽', '人脸', '车牌', '人群', '摔倒']
const fallbackChannelOptions: string[] = [] // 已移除虚假静态通道，避免规则无法触发
const roiOptions = ['全部区域', '周界线A', '绊线B', '区域C']
const groupOptions = ['全部分组', '东区摄像头', '室内摄像头', '室外摄像头']

// ROI 编辑器背景快照
const roiBackgroundUrl = ref('')
async function loadChannelSnapshot(channelId: string) {
  if (!channelId) { roiBackgroundUrl.value = ''; return }
  try {
    const res = await fetch(`/api/v1/channels/${channelId}/snapshot`, { credentials: 'include' })
    if (res.ok) {
      const blob = await res.blob()
      roiBackgroundUrl.value = URL.createObjectURL(blob)
    } else {
      roiBackgroundUrl.value = ''
    }
  } catch { roiBackgroundUrl.value = '' }
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
const enabledFilter = ref<boolean | undefined>(undefined)
const sortBy = ref('priority')
const sortOrder = ref<'ascending' | 'descending'>('descending')
const selectedRows = ref<LinkageRule[]>([])
const tagFilter = ref<string[]>([])

const allTags = computed(() => {
  const tagSet = new Set<string>()
  for (const r of rules.value) {
    for (const t of r.tags || []) tagSet.add(t)
  }
  return Array.from(tagSet).sort()
})

const filteredRules = computed(() => {
  let list = [...rules.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q))
  }
  if (enabledFilter.value !== undefined) list = list.filter(r => r.enabled === enabledFilter.value)
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
    time: { enabled: false, config: { startTime: '08:00', endTime: '20:00', weekdays: [1, 2, 3, 4, 5] } },
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
  conditions: defaultConditions(),
})

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

// ── 日志状态 ──

const showLogDialog = ref(false)
const logs = ref<LinkageLog[]>([])
const logLoading = ref(false)
const logPage = ref(1)
const logPageSize = ref(20)
const logTotal = ref(0)
const logViewMode = ref('table')

// ── 参数弹窗 ──

const paramDialogVisible = ref(false)
const paramDialogTitle = ref('')
const currentParamAction = ref('')
const paramActionCategory = ref('generic')

const paramForm = reactive({
  channel_id: '',
  device_id: '',
  delay_ms: 0,
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
  if (sc && (sc.region_id || sc.location_id || sc.device_group_id || sc.roi_polygon?.length))
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
    const res = await linkageApi.getRules()
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
      enabled: !!(tc.time_start || tc.time_end || tc.weekdays?.length),
      config: { startTime: tc.time_start || '08:00', endTime: tc.time_end || '20:00', weekdays: tc.weekdays || [1, 2, 3, 4, 5] },
    }
    // spatial_cond → region + location
    const sc = rule.spatial_cond || {} as any
    const hasSpatial = !!(sc.region_id || sc.location_id || sc.device_group_id || sc.roi_polygon?.length)
    form.conditions.region = {
      enabled: hasSpatial,
      config: { location: sc.location_id || '', roi: sc.region_id || '', group: sc.device_group_id || '', roiPolygon: [] as RoiData[], channelId: '' },
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
      config: { channels: [...(src.channel_ids || []).map(String), ...(src.device_ids || [])] },
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
  Object.keys(actionState).forEach(k => delete actionState[k])
  Object.keys(actionParams).forEach(k => delete actionParams[k])
  if (rule?.actions) {
    for (const a of rule.actions) {
      const typeStr = ACTION_TYPE_REVERSE_MAP[a.type]
      if (typeStr) {
        actionState[typeStr] = a.enabled
        // 提取参数 (排除 type/target/name/enabled 等元数据字段)
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

  saving.value = true
  try {
    // 构建 conditions: 内部 6 条件 → 后端 4 条件
    const tc = form.conditions.time
    const time_cond = tc.enabled ? {
      time_start: tc.config.startTime,
      time_end: tc.config.endTime,
      weekdays: tc.config.weekdays,
      monthdays: [] as number[],
    } : { time_start: '', time_end: '', weekdays: [] as number[], monthdays: [] as number[] }

    const rc = form.conditions.region
    const lc = form.conditions.location
    // 清理 "全部XXX" 占位值，后端空字符串 = 不过滤
    const cleanLocation = (v: string) => (v && v.startsWith('全部') ? '' : v)
    const cleanGroup = (v: string) => (v && v.startsWith('全部') ? '' : v)
    const spatial_cond = (rc.enabled || lc.enabled) ? {
      region_id: cleanLocation(rc.config.roi || ''),
      location_id: cleanLocation(lc.enabled ? (lc.config.point || rc.config.location) : (rc.config.location || '')),
      device_group_id: cleanGroup(rc.config.group || ''),
      roi_polygon: rc.config.roiPolygon.flatMap((r: RoiData) => r.polygon) || [] as number[],
    } : { region_id: '', location_id: '', device_group_id: '', roi_polygon: [] as number[] }

    const etc = form.conditions.eventType
    const esc = form.conditions.eventSource
    // 提取 alarm type (从算法 ID 最后一部分)
    const event_types = etc.config.types.map(id => { const p = id.split('.'); return p[p.length - 1] || id })
    // 通道分类: 纯数字 ID → channel_ids (int32), 字符串 ID → device_ids
    const numericChannels: number[] = []
    const stringChannels: string[] = []
    for (const c of esc.config.channels) {
      const n = parseInt(c, 10)
      if (!isNaN(n) && String(n) === c.trim()) numericChannels.push(n)
      else stringChannels.push(c)
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

async function openTemplateLibrary() {
  showTemplateDialog.value = true
  templateLoading.value = true
  try {
    const res = await linkageApi.getRuleTemplates()
    const data = (res as any)?.data?.data ?? (res as any)?.data ?? []
    templateList.value = Array.isArray(data) ? data : []
  } catch {
    templateList.value = []
  } finally { templateLoading.value = false }
}

async function applyTemplate(tmpl: any) {
  try {
    await ElMessageBox.confirm(`确定从模板「${tmpl.name}」创建新规则?`, '应用模板', { type: 'info' })
    const res = await linkageApi.applyRuleTemplate(tmpl.template_id, tmpl.name)
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
    let success = 0
    let failed = 0
    for (const row of selectedRows.value) {
      try { await linkageApi.deleteRule(row.id); success++ }
      catch { failed++ }
    }
    if (failed > 0) ElMessage.warning(`已删除 ${success} 条，失败 ${failed} 条`)
    else ElMessage.success(`已删除 ${success} 条规则`)
    selectedRows.value = []
    fetchRules()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('批量删除失败')
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

// ── 时段模板 ──

function applyTimeTemplate(tmpl: TimeTemplate) {
  form.conditions.time.enabled = true
  form.conditions.time.config.startTime = tmpl.time_start || '08:00'
  form.conditions.time.config.endTime = tmpl.time_end || '20:00'
  form.conditions.time.config.weekdays = [...(tmpl.weekdays || [1, 2, 3, 4, 5])]
  showTimeTemplateDialog.value = false
  ElMessage.success('已应用时段模板: ' + tmpl.name)
}

onMounted(() => {
  fetchRules(); fetchOptions()
  if (mainTab.value === 'plans') fetchPlans()
  if (mainTab.value === 'cep') fetchCEPPatterns()
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
  padding: 20px 24px;
  max-width: var(--content-max-width, 1440px);
  margin: 0 auto;
  animation: fadeIn 0.3s ease;
}

/* ── 主页面 Tabs ── */
.main-tabs :deep(.el-tabs__content) { padding: 16px 0 0 0; overflow: visible; }
.main-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.main-tabs :deep(.el-tabs__nav-wrap::after) { height: 0; }
.tab-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }

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
.rule-name-cell { display: flex; align-items: center; gap: 8px; }
.rule-name { font-weight: 600; }
.priority-tag { font-family: var(--font-mono); font-size: 11px; }

/* ── 条件标签 ── */
.condition-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.cond-tag { font-size: 11px; }
.action-count { font-size: 13px; color: var(--app-text-secondary); }

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
.event-type-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.event-type-group { width: 100%; margin-bottom: 4px; }
.event-type-group__title { font-size: 11px; font-weight: 600; color: var(--color-primary-400, #3B82F6); margin-bottom: 2px; padding: 2px 0; }
.channel-grid { display: flex; flex-wrap: wrap; gap: 4px; }

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
</style>
