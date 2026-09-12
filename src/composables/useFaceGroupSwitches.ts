/**
 * @file useFaceGroupSwitches.ts — 六分组功能开关 (无人值守/安检页面共用)
 *
 * [分组开关 2026-09-11] 黑名单/白名单/访客/VIP/员工/自定义 六分组逐个
 * 人工启停入口的共享逻辑:
 *   - 数据源 GET /api/v1/face/groups/switches (设备级, 与 face 插件共享单例)
 *   - 切换 PUT /api/v1/face/groups/switches (部分更新: 只传变更键)
 *   - 关闭某分组 → 该分组识别命中不再产生告警/通行记录/推送 (实时生效)
 *   - 乐观更新 + 失败回滚; 错误 toast 由调用页面负责 (composable 静默)
 */
import { ref } from 'vue'
import faceApi from '@/api/face'
import type { FaceGroupSwitches, FaceGroupTypeStr } from '@/api/face'

/** 六分组默认全开 (与后端引导默认一致; load 失败时保持该值) */
export function defaultGroupSwitches(): FaceGroupSwitches {
  return { blacklist: true, whitelist: true, visitor: true, vip: true, staff: true, custom: true }
}

export function useFaceGroupSwitches() {
  const switches = ref<FaceGroupSwitches>(defaultGroupSwitches())
  const loading = ref(false)
  /** 当前正在提交的分组 key (页面据此禁用对应开关防连点; '' = 空闲) */
  const savingKey = ref<FaceGroupTypeStr | ''>('')

  /** 加载开关状态 (失败静默返回 false, 保持默认全开) */
  async function load(): Promise<boolean> {
    loading.value = true
    try {
      const res = await faceApi.getGroupSwitches()
      if (res.data.code !== 0) return false
      const s = res.data.data?.switches
      if (s) switches.value = { ...switches.value, ...s }
      return true
    } catch {
      return false
    } finally {
      loading.value = false
    }
  }

  /** 切换单个分组: 乐观更新 + 失败回滚; 返回是否成功 (toast 由页面负责) */
  async function toggle(key: FaceGroupTypeStr, enabled: boolean): Promise<boolean> {
    if (savingKey.value) return false // 单飞: 前一次切换未完成 (UI 全量禁用已防触达, 此处兜底)
    const prev = switches.value[key]
    switches.value[key] = enabled
    savingKey.value = key
    try {
      const res = await faceApi.setGroupSwitches({ [key]: enabled } as Partial<FaceGroupSwitches>)
      if (res.data.code !== 0) {
        switches.value[key] = prev
        return false
      }
      const s = res.data.data?.switches
      if (s) switches.value = { ...switches.value, ...s } // 以后端回显为准
      return true
    } catch {
      switches.value[key] = prev
      return false
    } finally {
      savingKey.value = ''
    }
  }

  return { switches, loading, savingKey, load, toggle }
}
