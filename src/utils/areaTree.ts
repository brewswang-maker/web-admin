/**
 * utils/areaTree.ts — 安保区域平表→树构建 + 通道集合展开
 * [P1.3 2026-09-10] 供 安保区域管理页(P1.3) / 人员管理(P1.4) / 通道树筛选(P1.5) /
 * 告警设备树面板(P3) 共用。
 *
 * 语义约定:
 *   - 后端平表存储 (parent_id 挂接), 本工具负责前端组树;
 *   - 悬垂 parent (父不存在) / 环形引用 → 提升为顶级节点 (容错不丢数据);
 *   - 同级排序 sort_order → created_at → id;
 *   - 通道展开: resolved_channel_ids 并集 (后端绑定时刻快照 = channel_ids ∪ 设备通道)。
 */

import type { SecurityArea } from '@/api/securityAreas'

/** 树节点 (区域维度; 设备叶子由使用方按需挂接, 本工具只管区域层级) */
export interface AreaTreeNode {
  id: string
  name: string
  area: SecurityArea
  depth: number
  children: AreaTreeNode[]
}

/** 平表→树。parentId 缺省视为顶级; 悬垂/环引用容错提升为顶级 */
export function buildAreaTree(areas: SecurityArea[]): AreaTreeNode[] {
  const byId = new Map<string, AreaTreeNode>()
  for (const a of areas) {
    byId.set(a.id, { id: a.id, name: a.name, area: a, depth: 0, children: [] })
  }
  const roots: AreaTreeNode[] = []
  for (const node of byId.values()) {
    const pid = node.area.parent_id || ''
    const parent = pid ? byId.get(pid) : undefined
    if (parent && parent !== node) {
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)   // 顶级 / 悬垂 / 自环
    }
  }
  const sortRec = (nodes: AreaTreeNode[]) => {
    nodes.sort((x, y) =>
      (x.area.sort_order ?? 0) - (y.area.sort_order ?? 0)
      || (x.area.created_at ?? 0) - (y.area.created_at ?? 0)
      || x.id.localeCompare(y.id))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

/** 节点→子树全量区域 id 集 (含自身) — 勾选区域 = 其全子树并集语义 */
export function collectAreaIds(node: AreaTreeNode): string[] {
  const out = [node.id]
  for (const c of node.children) out.push(...collectAreaIds(c))
  return out
}

/** 区域 id 集→子树内全部区域 (输入含中间层 id, 输出含全部后代) */
export function collectAreaIdsFromRoots(roots: AreaTreeNode[], ids: Iterable<string>): string[] {
  const wanted = new Set(ids)
  const out: string[] = []
  const walk = (n: AreaTreeNode) => {
    if (wanted.has(n.id)) {
      for (const x of collectAreaIds(n)) out.push(x)
    } else {
      for (const c of n.children) walk(c)
    }
  }
  for (const r of roots) walk(r)
  return out
}

/** 区域集→通道集合展开 (resolved_channel_ids 并集; 前端过滤管线用) */
export function expandAreaChannels(areas: SecurityArea[]): Set<string> {
  const set = new Set<string>()
  for (const a of areas) {
    for (const c of a.resolved_channel_ids ?? []) set.add(c)
    // 兜底: 老快照缺失时显式 channel_ids 也并入 (matched by channel_id 判定)
    for (const c of a.channel_ids ?? []) set.add(c)
  }
  return set
}

/** el-tree 数据适配: AreaTreeNode→{ key,label,type,area,children } (设备叶子由使用方追加)
 *  [FIX 2026-09-10 真机] 区域节点补 type:'area' — SecurityAreaManager 模板/onNodeClick
 *  以 data.type==='area' 区分区域节点与设备叶子, 缺失则点击区域无响应 */
export function areaTreeToElTreeData(
  roots: AreaTreeNode[],
  childrenOf?: (n: AreaTreeNode) => Array<{ key: string; label: string; [k: string]: unknown }>,
): Array<{ key: string; label: string; type: string; area: SecurityArea; children: unknown[] }> {
  const toEl = (n: AreaTreeNode): { key: string; label: string; type: string; area: SecurityArea; children: unknown[] } => ({
    key: n.id,
    label: n.name,
    type: 'area',
    area: n.area,
    children: [
      ...n.children.map(toEl),
      ...(childrenOf ? childrenOf(n) : []),
    ],
  })
  return roots.map(toEl)
}
