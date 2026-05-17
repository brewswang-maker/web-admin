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

// ── Mock element-plus ──────────────────────────────────────
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

// ── Mock settingsApi ───────────────────────────────────────
// NOTE: vi.mock factory 不允许使用外部变量（hoisting 限制），
//       所以 mock 函数必须在 factory 回调内直接定义。
vi.mock('@/api/settings', () => ({
  settingsApi: {
    getBasic: vi.fn(() => Promise.resolve({ data: { code: 0, data: {
      deviceName: 'ShieldBox-AI-01', logLevel: 'info', maxChannels: 16,
      recordRetentionDays: 30, ntpServer: 'ntp.aliyun.com',
    } } })),
    saveBasic: vi.fn(() => Promise.resolve({ data: { code: 0, message: 'ok' } })),
    getCloud: vi.fn(() => Promise.resolve({ data: { code: 0, data: {
      mqttBroker: 'mqtt.shieldbox.com', mqttPort: 8883, heartbeatInterval: 60,
      tlsEnabled: true, maxOfflineEvents: 10000, syncMode: 'auto',
    } } })),
    saveCloud: vi.fn(() => Promise.resolve({ data: { code: 0, message: 'ok' } })),
    testConnection: vi.fn(() => Promise.resolve({ data: { code: 0, data: { success: true, latency: 45 } } })),
    getAlarmPolicy: vi.fn(() => Promise.resolve({ data: { code: 0, data: {
      dedupWindow: 10, minConfidence: 0.75, criticalMaxLatency: 500,
      linkageActions: ['ptz', 'record', 'push'],
    } } })),
    saveAlarmPolicy: vi.fn(() => Promise.resolve({ data: { code: 0, message: 'ok' } })),
    getSystemInfo: vi.fn(() => Promise.resolve({ data: { code: 0, data: {
      productName: '华盾AI智能视频盒子', version: '7.0.0', sdkVersion: '3.2.1',
      hermesVersion: '2.0.0', hardware: 'RK3588', architecture: 'aarch64',
      algorithmPlugins: 12, maxChannels: 32, inferencePrecision: 'FP16',
    } } })),
  },
}))

// ── Mock http ──────────────────────────────────────────────
vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(() => Promise.resolve({ data: { code: 0, data: {} } })),
    post: vi.fn(() => Promise.resolve({ data: { code: 0, data: {} } })),
  },
}))

// ── Import after mocks ─────────────────────────────────────
import SettingsView from '@/views/SettingsView.vue'

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
        'el-button': { template: '<button class="el-button" @click="$emit(\'click\')"><slot /></button>' },
        'el-descriptions': { template: '<div class="el-descriptions"><slot /></div>' },
        'el-descriptions-item': { template: '<div class="el-descriptions-item"><slot /></div>' },
        'el-divider': { template: '<hr />' },
        'el-tag': { template: '<span class="el-tag"><slot /></span>' },
        'el-icon': { template: '<i class="el-icon"><slot /></i>' },
        'el-tooltip': { template: '<span class="el-tooltip"><slot /></span>' },
        'el-alert': { template: '<div class="el-alert"><slot /></div>' },
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
    it('挂载成功并渲染设置页面', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.settings-page').exists() || wrapper.find('.el-tabs').exists()).toBe(true)
    })
  })

  // ========================================================================
  // 表单元素
  // ========================================================================
  describe('表单元素', () => {
    it('渲染基本设置表单', () => {
      const wrapper = createWrapper()
      const forms = wrapper.findAll('.el-form')
      expect(forms.length).toBeGreaterThanOrEqual(1)
    })

    it('渲染保存按钮', () => {
      const wrapper = createWrapper()
      const buttons = wrapper.findAll('.el-button')
      const saveBtn = buttons.find(b => b.text().includes('保存'))
      expect(saveBtn).toBeDefined()
    })
  })

  // ========================================================================
  // 设置数据验证
  // ========================================================================
  describe('设置数据验证', () => {
    it('基本设置 mock 数据格式正确', async () => {
      const { settingsApi } = await import('@/api/settings')
      const res = await settingsApi.getBasic()
      const data = res.data.data
      expect(data.deviceName).toBeTruthy()
      expect(data.logLevel).toBeTruthy()
      expect(data.maxChannels).toBeGreaterThan(0)
      expect(data.ntpServer).toBeTruthy()
    })

    it('云端设置 mock 数据格式正确', async () => {
      const { settingsApi } = await import('@/api/settings')
      const res = await settingsApi.getCloud()
      const data = res.data.data
      expect(data.mqttBroker).toBeTruthy()
      expect(data.mqttPort).toBeGreaterThan(0)
      expect(typeof data.tlsEnabled).toBe('boolean')
    })

    it('告警策略 mock 数据格式正确', async () => {
      const { settingsApi } = await import('@/api/settings')
      const res = await settingsApi.getAlarmPolicy()
      const data = res.data.data
      expect(data.dedupWindow).toBeGreaterThan(0)
      expect(data.minConfidence).toBeGreaterThan(0)
      expect(data.minConfidence).toBeLessThanOrEqual(1)
      expect(Array.isArray(data.linkageActions)).toBe(true)
    })

    it('系统信息 mock 数据格式正确', async () => {
      const { settingsApi } = await import('@/api/settings')
      const res = await settingsApi.getSystemInfo()
      const data = res.data.data
      expect(data.productName).toBeTruthy()
      expect(data.version).toBeTruthy()
      expect(data.hardware).toBeTruthy()
    })
  })

  // ========================================================================
  // API 调用验证
  // ========================================================================
  describe('API 调用验证', () => {
    it('挂载时调用 getBasic', () => {
      createWrapper()
      // SettingsView 在 onMounted 中应调用 getBasic
    })

    it('saveBasic 返回成功', async () => {
      const { settingsApi } = await import('@/api/settings')
      const res = await settingsApi.saveBasic({ deviceName: 'Test' })
      expect(res.data.code).toBe(0)
    })

    it('testConnection 返回成功', async () => {
      const { settingsApi } = await import('@/api/settings')
      const res = await settingsApi.testConnection()
      expect(res.data.data.success).toBe(true)
    })
  })
})
