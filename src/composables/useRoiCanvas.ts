/**
 * ROI 多边形绘制工具函数
 * 用于 RoiPolygonEditor 组件和其他需要多边形绘制的场景
 */

/** 归一化坐标 → Canvas 像素坐标 */
export function normalizedToCanvas(
  point: { x: number; y: number },
  canvasW: number,
  canvasH: number,
  normW = 1920,
  normH = 1080,
): { x: number; y: number } {
  return {
    x: (point.x / normW) * canvasW,
    y: (point.y / normH) * canvasH,
  }
}

/** Canvas 像素坐标 → 归一化坐标 */
export function canvasToNormalized(
  pixel: { x: number; y: number },
  canvasW: number,
  canvasH: number,
  normW = 1920,
  normH = 1080,
): { x: number; y: number } {
  return {
    x: Math.round((pixel.x / canvasW) * normW),
    y: Math.round((pixel.y / canvasH) * normH),
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

/** ROI类型枚举 — 对应后端 AlgoROI::Type */
export enum RoiType {
  DETECTION_ZONE = 'detection_zone',   // 检测区域 (多边形)
  EXCLUSION_ZONE = 'exclusion_zone',   // 排除区域 (多边形)
  TRIPWIRE = 'tripwire',               // 绊线 (线段)
  DIRECTIONAL_LINE = 'directional_line', // 方向线 (带箭头)
  COUNTING_ZONE = 'counting_zone',     // 计数区域 (矩形)
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
}

/** 在 Canvas 上绘制绊线 (线段) */
export function drawTripwire(
  ctx: CanvasRenderingContext2D,
  points: number[],
  opts: RoiDrawOptions = {},
): void {
  const {
    stroke = '#FF6D00',
    lineWidth = 3,
    pointRadius = 5,
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

  const x = Math.min(points[0], points[2])
  const y = Math.min(points[1], points[3])
  const w = Math.abs(points[2] - points[0])
  const h = Math.abs(points[3] - points[1])

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
  normW = 1920,
  normH = 1080,
): void {
  // 归一化坐标转canvas像素
  const canvasPoints = roi.polygon.flatMap((v, i) => {
    if (i % 2 === 0) {
      return [(v / normW) * canvasW, (roi.polygon[i + 1] / normH) * canvasH]
    }
    return []
  }).filter((_, i) => i % 2 === 0) // 重新构建

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
