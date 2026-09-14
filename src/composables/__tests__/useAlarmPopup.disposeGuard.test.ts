/**
 * useAlarmPopup.disposeGuard.test.ts — [FIX dispose-edit-guard 2026-09-14]
 * 处警编辑保护 + showAlarmPopup 呈现返回值 单测。
 *
 * 背景 (真机 2026-09-14 14:47-14:55 实测): 用户处警填表期间, 新告警 WS 帧/富化帧
 * 静默替换 currentAlarm → 弹窗侧 watch 清空处置表单 (disposeType/handleNote) →
 * 点击"确认处置"无请求发出 (nginx 无 PUT 记录, DB 仍 status=new), 用户误判
 * "没保存成功, 还是继续让选择报警类型和输入备注"。
 *
 * 本文件锁定修复语义:
 *   ① disposeEditing=true 时非高优先级新告警不覆盖 (返回 false, currentAlarm 不变);
 *   ② 高优先级 (critical/high) 仍可抢断 — 安全提醒优先 (返回 true);
 *   ③ 无编辑时覆盖行为与原先一致 (零回归);
 *   ④ 同 id 富化合并帧仍合并 (返回 true, id 不变; 表单保留由弹窗侧 id 门控保证);
 *   ⑤ closePopup 解除编辑保护 (防 closeTimer 300ms 窗口残留误拦);
 *   ⑥ 原优先级守门回归: 当前高优先级时低优先级不覆盖。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/linkage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/linkage')>()
  return {
    ...actual,
    linkageApi: { ...actual.linkageApi, getAllRules: vi.fn() },
  }
})

import {
  showAlarmPopup, closePopup, currentAlarm, popupVisible, disposeEditing,
} from '../useAlarmPopup'

function mkAlarm(id: string, severity = 3, extra: Record<string, unknown> = {}) {
  // [注意] normalizeAlarmCore 按 severity 数字重映射 level (normalizeSeverityScale:
  //   字符串 level 无法 Number() → 兑底 2 → 'low'); 测试必须传数字 severity:
  //   5→critical / 4→high / 3→medium / 2→low
  return {
    id,
    type: 'intrusion',
    channelId: '34020000001320002001',
    deviceId: '34020000001320002001',
    severity,
    status: 'unhandled',
    createdAt: new Date().toISOString(),
    metadata: {},
    ...extra,
  }
}

describe('showAlarmPopup dispose-edit-guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    popupVisible.value = false
    currentAlarm.value = null
    disposeEditing.value = false
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    popupVisible.value = false
    currentAlarm.value = null
    disposeEditing.value = false
  })

  it('① 编辑中: 非高优先级新告警不覆盖弹窗 (返回 false)', async () => {
    expect(await showAlarmPopup(mkAlarm('A'))).toBe(true)
    expect(currentAlarm.value?.id).toBe('A')
    disposeEditing.value = true
    expect(await showAlarmPopup(mkAlarm('B', 3))).toBe(false)
    expect(currentAlarm.value?.id).toBe('A')
  })

  it('② 编辑中: 高优先级 (critical, severity=5) 新告警仍可抢断 (返回 true)', async () => {
    await showAlarmPopup(mkAlarm('A'))
    disposeEditing.value = true
    expect(await showAlarmPopup(mkAlarm('B', 5))).toBe(true)
    expect(currentAlarm.value?.id).toBe('B')
  })

  it('③ 无编辑: 覆盖行为不变 (零回归)', async () => {
    await showAlarmPopup(mkAlarm('A'))
    disposeEditing.value = false
    expect(await showAlarmPopup(mkAlarm('B'))).toBe(true)
    expect(currentAlarm.value?.id).toBe('B')
  })

  it('④ 同 id 富化合并帧: 合并且返回 true (不换告警; 编辑保护不拦同 id)', async () => {
    await showAlarmPopup(mkAlarm('A', 3, { metadata: { k1: 1 } }))
    disposeEditing.value = true
    const enriched = mkAlarm('A', 3, { metadata: { k2: 2 }, snapshotUrl: '/s.jpg' })
    expect(await showAlarmPopup(enriched)).toBe(true)
    expect(currentAlarm.value?.id).toBe('A')
    // 合并分支: 后到帧快照补位 + 不换告警 (表单保留由弹窗侧 id 门控 watch 保证)
    //   normalize 会把相对路径转绝对 URL (toAbsoluteUrl) → 用包含断言
    expect(currentAlarm.value?.snapshotUrl).toContain('/s.jpg')
  })

  it('⑤ closePopup 解除编辑保护', async () => {
    await showAlarmPopup(mkAlarm('A'))
    disposeEditing.value = true
    closePopup()
    expect(disposeEditing.value).toBe(false)
  })

  it('⑥ 原优先级守门回归: 当前高优先级时低优先级不覆盖', async () => {
    await showAlarmPopup(mkAlarm('A', 4))
    disposeEditing.value = false
    expect(await showAlarmPopup(mkAlarm('B', 2))).toBe(false)
    expect(currentAlarm.value?.id).toBe('A')
  })
})
