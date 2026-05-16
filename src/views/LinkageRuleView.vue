<template>
  <div class="linkage-page">
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
            <el-option label="创建时间" value="createdAt" />
            <el-option label="更新时间" value="updatedAt" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <el-button @click="showLogDialog = true">
            <el-icon><Document /></el-icon>执行日志
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
        :default-sort="{ prop: sortBy, order: sortOrder }" @sort-change="handleSortChange">
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
            </div>
          </template>
        </el-table-column>
        <el-table-column label="触发条件" min-width="200">
          <template #default="{ row }">
            <div class="condition-tags">
              <el-tag v-for="c in (row.conditions || []).filter((c: any) => c.enabled)" :key="c.type" size="small" effect="plain" class="cond-tag">{{ conditionLabel(c.type) }}</el-tag>
              <span v-if="!(row.conditions || []).length" class="text-secondary">无条件</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="联动动作" min-width="180">
          <template #default="{ row }">
            <span v-if="(row.actions || []).length" class="action-count">⚡ {{ row.actions.filter((a: any) => a.enabled).length }} 项动作</span>
            <span v-else class="text-secondary">无动作</span>
          </template>
        </el-table-column>
        <el-table-column prop="cooldownMs" label="冷却时间" width="100" align="center">
          <template #default="{ row }">
            <span class="text-secondary">{{ row.cooldownMs ? (row.cooldownMs >= 1000 ? (row.cooldownMs / 1000) + 's' : row.cooldownMs + 'ms') : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="170" sortable="custom">
          <template #default="{ row }">
            <span class="time-text">{{ formatTime(row.updatedAt) }}</span>
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
        <el-form :model="form" label-position="top" size="default">
          <el-form-item label="规则名称" required>
            <el-input v-model="form.name" placeholder="例: 周界入侵联动" />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="优先级 (1-100)">
                <el-input-number v-model="form.priority" :min="1" :max="100" :step="5" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="冷却时间(ms)">
                <el-input-number v-model="form.cooldownMs" :min="1000" :max="60000" :step="1000" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">📋 触发条件</el-divider>

          <!-- 条件卡片 -->
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
              </template>

              <!-- 空间条件 -->
              <template v-if="cond.type === 'region'">
                <el-form-item label="物理位置" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.location" placeholder="选择位置" style="width: 100%"><el-option v-for="l in locationOptions" :key="l" :label="l" :value="l" /></el-select>
                </el-form-item>
                <el-form-item label="ROI区域" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.roi" placeholder="选择区域" style="width: 100%"><el-option v-for="r in roiOptions" :key="r" :label="r" :value="r" /></el-select>
                </el-form-item>
                <el-form-item label="设备分组" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.region.config.group" placeholder="选择分组" style="width: 100%"><el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" /></el-select>
                </el-form-item>
              </template>

              <!-- 位置条件 -->
              <template v-if="cond.type === 'location'">
                <el-form-item label="监控位置" label-position="top" class="cond-form-item">
                  <el-select v-model="form.conditions.location.config.point" placeholder="选择位置" style="width: 100%"><el-option v-for="l in locationOptions" :key="l" :label="l" :value="l" /></el-select>
                </el-form-item>
              </template>

              <!-- 事件类型 -->
              <template v-if="cond.type === 'eventType'">
                <el-checkbox-group v-model="form.conditions.eventType.config.types" class="event-type-grid">
                  <el-checkbox v-for="et in eventTypes" :key="et" :label="et" :value="et" size="small" />
                </el-checkbox-group>
                <el-row :gutter="16" style="margin-top: 12px">
                  <el-col :span="12">
                    <el-form-item label="最低严重度" label-position="top" class="cond-form-item">
                      <el-select v-model="form.conditions.eventType.config.minSeverity" style="width: 100%">
                        <el-option label="1-提示" :value="1" /><el-option label="2-低" :value="2" /><el-option label="3-中" :value="3" /><el-option label="4-高" :value="4" /><el-option label="5-紧急" :value="5" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="最低置信度" label-position="top" class="cond-form-item">
                      <el-slider v-model="form.conditions.eventType.config.minConfidence" :min="10" :max="100" :step="5" show-input size="small" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </template>

              <!-- 事件源 -->
              <template v-if="cond.type === 'eventSource'">
                <p class="cond-hint">选择通道 (留空=全部)</p>
                <el-checkbox-group v-model="form.conditions.eventSource.config.channels" class="channel-grid">
                  <el-checkbox v-for="ch in channelOptions" :key="ch" :label="ch" :value="ch" size="small" />
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

          <el-divider content-position="left">⚡ 联动动作</el-divider>

          <!-- 动作 Tabs -->
          <el-tabs v-model="activeActionTab" type="card" class="action-tabs">
            <el-tab-pane label="🖥️ 客户端" name="client">
              <div v-for="group in clientActionGroups" :key="group.label" class="action-group">
                <div class="action-group-title">{{ group.label }}</div>
                <div v-for="act in group.items" :key="act.type" class="action-row">
                  <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                  <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">⚙️</el-button>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="🌐 Web端" name="web">
              <div v-for="act in webActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">⚙️</el-button>
              </div>
            </el-tab-pane>
            <el-tab-pane label="📱 APP" name="app">
              <div v-for="act in appActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">⚙️</el-button>
              </div>
            </el-tab-pane>
            <el-tab-pane label="💬 小程序" name="mp">
              <div v-for="act in mpActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">⚙️</el-button>
              </div>
            </el-tab-pane>
            <el-tab-pane label="⚙️ 系统" name="system">
              <div v-for="act in sysActions" :key="act.type" class="action-row">
                <el-checkbox v-model="actionState[act.type]" @change="onActionToggle(act.type)">{{ act.icon }} {{ act.label }}</el-checkbox>
                <el-button v-if="actionState[act.type]" size="small" link type="primary" @click="openActionParams(act)">⚙️</el-button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-form>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">💾 保存规则</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ===== 动作参数弹窗 ===== -->
    <el-dialog v-model="paramDialogVisible" :title="paramDialogTitle" width="480px" destroy-on-close append-to-body>
      <el-form :model="paramForm" label-position="top">
        <el-form-item label="通道/设备">
          <el-select v-model="paramForm.channelId" placeholder="选择通道" style="width: 100%"><el-option v-for="ch in channelOptions" :key="ch" :label="ch" :value="ch" /></el-select>
        </el-form-item>
        <el-form-item label="持续时长(秒)">
          <el-input-number v-model="paramForm.duration" :min="1" :max="3600" style="width: 100%" />
        </el-form-item>
        <el-form-item label="自定义参数 (JSON)">
          <el-input v-model="paramForm.extra" type="textarea" :rows="4" placeholder='{"key": "value"}' />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="paramDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveActionParams">确定</el-button>
      </template>
    </el-dialog>

    <!-- ===== 执行日志弹窗 ===== -->
    <el-dialog v-model="showLogDialog" title="联动执行日志" width="900px" destroy-on-close>
      <el-table :data="logs" stripe v-loading="logLoading" size="small">
        <el-table-column prop="triggeredAt" label="触发时间" width="170">
          <template #default="{ row }"><span class="time-text">{{ formatTime(row.triggeredAt) }}</span></template>
        </el-table-column>
        <el-table-column prop="ruleName" label="规则" width="140" />
        <el-table-column prop="eventType" label="事件类型" width="100" />
        <el-table-column prop="channelName" label="通道" width="100" />
        <el-table-column label="执行动作" min-width="180">
          <template #default="{ row }">
            <el-tag v-for="a in (row.actionsExecuted || []).slice(0, 3)" :key="a" size="small" effect="plain" style="margin: 2px">{{ a }}</el-tag>
            <span v-if="(row.actionsExecuted || []).length > 3" class="text-secondary">+{{ row.actionsExecuted.length - 3 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="结果" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.result === 'success' ? 'success' : row.result === 'partial' ? 'warning' : 'danger'" size="small">
              {{ row.result === 'success' ? '成功' : row.result === 'partial' ? '部分' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrap" v-if="logTotal > logPageSize">
        <el-pagination v-model:current-page="logPage" v-model:page-size="logPageSize" :total="logTotal" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" background small @change="fetchLogs" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Document, Link, Bell, Setting, ArrowDown } from '@element-plus/icons-vue'
import { linkageApi } from '@/api/linkage'
import type { LinkageRule, LinkageLog } from '@/api/linkage'

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
const eventTypes = ['周界入侵', '绊线', '烟火', '安全帽', '人脸', '车牌', '人群', '摔倒']
const locationOptions = ['全部位置', '3号厂区', '东围墙', '2号车间', '1号大门']
const roiOptions = ['全部区域', '周界线A', '绊线B', '区域C']
const groupOptions = ['全部分组', '东区摄像头', '室内摄像头', '室外摄像头']
const channelOptions = ['CH01', 'CH02', 'CH03', 'CH04', 'CH05', 'CH06', 'CH07', 'CH08']

const clientActionGroups = [
  { label: '📹 视频联动', items: [
    { type: 'CLIENT_SHOW_LIVE', icon: '📹', label: '弹出指定监控点实时视频' },
    { type: 'CLIENT_SHOW_PLAYBACK', icon: '📼', label: '弹出指定监控点录像回放' },
    { type: 'CLIENT_SHOW_IMAGE', icon: '🖼️', label: '弹出事件图片' },
    { type: 'CLIENT_OVERLAY_INFO', icon: '📋', label: '弹窗视频画面叠加事件信息' },
  ]},
  { label: '🔊 音频联动', items: [
    { type: 'CLIENT_VOICE_TALK', icon: '🎙️', label: '控制指定对讲通道语音对讲' },
    { type: 'CLIENT_PLAY_TONE', icon: '🔔', label: '播放提示音' },
    { type: 'CLIENT_TTS_BROADCAST', icon: '📢', label: '语音播报事件信息 (重复N次)' },
  ]},
  { label: '📺 显示联动', items: [
    { type: 'CLIENT_SHOW_MAP', icon: '🗺️', label: '联动地图位置' },
    { type: 'CLIENT_TV_WALL', icon: '🖥️', label: '指定监控点上电视墙 (持续N秒)' },
    { type: 'CLIENT_SUPPRESS_POPUP', icon: '🔇', label: '发生预警不弹窗 (静默)' },
    { type: 'CLIENT_EXECUTE_PLAN', icon: '📋', label: '执行事件处理预案' },
  ]},
  { label: '📹 录像与抓图', items: [
    { type: 'CLIENT_RECORD_EVENT', icon: '🎥', label: '指定监控点事件录像' },
    { type: 'CLIENT_ADD_BOOKMARK', icon: '🔖', label: '添加录像标记 (类型+描述)' },
    { type: 'CLIENT_CAPTURE_IMAGE', icon: '📸', label: '间隔N秒抓图M次' },
  ]},
  { label: '🎮 设备控制', items: [
    { type: 'CLIENT_ALARM_OUTPUT', icon: '🚨', label: '控制指定报警输出' },
    { type: 'CLIENT_PTZ_CONTROL', icon: '🎮', label: '控制云台' },
    { type: 'CLIENT_PTZ_PRESET_START', icon: '📍', label: '事件开始转到预置点' },
    { type: 'CLIENT_PTZ_PRESET_END', icon: '🔙', label: '事件结束恢复到预置点' },
    { type: 'CLIENT_PTZ_CRUISE', icon: '🔄', label: '调用巡航路径' },
    { type: 'CLIENT_PTZ_TRACK', icon: '〰️', label: '调用轨迹' },
    { type: 'CLIENT_ACCESS_OPEN', icon: '🚪', label: '指定门禁点开门' },
  ]},
  { label: '📬 通知', items: [
    { type: 'CLIENT_SEND_SMS', icon: '💬', label: '发送短信给指定用户' },
    { type: 'CLIENT_SEND_EMAIL', icon: '📧', label: '发送邮件给指定用户' },
    { type: 'CLIENT_ALARM_MODE', icon: '🌐', label: '指定IP进行指定模式报警' },
    { type: 'CLIENT_ESCALATE', icon: '⬆️', label: '逐级推送 (每N秒未解决推送至下一级)' },
  ]},
]

const webActions = [
  { type: 'WEB_POPUP', icon: '💬', label: 'Web端弹窗通知' },
  { type: 'WEB_EMAIL', icon: '📧', label: '发送邮件' },
  { type: 'WEB_WEBHOOK', icon: '🔗', label: 'HTTP回调 (WebHook)' },
  { type: 'WEB_DASHBOARD_ALERT', icon: '📊', label: 'Dashboard嵌入告警' },
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
]

// ── 列表状态 ──

const loading = ref(false)
const rules = ref<LinkageRule[]>([])
const searchQuery = ref('')
const enabledFilter = ref<boolean | undefined>(undefined)
const sortBy = ref('priority')
const sortOrder = ref<'ascending' | 'descending'>('descending')

const filteredRules = computed(() => {
  let list = [...rules.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q))
  }
  if (enabledFilter.value !== undefined) list = list.filter(r => r.enabled === enabledFilter.value)
  const key = sortBy.value
  const ord = sortOrder.value === 'ascending' ? 1 : -1
  list.sort((a: any, b: any) => {
    if (key === 'priority') return (a.priority - b.priority) * ord
    return (new Date(a[key]).getTime() - new Date(b[key]).getTime()) * ord
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
    { label: '高优先级(≥80)', value: rules.value.filter(r => r.priority >= 80).length, color: '#EF4444', icon: Bell },
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

function defaultConditions() {
  return {
    time: { enabled: false, config: { startTime: '08:00', endTime: '20:00', weekdays: [1, 2, 3, 4, 5] } },
    region: { enabled: false, config: { location: '', roi: '', group: '' } },
    location: { enabled: false, config: { point: '' } },
    eventType: { enabled: true, config: { types: [] as string[], minSeverity: 3, minConfidence: 50 } },
    eventSource: { enabled: false, config: { channels: [] as string[] } },
    autoMerge: { enabled: false, config: { windowMs: 10000, maxCount: 10, dimension: 'channel' } },
  }
}

const form = reactive({
  name: '', priority: 50, cooldownMs: 5000, enabled: true,
  conditions: defaultConditions(),
})

// ── 日志状态 ──

const showLogDialog = ref(false)
const logs = ref<LinkageLog[]>([])
const logLoading = ref(false)
const logPage = ref(1)
const logPageSize = ref(20)
const logTotal = ref(0)

// ── 参数弹窗 ──

const paramDialogVisible = ref(false)
const paramDialogTitle = ref('')
const currentParamAction = ref('')
const paramForm = reactive({ channelId: '', duration: 10, extra: '' })

// ── 方法 ──

function conditionLabel(type: string) {
  const m: Record<string, string> = { time: '🕐 时间', region: '📍 区域', location: '📌 位置', eventType: '🎯 事件', eventSource: '📹 事件源', autoMerge: '🔄 合并' }
  return m[type] || type
}

function formatTime(iso?: string) {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString('zh-CN') } catch { return iso }
}

function toggleCollapse(type: string) { collapsedConditions[type] = !collapsedConditions[type] }
function handleSortChange({ prop, order }: any) { if (prop) sortBy.value = prop; if (order) sortOrder.value = order }

async function fetchRules() {
  loading.value = true
  try {
    const res = await linkageApi.getRules({ sortBy: sortBy.value as any, sortOrder: sortOrder.value === 'ascending' ? 'asc' : 'desc' })
    const d = (res.data as any)?.data ?? res.data
    rules.value = d?.items ?? (Array.isArray(d) ? d : [])
  } catch { ElMessage.error('获取联动规则失败') }
  finally { loading.value = false }
}

async function toggleRule(rule: LinkageRule) {
  try { await linkageApi.updateRule(rule.id, { enabled: rule.enabled }); ElMessage.success(rule.enabled ? '已启用' : '已停用') }
  catch { rule.enabled = !rule.enabled; ElMessage.error('操作失败') }
}

function openEditor(rule: LinkageRule | null) {
  editingRule.value = rule
  form.name = rule?.name || ''
  form.priority = rule?.priority ?? 50
  form.cooldownMs = rule?.cooldownMs ?? 5000
  form.enabled = rule?.enabled ?? true

  // 恢复条件
  const defaults = defaultConditions()
  const cfg = rule?.conditions || []
  for (const cond of conditionDefs) {
    const found = (cfg as any[]).find((c: any) => c.type === cond.type)
    ;(form.conditions as any)[cond.type] = found ? { enabled: true, config: { ...(defaults as any)[cond.type].config, ...found.config } } : (defaults as any)[cond.type]
  }

  // 恢复动作
  Object.keys(actionState).forEach(k => delete actionState[k])
  Object.keys(actionParams).forEach(k => delete actionParams[k])
  for (const a of rule?.actions || []) {
    actionState[a.actionType] = a.enabled
    actionParams[a.actionType] = a.params || {}
  }

  drawerVisible.value = true
}

async function handleSave() {
  if (!form.name.trim()) { ElMessage.warning('请输入规则名称'); return }
  saving.value = true
  try {
    const conditions = conditionDefs
      .filter(c => form.conditions[c.type].enabled)
      .map(c => ({ type: c.type, enabled: true, config: form.conditions[c.type].config }))

    const actions = Object.entries(actionState)
      .filter(([, v]) => v)
      .map(([type]) => ({ actionType: type, enabled: true, params: actionParams[type] || {} }))

    const payload = { name: form.name, priority: form.priority, cooldownMs: form.cooldownMs, enabled: form.enabled, conditions, actions }

    if (editingRule.value) {
      await linkageApi.updateRule(editingRule.value.id, payload)
    } else {
      await linkageApi.createRule(payload as any)
    }
    ElMessage.success(editingRule.value ? '规则已更新' : '规则已创建')
    drawerVisible.value = false
    fetchRules()
  } catch { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function handleDelete(row: LinkageRule) {
  try {
    await ElMessageBox.confirm(`确定删除规则「${row.name}」?`, '删除确认', { type: 'warning' })
    await linkageApi.deleteRule(row.id)
    ElMessage.success('已删除')
    fetchRules()
  } catch {}
}

function onActionToggle(type: string) {
  if (actionState[type] && !actionParams[type]) actionParams[type] = {}
}

function openActionParams(act: any) {
  currentParamAction.value = act.type
  paramDialogTitle.value = `${act.icon} ${act.label} - 参数配置`
  const p = actionParams[act.type] || {}
  paramForm.channelId = p.channelId || ''
  paramForm.duration = p.duration || 10
  paramForm.extra = p.extra ? JSON.stringify(p.extra) : ''
  paramDialogVisible.value = true
}

function saveActionParams() {
  let extra = {}
  if (paramForm.extra.trim()) {
    try { extra = JSON.parse(paramForm.extra) } catch { ElMessage.warning('JSON 格式不正确'); return }
  }
  actionParams[currentParamAction.value] = { channelId: paramForm.channelId, duration: paramForm.duration, extra }
  paramDialogVisible.value = false
}

async function fetchLogs() {
  logLoading.value = true
  try {
    const res = await linkageApi.getLogs({ page: logPage.value, pageSize: logPageSize.value })
    const d = (res.data as any)?.data ?? res.data
    logs.value = d?.items ?? (Array.isArray(d) ? d : [])
    logTotal.value = d?.total ?? logs.value.length
  } catch { ElMessage.error('获取日志失败') }
  finally { logLoading.value = false }
}

onMounted(() => { fetchRules() })
</script>

<style scoped>
/* ── 页面容器 ── */
.linkage-page {
  padding: 20px 24px;
  max-width: var(--content-max-width, 1440px);
  margin: 0 auto;
  animation: fadeIn 0.3s ease;
}

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
.toolbar-right { display: flex; gap: 8px; }

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
</style>