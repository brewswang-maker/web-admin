/**
 * ROI 多边形绘制工具函数
 * 用于 RoiPolygonEditor 组件和其他需要多边形绘制的场景
 *
 * [FIX roi-norm-base 2026-10-01] 缺陷 14-1: 归一空间基准尺寸不再写死
 * 1920/1080 字面量, 缺省取 roiSchema.ts SSOT (与后端
 * box-sdk/include/core/RoiCoordinateSchema.h 镜像)。
 */
import { FALLBACK_WIDTH, FALLBACK_HEIGHT } from './roiSchema'

/**
 * [FIX roi-norm-base 2026-10-01] 缺陷 14-1 底图等比适配矩形 (contain letterbox)。
 *
 * 为什么必须引入这个中间层: 底图改成 contain 等比绘制后, 图像在画布里**只占
 * 一块矩形** (4:3 底图进 16:9 画布 → 左右留黑边)。若归一化仍按「整幅画布」
 * 换算, 渲染与数据流脱节, 表现为**看得对、存错**:
 *   画布 640×360, 4:3 底图 1280×960, 通道基准 1280×960
 *   fit = { x: 80, y: 0, w: 480, h: 360, scale: 0.375 }
 *   用户在图像内 x=100 (真值归一 100/1280 = 0.078) 处落点
 *     → 画布 px = 80 + 100×0.375 = 117.5
 *     → 旧换算 117.5/640×1280 = 235 (归一 0.184) → 偏差 2.35 倍
 * 且**正确的等比渲染会掩盖这个数据错误** (用户照着画面画, 却存到别处),
 * 比修复前的拉伸失真更隐蔽。故底图绘制矩形与顶点绘制 / 命中检测 / 归一化
 * 换算必须共用同一个 fit 矩形, 本文件是该映射的唯一事实源。
 */
export interface FitRect {
  /** 适配矩形左上角 (画布局部像素坐标) */
  x: number
  y: number
  /** 渲染宽高 (= 底图原始宽高 × scale) */
  w: number
  h: number
  /** 等比缩放系数 (画布像素 / 底图像素) */
  scale: number
}

/**
 * [FIX roi-norm-base 2026-10-01] 缺陷 14-1: contain letterbox 适配矩形。
 * scale 取宽高两个约束的较小者, 保证整幅底图可见; 溢出方向居中留黑边。
 * 底图尺寸未知 (无背景图 / 图片尚未加载) 时退化为全画布 —— 此时「画布即
 * 全幅缩略」语义自洽, 网格铺满画布仍与顶点坐标一一对应。
 */
export function computeFitRect(
  canvasW: number, canvasH: number, imgW: number, imgH: number,
): FitRect {
  if (!(imgW > 0) || !(imgH > 0) || !(canvasW > 0) || !(canvasH > 0)) {
    return { x: 0, y: 0, w: canvasW, h: canvasH, scale: 1 }
  }
  const scale = Math.min(canvasW / imgW, canvasH / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h, scale }
}

/**
 * [FIX roi-norm-base 2026-10-01] 缺陷 14-1: 画布像素是否落在适配矩形内。
 * 黑边区不属于底图范围, 绘制落点应拒绝 (返回 null) —— 否则会存出负坐标 /
 * 越界坐标, 交由后端 pointInPolygon 算出「框跑到画面外」的告警。
 */
export function isPixelInFit(pixel: { x: number; y: number }, fit: FitRect): boolean {
  return pixel.x >= fit.x && pixel.x <= fit.x + fit.w
    && pixel.y >= fit.y && pixel.y <= fit.y + fit.h
}

/** 归一化坐标 → Canvas 像素坐标
 *  [FIX roi-norm-base 2026-10-01] 缺陷 14-1: 新增可选 fit 参数走 letterbox
 *  中间层; 不传时铺满画布, 等价于修复前的旧行为 (向后兼容)。 */
export function normalizedToCanvas(
  point: { x: number; y: number },
  canvasW: number,
  canvasH: number,
  normW = FALLBACK_WIDTH,
  normH = FALLBACK_HEIGHT,
  fit?: FitRect,
): { x: number; y: number } {
  const f = fit ?? { x: 0, y: 0, w: canvasW, h: canvasH, scale: 1 }
  return {
    x: f.x + (point.x / normW) * f.w,
    y: f.y + (point.y / normH) * f.h,
  }
}

/** Canvas 像素坐标 → 归一化坐标
 *  [FIX roi-norm-base 2026-10-01] 缺陷 14-1: 同上走 fit 中间层; 越界钳制到
 *  [0, 基准] —— 顶点被拖出图像范围时吸附在图像边界, 而非存出越界坐标。
 *  不传 fit 时钳制对画布内坐标是恒等变换, 与修复前行为一致。 */
export function canvasToNormalized(
  pixel: { x: number; y: number },
  canvasW: number,
  canvasH: number,
  normW = FALLBACK_WIDTH,
  normH = FALLBACK_HEIGHT,
  fit?: FitRect,
): { x: number; y: number } {
  const f = fit ?? { x: 0, y: 0, w: canvasW, h: canvasH, scale: 1 }
  const ratioX = Math.min(Math.max((pixel.x - f.x) / f.w, 0), 1)
  const ratioY = Math.min(Math.max((pixel.y - f.y) / f.h, 0), 1)
  return {
    x: Math.round(ratioX * normW),
    y: Math.round(ratioY * normH),
  }
}

/** 射线法判断点是否在多边形内 */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: number[],
): boolean {
  const n = polygon.length / 2
  if (n < 3) return false
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2], yi = polygon[i * 2 + 1]
    const xj = polygon[j * 2], yj = polygon[j * 2 + 1]
    if ((yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** 在 Canvas 上绘制多边形 */
export function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: number[],
  opts: { stroke?: string; fill?: string; lineWidth?: number; pointRadius?: number } = {},
): void {
  const {
    stroke = '#0F9D58',
    fill = 'rgba(15,157,88,0.15)',
    lineWidth = 2,
    pointRadius = 3,
  } = opts

  if (points.length < 4) return // 至少 2 个点 (x,y)
  const n = points.length / 2

  // 绘制填充和描边
  ctx.beginPath()
  ctx.moveTo(points[0], points[1])
  for (let i = 1; i < n; i++) {
    ctx.lineTo(points[i * 2], points[i * 2 + 1])
  }
  ctx.closePath()
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
  ctx.fillStyle = fill
  ctx.fill()

  // 绘制顶点圆圈
  if (pointRadius > 0) {
    for (let i = 0; i < n; i++) {
      ctx.beginPath()
      ctx.arc(points[i * 2], points[i * 2 + 1], pointRadius, 0, Math.PI * 2)
      ctx.fillStyle = stroke
      ctx.fill()
    }
  }
}

/** 将 [{x,y},...] 转为扁平数组 [x1,y1,x2,y2,...] */
export function pointsToArray(points: Array<{ x: number; y: number }>): number[] {
  const result: number[] = []
  for (const p of points) {
    result.push(p.x, p.y)
  }
  return result
}

/** 将扁平数组 [x1,y1,x2,y2,...] 转为 [{x,y},...] */
export function arrayToPoints(flat: number[]): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = []
  for (let i = 0; i < flat.length - 1; i += 2) {
    result.push({ x: flat[i], y: flat[i + 1] })
  }
  return result
}

// ============================================================================
// 借鉴EasyAIoT — 扩展ROI绘制工具 (绊线/方向线/矩形)
// ============================================================================

/** ROI类型枚举 — 对应后端 AlgoROI::Type
 *  [FIX 2026-09-02] 新增 rectangle / point 两型 (对标海康 iVMS/大华 DSS 联动规则
 *  绘制工具栏四形状范式: 多边形/矩形/绊线/点)。仅显式传入 types 的调用方可见
 *  (availableTypes 白名单机制), 未传 types 的旧调用方 (PipelineEditorView)
 *  工具栏不变。 */
export enum RoiType {
  DETECTION_ZONE = 'detection_zone',   // 检测区域 (多边形)
  EXCLUSION_ZONE = 'exclusion_zone',   // 排除区域 (多边形)
  TRIPWIRE = 'tripwire',               // 绊线 (线段, A→B 端点)
  DIRECTIONAL_LINE = 'directional_line', // 方向线 (带箭头)
  COUNTING_ZONE = 'counting_zone',     // 计数区域 (矩形)
  RECTANGLE = 'rectangle',             // [2026-09-02] 矩形区域 (拖拽对角两点, 存 4 顶点)
  POINT = 'point',                     // [2026-09-02] 关注点 (单击放置单点)
}

/** ROI方向 — 绊线/方向线用 */
export enum RoiDirection {
  BOTH = 'both',
  A_TO_B = 'a_to_b',
  B_TO_A = 'b_to_a',
}

/** ROI绘制选项 */
export interface RoiDrawOptions {
  stroke?: string
  fill?: string
  lineWidth?: number
  pointRadius?: number
  fontSize?: number
  label?: string
  direction?: RoiDirection
}

/** ROI数据结构 — 对应后端 AlgoROI */
export interface RoiData {
  roi_id: string
  roi_name: string
  roi_type: RoiType
  polygon: number[]         // 归一化坐标 [x1,y1,x2,y2,...]
  is_active: boolean
  direction?: RoiDirection
  // [ROI-ID-BIND 2026-09-29] 画板形状 ↔ 算法库记录持久绑定 (用户决策: 事件/算法
  //   与区域按 ID 绑定, 名字仅展示不参与匹配)。首次同步由后端响应回填, 经快照
  //   (roi_shapes_json / roi_shapes_by_channel) 持久化; 后续保存按 ID 直连 upsert。
  region_id?: number
  tripwire_id?: number
  // [FIX id-binding 2026-09-30] 绊线 _ch0 镜像行持久 ID: createTripwireWithMirror
  //   建线时回填 (响应携带镜像 id), 随快照落库。镜像更新/在用集判定按 ID 直连,
  //   铲除旧「按主行名反查镜像」在同库同名堆积时的归属混淆。
  mirror_tripwire_id?: number
}

/** 在 Canvas 上绘制绊线 (线段)
 *  [FIX 2026-09-02] 支持 direction 方向箭头 (对标海康 iVMS 绊线 A→B/B→A/双向
 *  箭头范式, 与 drawDirectionalLine 同一 drawArrowhead), 未设方向保持纯虚线。 */
export function drawTripwire(
  ctx: CanvasRenderingContext2D,
  points: number[],
  opts: RoiDrawOptions = {},
): void {
  const {
    stroke = '#FF6D00',
    lineWidth = 3,
    pointRadius = 5,
    direction,
    label,
  } = opts

  if (points.length < 4) return // 至少 2 个点

  // 绘制线段
  ctx.beginPath()
  ctx.moveTo(points[0], points[1])
  for (let i = 1; i < points.length / 2; i++) {
    ctx.lineTo(points[i * 2], points[i * 2 + 1])
  }
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.setLineDash([8, 4])
  ctx.stroke()
  ctx.setLineDash([])

  // [FIX 2026-09-02] 方向箭头 (首尾两端点; a_to_b 沿 A→B, b_to_a 沿 B→A, both 双向)
  if (direction === RoiDirection.A_TO_B || direction === RoiDirection.BOTH) {
    const xe = points[points.length - 2], ye = points[points.length - 1]
    drawArrowhead(ctx, points[0], points[1], xe, ye, 10, stroke)
  }
  if (direction === RoiDirection.B_TO_A || direction === RoiDirection.BOTH) {
    const xe = points[points.length - 2], ye = points[points.length - 1]
    drawArrowhead(ctx, xe, ye, points[0], points[1], 10, stroke)
  }

  // 绘制端点
  if (pointRadius > 0) {
    for (let i = 0; i < points.length / 2; i++) {
      ctx.beginPath()
      ctx.arc(points[i * 2], points[i * 2 + 1], pointRadius, 0, Math.PI * 2)
      ctx.fillStyle = stroke
      ctx.fill()
      // 端点标签 A/B
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${pointRadius * 2}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(i === 0 ? 'A' : 'B', points[i * 2], points[i * 2 + 1])
    }
  }

  // 绘制标签
  if (label) {
    const midX = (points[0] + points[2]) / 2
    const midY = (points[1] + points[3]) / 2
    ctx.fillStyle = stroke
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, midX, midY - 10)
  }
}

/** 在 Canvas 上绘制方向线 (带箭头) */
export function drawDirectionalLine(
  ctx: CanvasRenderingContext2D,
  points: number[],
  opts: RoiDrawOptions = {},
): void {
  const {
    stroke = '#2196F3',
    lineWidth = 3,
    direction = RoiDirection.BOTH,
    label,
  } = opts

  if (points.length < 4) return

  const x1 = points[0], y1 = points[1]
  const x2 = points[2], y2 = points[3]

  // 绘制线段
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()

  // 绘制箭头
  const arrowSize = 10

  if (direction === RoiDirection.A_TO_B || direction === RoiDirection.BOTH) {
    drawArrowhead(ctx, x1, y1, x2, y2, arrowSize, stroke)
  }
  if (direction === RoiDirection.B_TO_A || direction === RoiDirection.BOTH) {
    drawArrowhead(ctx, x2, y2, x1, y1, arrowSize, stroke)
  }

  // 端点圆圈
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.arc(points[i * 2], points[i * 2 + 1], 5, 0, Math.PI * 2)
    ctx.fillStyle = stroke
    ctx.fill()
  }

  // 标签
  if (label) {
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    ctx.fillStyle = stroke
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, midX, midY - 12)
  }
}

/** [2026-09-02] 矩形对角两点 → 顺序化 4 顶点 [x1,y1, x2,y1, x2,y2, x1,y2]
 *  (左上→右上→右下→左下)。矩形统一存 4 顶点: 引擎 pointInPolygon 直接可用
 *  (凸四边形退化), drawRectangle 取 min/max 渲染亦正确, 回显零损失。 */
export function rectFromDiagonal(x1: number, y1: number, x2: number, y2: number): number[] {
  const lx = Math.min(x1, x2), rx = Math.max(x1, x2)
  const ty = Math.min(y1, y2), by = Math.max(y1, y2)
  return [lx, ty, rx, ty, rx, by, lx, by]
}

/** [2026-09-02] 在 Canvas 上绘制关注点 ROI (单点: 同心圆 + 十字准星) */
export function drawPoint(
  ctx: CanvasRenderingContext2D,
  points: number[],
  opts: RoiDrawOptions = {},
): void {
  const {
    stroke = '#00BCD4',
    pointRadius = 6,
    label,
  } = opts

  if (points.length < 2) return
  const x = points[0], y = points[1]

  // 十字准星
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(x - pointRadius * 2, y); ctx.lineTo(x + pointRadius * 2, y)
  ctx.moveTo(x, y - pointRadius * 2); ctx.lineTo(x, y + pointRadius * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // 同心圆 (实心内圆 + 空心外环)
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fillStyle = stroke
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, pointRadius, 0, Math.PI * 2)
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()

  if (label) {
    ctx.fillStyle = stroke
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, x + pointRadius + 4, y - 4)
  }
}

/** 在 Canvas 上绘制矩形 ROI */
export function drawRectangle(
  ctx: CanvasRenderingContext2D,
  points: number[],
  opts: RoiDrawOptions = {},
): void {
  const {
    stroke = '#9C27B0',
    fill = 'rgba(156,39,176,0.15)',
    lineWidth = 2,
    pointRadius = 3,
    label,
  } = opts

  if (points.length < 4) return

  // [FIX 2026-09-03 问题3] bbox 取全部顶点: 旧实现取 points[0..3] 假定为两对角点,
  //   但 rectFromDiagonal 产的是顺序化 4 顶点 [lx,ty, rx,ty, rx,by, lx,by],
  //   前两点同 y → h = |points[3]-points[1]| = 0 → 已保存矩形/计数区渲染成
  //   零高度线 (画完即"看不见")。改为全顶点包围盒后两种存储形态均正确:
  //   2 点对角 (存量计数区) / 4 顶点 (新矩形与计数区)。
  let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (points[i] < x) x = points[i]
    if (points[i] > x2) x2 = points[i]
    if (points[i + 1] < y) y = points[i + 1]
    if (points[i + 1] > y2) y2 = points[i + 1]
  }
  const w = x2 - x
  const h = y2 - y

  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
  ctx.fillStyle = fill
  ctx.fill()

  // 四角端点
  if (pointRadius > 0) {
    const corners = [x, y, x + w, y, x + w, y + h, x, y + h]
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.arc(corners[i * 2], corners[i * 2 + 1], pointRadius, 0, Math.PI * 2)
      ctx.fillStyle = stroke
      ctx.fill()
    }
  }

  if (label) {
    ctx.fillStyle = stroke
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, x + 4, y - 4)
  }
}

/** 根据 RoiType 自动选择绘制函数 */
export function drawRoi(
  ctx: CanvasRenderingContext2D,
  roi: RoiData,
  canvasW: number,
  canvasH: number,
  normW = FALLBACK_WIDTH,
  normH = FALLBACK_HEIGHT,
): void {
  // 简化：直接转换
  const pts: number[] = []
  for (let i = 0; i < roi.polygon.length - 1; i += 2) {
    pts.push((roi.polygon[i] / normW) * canvasW)
    pts.push((roi.polygon[i + 1] / normH) * canvasH)
  }

  const alpha = roi.is_active ? 1.0 : 0.4
  const baseOpts: RoiDrawOptions = {
    label: roi.roi_name,
    direction: roi.direction,
  }

  ctx.globalAlpha = alpha

  switch (roi.roi_type) {
    case RoiType.DETECTION_ZONE:
      drawPolygon(ctx, pts, { ...baseOpts, stroke: '#0F9D58' })
      break
    case RoiType.EXCLUSION_ZONE:
      drawPolygon(ctx, pts, { ...baseOpts, stroke: '#F44336', fill: 'rgba(244,67,54,0.15)' })
      break
    case RoiType.TRIPWIRE:
      drawTripwire(ctx, pts, baseOpts)
      break
    case RoiType.DIRECTIONAL_LINE:
      drawDirectionalLine(ctx, pts, baseOpts)
      break
    case RoiType.COUNTING_ZONE:
      drawRectangle(ctx, pts, { ...baseOpts, stroke: '#9C27B0' })
      break
    case RoiType.RECTANGLE:
      drawRectangle(ctx, pts, { ...baseOpts, stroke: '#00897B' })
      break
    case RoiType.POINT:
      drawPoint(ctx, pts, baseOpts)
      break
    default:
      drawPolygon(ctx, pts, baseOpts)
  }

  ctx.globalAlpha = 1.0
}

// ============================================================================
// 内部辅助函数
// ============================================================================

/** 绘制箭头头部 */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
  color: string,
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(
    toX - size * Math.cos(angle - Math.PI / 6),
    toY - size * Math.sin(angle - Math.PI / 6),
  )
  ctx.lineTo(
    toX - size * Math.cos(angle + Math.PI / 6),
    toY - size * Math.sin(angle + Math.PI / 6),
  )
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}
