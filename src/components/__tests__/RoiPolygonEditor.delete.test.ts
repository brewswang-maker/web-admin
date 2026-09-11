/**
 * @file RoiPolygonEditor.delete.test.ts
 * @brief ROI 编辑器「删除到 0」行为实证 (用户报告: 删不掉最后 1 个)
 *
 * 覆盖:
 *   1. 同类型 2 个 → 逐个删除 → emit 长度 1 → emit [] (删到 0)
 *   2. 清空按钮 1 个 → 直接清到 0
 *   3. 列表选中 + 键盘 Del → 删到 0
 *   4. 跨类型 (检测+排除) 逐 tab 删 → 全空
 *   5. modelValue 外部回写 [] 回环 (父组件 v-model 回写不复活)
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { provide, computed } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import RoiPolygonEditor from '@/components/RoiPolygonEditor.vue'
import type { RoiData } from '@/composables/useRoiCanvas'

// element-plus 真包在 jsdom 下拖拽 popper 等副作用, mock 掉 (组件仅用 ElMessage)
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

// ── Element Plus 组件 Stub (对齐 ErrorBoundary.test.ts 模式) ──
const ElButtonStub = {
  props: ['type', 'disabled', 'size', 'text', 'loading', 'title'],
  emits: ['click'],
  template: `<button class="el-button" :data-title="title" :disabled="disabled" @click="$emit('click', $event)"><slot /></button>`,
}
const ElInputStub = {
  props: ['modelValue', 'disabled', 'size'],
  emits: ['update:modelValue'],
  template: `<input class="el-input" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
}
const ElSwitchStub = {
  props: ['modelValue', 'disabled', 'size', 'inlinePrompt', 'activeText', 'inactiveText'],
  emits: ['update:modelValue', 'change'],
  template: `<span class="el-switch" @click="$emit('update:modelValue', !modelValue); $emit('change', !modelValue)" />`,
}
const ElSelectStub = {
  props: ['modelValue', 'disabled', 'size'],
  emits: ['update:modelValue'],
  template: `<select class="el-select"><slot /></select>`,
}
const ElOptionStub = { props: ['label', 'value'], template: `<option />` }
// radio 组: 用 provide/inject 桥接 (element-plus 真件走 inject radioGroupKey)
const ElRadioGroupStub = {
  props: ['modelValue', 'disabled', 'size'],
  emits: ['update:modelValue'],
  setup(props: any, { emit }: any) {
    provide('testRadioGroup', { change: (ev: string, v: any) => emit(ev, v) })
  },
  template: `<div class="el-radio-group" :data-current="modelValue"><slot /></div>`,
}
const ElRadioButtonStub = {
  props: ['value', 'disabled'],
  inject: { testRadioGroup: { default: null } },
  template: `<button class="el-radio-button" :data-value="value" @click="testRadioGroup && testRadioGroup.change('update:modelValue', value)"><slot /></button>`,
}
const ElTooltipStub = { template: `<div class="el-tooltip"><slot /></div>` }
const globalStubs = {
  components: {
    'el-button': ElButtonStub,
    'el-input': ElInputStub,
    'el-switch': ElSwitchStub,
    'el-select': ElSelectStub,
    'el-option': ElOptionStub,
    'el-radio-group': ElRadioGroupStub,
    'el-radio-button': ElRadioButtonStub,
    'el-tooltip': ElTooltipStub,
  },
}

// jsdom 无 2D 上下文: no-op ctx 防 renderCanvas throw (drawXxx 全部画布调用吞掉)
beforeAll(() => {
  const noop = () => {}
  const ctxStub: any = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'measureText') return () => ({ width: 0 })
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') {
        return () => ({ addColorStop: noop })
      }
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      return noop
    },
    set: () => true,
  })
  // 极简 jsdom 环境原型上无 getContext: 直接赋值 stub
  ;(HTMLCanvasElement.prototype as any).getContext = () => ctxStub
})

function roi(partial: Partial<RoiData>): RoiData {
  return {
    roi_id: `roi_${Math.random().toString(36).slice(2)}`,
    roi_name: '检测区域',
    roi_type: 'detection_zone',
    polygon: [100, 100, 800, 100, 800, 600, 100, 600],
    is_active: true,
    ...partial,
  } as RoiData
}

function mountEditor(modelValue: RoiData[], types = ['detection_zone', 'exclusion_zone']) {
  return mount(RoiPolygonEditor, {
    props: { modelValue, types, canvasWidth: 440, canvasHeight: 248 },
    global: globalStubs,
  })
}

beforeEach(() => { vi.clearAllMocks() })

describe('RoiPolygonEditor 删除到 0 (用户报告: 删不掉最后 1 个)', () => {
  it('同类型 2 个 → 逐个删除 → 最终 emit [] 且列表区消失', async () => {
    const w = mountEditor([roi({ roi_id: 'a' }), roi({ roi_id: 'b' })])
    expect(w.find('.roi-list').exists()).toBe(true)
    expect(w.findAll('.roi-list__item').length).toBe(2)

    // 删第 1 个
    await w.findAll('.roi-list__item .el-button')[0]!.trigger('click')
    await w.vm.$nextTick()
    let emissions = w.emitted('update:modelValue')!
    expect((emissions.at(-1)![0] as RoiData[]).length).toBe(1)
    expect(w.findAll('.roi-list__item').length).toBe(1)

    // 删最后 1 个 ← 用户断言「删不掉」的路径
    await w.findAll('.roi-list__item .el-button')[0]!.trigger('click')
    await w.vm.$nextTick()
    emissions = w.emitted('update:modelValue')!
    expect((emissions.at(-1)![0] as RoiData[]).length).toBe(0)
    expect(w.find('.roi-list').exists()).toBe(false) // v-if="visibleRois.length > 0"
  })

  it('清空按钮: 仅剩 1 个时 → 直接清到 0', async () => {
    const w = mountEditor([roi({ roi_id: 'only' })])
    expect(w.findAll('.roi-list__item').length).toBe(1)
    const clearBtn = w.findAll('.el-button').find(b => b.text().includes('清空'))!
    expect(clearBtn.attributes('disabled')).toBeUndefined() // 非 disabled (visibleRois.length>0)
    await clearBtn.trigger('click')
    await w.vm.$nextTick()
    const last = w.emitted('update:modelValue')!.at(-1)![0] as RoiData[]
    expect(last.length).toBe(0)
    expect(w.find('.roi-list').exists()).toBe(false)
  })

  it('列表选中 + 键盘 Del → 删到 0', async () => {
    const w = mountEditor([roi({ roi_id: 'kbd' })])
    await w.find('.roi-list__item').trigger('click') // selectRoi(orig)
    await w.find('canvas').trigger('keydown.delete')
    await w.vm.$nextTick()
    const last = w.emitted('update:modelValue')!.at(-1)![0] as RoiData[]
    expect(last.length).toBe(0)
    expect(w.find('.roi-list').exists()).toBe(false)
  })

  it('跨类型: 检测+排除 逐 tab 删除 → 全空 (emits [1个] → [])', async () => {
    const w = mountEditor([
      roi({ roi_id: 'det1', roi_type: 'detection_zone' }),
      roi({ roi_id: 'excl1', roi_type: 'exclusion_zone' }),
    ])
    // 当前 tab = detection_zone: 只见 1 个
    expect(w.findAll('.roi-list__item').length).toBe(1)

    // 删检测区
    await w.findAll('.roi-list__item .el-button')[0]!.trigger('click')
    await w.vm.$nextTick()
    let last = w.emitted('update:modelValue')!.at(-1)![0] as RoiData[]
    expect(last.length).toBe(1) // 剩排除区

    // 切到排除区 tab (radio stub → currentType)
    await w.find('.el-radio-group [data-value="exclusion_zone"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.findAll('.roi-list__item').length).toBe(1) // 排除区可见

    // 删最后 1 个
    await w.findAll('.roi-list__item .el-button')[0]!.trigger('click')
    await w.vm.$nextTick()
    last = w.emitted('update:modelValue')!.at(-1)![0] as RoiData[]
    expect(last.length).toBe(0)
    expect(w.find('.roi-list').exists()).toBe(false)
  })

  it('modelValue 外部回写 [] (v-model 回环) → 不复活', async () => {
    const w = mountEditor([roi({ roi_id: 'echo' })])
    // 模拟父组件 v-model 回写空数组 (AlgoConfigView loadRegions 空结果回填)
    await w.setProps({ modelValue: [] })
    await w.vm.$nextTick()
    expect(w.find('.roi-list').exists()).toBe(false)

    // 外部真值回填 (载入快照) → 正常重建
    await w.setProps({ modelValue: [roi({ roi_id: 'reload' })] })
    await w.vm.$nextTick()
    expect(w.findAll('.roi-list__item').length).toBe(1)
  })
})
