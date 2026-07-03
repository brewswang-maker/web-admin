/**
 * useObjectLabel — 多类别目标检测标签翻译 composable (v6.3)
 *
 * 集中处理：
 *   1. 类别名 (person / item / animal / vehicle / unknown) → 当前 locale 显示名
 *   2. 目标名 (umbrella / bed / cat / ...) → 当前 locale 显示名
 *   3. 告警类型 (person_detected / item_detected / ...) → 当前 locale 显示名
 *
 * 数据来源优先级:
 *   1. i18n locale 中预定义 key (objectClass.* / alarm.type.*)
 *   2. 后端 AlarmLabels 服务注入到 metadata 的 target_label_zh / target_label_en
 *   3. 兜底: 直接显示英文模型标签 (target_label)
 */

import { useI18n } from 'vue-i18n';
import { ALARM_TYPE_CN } from '@/types/alarm';

export interface ObjectLabelMeta {
  /** 类别: person / item / animal / vehicle / unknown */
  objectCategory?: string;
  /** 英文模型标签 */
  targetLabel?: string;
  /** 后端注入的中文显示名 */
  targetLabelZh?: string;
  /** 后端注入的英文显示名 */
  targetLabelEn?: string;
}

const ALARM_TYPE_MAP: Record<string, string> = {
  person_detected: 'personDetected',
  item_detected: 'itemDetected',
  animal_detected: 'animalDetected',
  vehicle_detected: 'vehicleDetected',
  object_detected: 'objectDetected',
};

export function useObjectLabel() {
  const { locale, t } = useI18n();

  /** 类别名 → 当前 locale 显示名 */
  function getCategoryName(meta: ObjectLabelMeta): string {
    if (!meta?.objectCategory) return '';
    const key = `objectClass.category.${meta.objectCategory}`;
    const translated = t(key);
    // i18n 缺失时返回 key 字符串本身 — 兜底
    if (translated && translated !== key) return translated;
    return meta.objectCategory;
  }

  /** 目标名 → 当前 locale 显示名 */
  function getTargetName(meta: ObjectLabelMeta): string {
    if (!meta?.targetLabel) return '';

    // 1. i18n key 优先
    const i18nKey = `objectClass.item.${meta.targetLabel}`;
    const translated = t(i18nKey);
    if (translated && translated !== i18nKey) return translated;

    // 2. 后端注入的 zh/en
    if (locale.value === 'zh-CN') {
      return meta.targetLabelZh || meta.targetLabel;
    }
    return meta.targetLabelEn || meta.targetLabel;
  }

  /** 告警类型 → 当前 locale 显示名 */
  function getAlarmTypeName(alarmType: string): string {
    if (!alarmType) return '';
    // 1. 物体检测类优先走 i18n ALARM_TYPE_MAP
    const i18nKey = ALARM_TYPE_MAP[alarmType];
    if (i18nKey) {
      const translated = t(`alarm.type.${i18nKey}`);
      if (translated && translated !== `alarm.type.${i18nKey}`) return translated;
    }
    // 2. [FIX 2026-06-28] 回退到 ALARM_TYPE_CN (包含 face_*/intrusion/fire 等全量类型)
    //    原回退 'objectDetected' 会导致 face_blacklist 显示为“物体检测”
    if (ALARM_TYPE_CN[alarmType]) return ALARM_TYPE_CN[alarmType];
    // 3. 最终回退: 返回原始类型字符串
    return alarmType;
  }

  return {
    getCategoryName,
    getTargetName,
    getAlarmTypeName,
  };
}