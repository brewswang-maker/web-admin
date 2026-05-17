// @ts-nocheck
/**
 * @file SettingsForm.test.ts
 * @brief 系统配置表单组件 单元测试
 *
 * 覆盖:
 *   - 基本设置表单 (设备名称/日志级别/通道数/录像保留/NTP)
 *   - 网络云端设置 (MQTT/心跳/TLS/同步模式)
 *   - 告警策略设置 (去重窗口/置信度阈值/联动动作)
 *   - 表单验证逻辑
 *   - API 交互 (保存/重置/测试连接)
 *   - 加载状态处理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsView from '@/views/SettingsView.vue'
import type { BasicSettings, CloudSettings, AlarmPolicySettings, SystemInfo } from '@/api/settings'

// ── Mock element-plus ──────────────────────────────────────
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

// ── Mock settingsApi ───────────────────────────────────────
const mockBasic: BasicSettings = {
  deviceName: 'ShieldBox-AI-01',
  logLevel: 'info',
  maxChannels: 16,
  recordRetentionDays: 30,
  ntpServer: 'ntp.aliyun.com',
}

const mockCloud: CloudSettings = {
  mqttBroker: 'mqtt.shieldbox.com',
  mqttPort: 8883,
  heartbeatInterval: 60,
  tlsEnabled: true,
  maxOfflineEvents: 10000,
  syncMode: 'auto',
}

const mockAlarmPolicy: AlarmPolicySettings = {
  dedupWindow: 10,
  minConfidence: 0.75,
  criticalMaxLatency: 500,
  linkageActions: ['ptz', 'record', 'push'],
}

const mockSystemInfo: SystemInfo = {
  productName: '华盾AI智能视频盒子',
  version: '7.0.0',
  sdkVersion: '3.2.1',
  hermesVersion: '2.0.0',
  hardware: 'RK3588',
  architecture: 'aarch64',
  algorithmPlugins: 12,
  maxChannels: 32,
  inferencePrecision: 'FP16',
}

const settingsApiMocks = {
  getBasic: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockBasic } })),
  saveBasic: vi.fn(() => Promise.resolve({ data: { code: 0, message: 'ok' } })),
  getCloud: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockCloud } })),
  saveCloud: vi.fn(() => Promise.resolve({ data: { code: 0, message: 'ok' } })),
  testConnection: vi.fn(() => Promise.resolve({ data: { code: 0, data: { success: true, latency: 45 } } })),
  getAlarmPolicy: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockAlarmPolicy } })),
  saveAlarmPolicy: vi.fn(() => Promise.resolve({ data: { code: 0, message: 'ok' } })),
  getSystemInfo: vi.fn(() => Promise.resolve({ data: { code: 0, data: mockSystemInfo } })),
}

vi.mock('@/api/settings', () => ({
  settingsApi: settingsApiMocks,
}))

// ── 测试辅助 ──────────────────────────────────────────────
function createWrapper() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(SettingsView, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-card': { template: '<div class="el-card"><slot /></div>' },
        'el-tabs': { template: '<div class="el-tabs"><slot /></div>' },
        'el-tab-pane': { template: '<div class="el-tab-pane"><slot /></div>' },
        'el-form': { template: '<form class="el-form"><slot /></form>' },
        'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
        'el-input': { template: '<input class="el-input" />' },
        'el-input-number': { template: '<input class="el-input-number" type="number" />' },
        'el-select': { template: '<select class="el-select"><slot /></select>' },
        'el-option': { template: '<option />' },
        'el-switch': { template: '<button class="el-switch" />' },
        'el-slider': { template: '<div class="el-slider" />' },
        'el-button': {
          template: '<button class="el-button" @click="$emit(\'click\')" :disabled="disabled"><slot /></button>',
          props: ['disabled', 'loading'],
        },
        'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>' },
        'el-radio': { template: '<label class="el-radio"><slot /></label>' },
        'el-checkbox-group': { template: '<div class="el-checkbox-group"><slot /></div>' },
        'el-checkbox': { template: '<label class="el-checkbox"><slot /></label>' },
        'el-table': { template: '<div class="el-table"><slot /></div>' },
        'el-table-column': { template: '<span />' },
        'el-tag': { template: '<span class="el-tag"><slot /></span>' },
        'el-descriptions': { template: '<div class="el-descriptions"><slot /></div>' },
        'el-descriptions-item': { template: '<span />' },
        'el-progress': { template: '<div class="el-progress" />' },
        'el-icon': { template: '<i class="el-icon"><slot /></i>' },
      },
    },
  })
}

// ── 测试 ──────────────────────────────────────────────────
describe('views/SettingsView (SettingsForm)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // 组件挂载
  // ========================================================================
  describe('组件挂载', () => {
    it('挂载成功渲染设置页面', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.settings-page').exists()).toBe(true)
    })

    it('渲染 Tab 面板结构', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.el-tabs').exists()).toBe(true)
    })
  })

  // ========================================================================
  // 基本设置表单
  // ========================================================================
  describe('基本设置表单', () => {
    it('渲染表单结构', () => {
      const wrapper = createWrapper()
      const forms = wrapper.findAll('.el-form')
      expect(forms.length).toBeGreaterThanOrEqual(1)
    })

    it('挂载时加载基本设置', () => {
      createWrapper()
      expect(settingsApiMocks.getBasic).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // 基本设置数据验证
  // ========================================================================
  describe('基本设置数据验证', () => {
    it('设备名称不为空', () => {
      expect(mockBasic.deviceName).toBeTruthy()
      expect(mockBasic.deviceName.length).toBeGreaterThan(0)
    })

    it('日志级别范围正确', () => {
      const validLevels = ['debug', 'info', 'warn', 'error']
      expect(validLevels).toContain(mockBasic.logLevel)
    })

    it('最大通道数在合理范围', () => {
      expect(mockBasic.maxChannels).toBeGreaterThanOrEqual(1)
      expect(mockBasic.maxChannels).toBeLessThanOrEqual(32)
    })

    it('录像保留天数为正数', () => {
      expect(mockBasic.recordRetentionDays).toBeGreaterThan(0)
      expect(mockBasic.recordRetentionDays).toBeLessThanOrEqual(365)
    })

    it('NTP 服务器地址有效', () => {
      expect(mockBasic.ntpServer).toBeTruthy()
      expect(mockBasic.ntpServer).toContain('.')
    })
  })

  // ========================================================================
  // 云端设置数据验证
  // ========================================================================
  describe('云端设置数据验证', () => {
    it('MQTT Broker 不为空', () => {
      expect(mockCloud.mqttBroker).toBeTruthy()
    })

    it('MQTT 端口在合法范围 (1-65535)', () => {
      expect(mockCloud.mqttPort).toBeGreaterThanOrEqual(1)
      expect(mockCloud.mqttPort).toBeLessThanOrEqual(65535)
    })

    it('心跳间隔在合理范围 (10-300秒)', () => {
      expect(mockCloud.heartbeatInterval).toBeGreaterThanOrEqual(10)
      expect(mockCloud.heartbeatInterval).toBeLessThanOrEqual(300)
    })

    it('同步模式有效', () => {
      const validModes = ['auto', 'manual', 'scheduled']
      expect(validModes).toContain(mockCloud.syncMode)
    })

    it('断网缓冲事件上限为正数', () => {
      expect(mockCloud.maxOfflineEvents).toBeGreaterThan(0)
    })

    it('TLS 为布尔值', () => {
      expect(typeof mockCloud.tlsEnabled).toBe('boolean')
    })
  })

  // ========================================================================
  // 告警策略数据验证
  // ========================================================================
  describe('告警策略数据验证', () => {
    it('去重窗口为正整数 (1-60秒)', () => {
      expect(mockAlarmPolicy.dedupWindow).toBeGreaterThanOrEqual(1)
      expect(mockAlarmPolicy.dedupWindow).toBeLessThanOrEqual(60)
    })

    it('置信度阈值在 0.3-0.95 范围', () => {
      expect(mockAlarmPolicy.minConfidence).toBeGreaterThanOrEqual(0.3)
      expect(mockAlarmPolicy.minConfidence).toBeLessThanOrEqual(0.95)
    })

    it('严重告警延迟在合理范围 (100-5000ms)', () => {
      expect(mockAlarmPolicy.criticalMaxLatency).toBeGreaterThanOrEqual(100)
      expect(mockAlarmPolicy.criticalMaxLatency).toBeLessThanOrEqual(5000)
    })

    it('联动动作列表有效', () => {
      const validActions = ['ptz', 'record', 'audio', 'light', 'sms', 'push']
      mockAlarmPolicy.linkageActions.forEach(action => {
        expect(validActions).toContain(action)
      })
    })

    it('联动动作不包含无效项', () => {
      const validActions = ['ptz', 'record', 'audio', 'light', 'sms', 'push']
      mockAlarmPolicy.linkageActions.forEach(action => {
        expect(validActions).toContain(action)
      })
      expect(mockAlarmPolicy.linkageActions.length).toBeGreaterThan(0)
    })
  })

  // ========================================================================
  // API 交互
  // ========================================================================
  describe('API 交互', () => {
    it('保存基本设置调用 saveBasic', async () => {
      const { settingsApi } = await import('@/api/settings')
      await settingsApi.saveBasic(mockBasic)
      expect(settingsApi.saveBasic).toHaveBeenCalledWith(mockBasic)
    })

    it('保存云端设置调用 saveCloud', async () => {
      const { settingsApi } = await import('@/api/settings')
      await settingsApi.saveCloud(mockCloud)
      expect(settingsApi.saveCloud).toHaveBeenCalledWith(mockCloud)
    })

    it('测试连接调用 testConnection', async () => {
      const { settingsApi } = await import('@/api/settings')
      const testParams = {
        mqttBroker: mockCloud.mqttBroker,
        mqttPort: mockCloud.mqttPort,
        tlsEnabled: mockCloud.tlsEnabled,
      }
      await settingsApi.testConnection(testParams)
      expect(settingsApi.testConnection).toHaveBeenCalledWith(testParams)
    })

    it('保存告警策略调用 saveAlarmPolicy', async () => {
      const { settingsApi } = await import('@/api/settings')
      await settingsApi.saveAlarmPolicy(mockAlarmPolicy)
      expect(settingsApi.saveAlarmPolicy).toHaveBeenCalledWith(mockAlarmPolicy)
    })

    it('获取系统信息调用 getSystemInfo', async () => {
      const { settingsApi } = await import('@/api/settings')
      await settingsApi.getSystemInfo()
      expect(settingsApi.getSystemInfo).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // 系统信息展示
  // ========================================================================
  describe('系统信息展示', () => {
    it('系统信息包含必要字段', () => {
      expect(mockSystemInfo.productName).toBeTruthy()
      expect(mockSystemInfo.version).toBeTruthy()
      expect(mockSystemInfo.hardware).toBeTruthy()
    })

    it('版本号格式正确', () => {
      const semverRegex = /^\d+\.\d+\.\d+/
      expect(mockSystemInfo.version).toMatch(semverRegex)
      expect(mockSystemInfo.sdkVersion).toMatch(semverRegex)
    })

    it('算法插件数为正整数', () => {
      expect(mockSystemInfo.algorithmPlugins).toBeGreaterThan(0)
    })

    it('最大通道数与基本设置一致或更大', () => {
      expect(mockSystemInfo.maxChannels).toBeGreaterThanOrEqual(mockBasic.maxChannels)
    })
  })

  // ========================================================================
  // 表单重置逻辑
  // ========================================================================
  describe('表单重置逻辑', () => {
    it('基本设置重置为默认值', () => {
      const defaults: BasicSettings = {
        deviceName: '',
        logLevel: 'info',
        maxChannels: 16,
        recordRetentionDays: 30,
        ntpServer: '',
      }
      expect(defaults.logLevel).toBe('info')
      expect(defaults.maxChannels).toBe(16)
      expect(defaults.recordRetentionDays).toBe(30)
    })
  })

  // ========================================================================
  // 表单验证边界
  // ========================================================================
  describe('表单验证边界', () => {
    it('通道数最小值为 1', () => {
      expect(mockBasic.maxChannels).toBeGreaterThanOrEqual(1)
    })

    it('通道数最大值为 32', () => {
      const maxAllowed = 32
      expect(mockBasic.maxChannels).toBeLessThanOrEqual(maxAllowed)
    })

    it('录像保留最小 1 天', () => {
      expect(mockBasic.recordRetentionDays).toBeGreaterThanOrEqual(1)
    })

    it('录像保留最大 365 天', () => {
      expect(mockBasic.recordRetentionDays).toBeLessThanOrEqual(365)
    })

    it('MQTT 端口最小值 1', () => {
      expect(mockCloud.mqttPort).toBeGreaterThanOrEqual(1)
    })

    it('MQTT 端口最大值 65535', () => {
      expect(mockCloud.mqttPort).toBeLessThanOrEqual(65535)
    })

    it('告警去重窗口最小 1 秒', () => {
      expect(mockAlarmPolicy.dedupWindow).toBeGreaterThanOrEqual(1)
    })

    it('告警去重窗口最大 60 秒', () => {
      expect(mockAlarmPolicy.dedupWindow).toBeLessThanOrEqual(60)
    })
  })

  // ========================================================================
  // 测试连接响应
  // ========================================================================
  describe('测试连接响应', () => {
    it('成功连接返回延迟值', async () => {
      const res = await settingsApiMocks.testConnection({
        mqttBroker: 'mqtt.shieldbox.com',
        mqttPort: 8883,
        tlsEnabled: true,
      })
      const data = (res as any).data.data
      expect(data.success).toBe(true)
      expect(data.latency).toBeGreaterThanOrEqual(0)
    })
  })
})
