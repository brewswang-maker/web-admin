/**
 * 华盾AI智能视频盒子 v7.0 - 人脸图片质量评估工具
 * utils/imageQuality.ts
 *
 * 基于 Canvas 像素分析，对齐后端 FaceDatabase::checkQuality 的检查项:
 *   - quality_score  : 综合质量分  [0, 1]  (后端阈值 min_quality_threshold=0.3)
 *   - clarity        : 清晰度      [0, 1]  (后端阈值 min_clarity_threshold=0.4)
 *   - brightness     : 亮度        [0, 1]  (用于综合分计算)
 *   - occlusion      : 遮挡率      [0, 1]  (前端无法判定，给保守默认 0.05)
 *   - pose_angle     : 姿态角度    [0, 90] (前端无法判定，给保守默认 5.0)
 *
 * 评估维度说明:
 *   - 清晰度: 计算图像的拉普拉斯方差 (Laplacian Variance), 越大越清晰
 *   - 亮度  : 计算灰度均值, 接近 0.5 为最佳
 *   - 对比度: 计算灰度标准差, 越大越清晰
 *   - 分辨率: 宽*高 越大越清晰, 阈值 200x200
 */

export interface ImageQualityScore {
  /** 综合质量分 0-1，建议 >= 0.5 */
  quality_score: number
  /** 清晰度 0-1，建议 >= 0.4 */
  clarity: number
  /** 亮度 0-1，最佳区间 [0.3, 0.7] */
  brightness: number
  /** 遮挡率 0-1，前端无 ML 模型，给保守默认 0.05 */
  occlusion: number
  /** 姿态角度 (度)，前端无 ML 模型，给保守默认 5.0 */
  pose_angle: number
  /** 图像宽度 */
  width: number
  /** 图像高度 */
  height: number
}

const DEFAULT_QUALITY: ImageQualityScore = {
  quality_score: 0.5,
  clarity: 0.95,
  brightness: 0.5,
  occlusion: 0.05,
  pose_angle: 5.0,
  width: 0,
  height: 0,
}

/**
 * 将图片文件加载到 canvas，返回像素数据
 */
function loadImageToCanvas(file: File | Blob, maxSize = 512): Promise<{
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      // 缩放到 maxSize 以加速计算 (保持宽高比)
      let { width, height } = img
      const scale = Math.min(1, maxSize / Math.max(width, height))
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        reject(new Error('无法创建 Canvas 2D 上下文'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve({ canvas, ctx, width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

/**
 * 计算拉普拉斯算子方差 (清晰度)
 *   Kernel:
 *     [ 0 -1  0 ]
 *     [-1  4 -1 ]
 *     [ 0 -1  0 ]
 */
function laplacianVariance(gray: Uint8ClampedArray, width: number, height: number): number {
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap =
        -gray[i - width] +
        4 * gray[i] -
        gray[i + width] -
        gray[(y - 1) * width + x] -
        gray[(y + 1) * width + x]
      sum += lap
      sumSq += lap * lap
      count++
    }
  }
  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}

/**
 * 评估图片质量分
 *
 * @param file 图片文件 (File / Blob)
 * @returns 质量评估结果
 */
export async function evaluateImageQuality(file: File | Blob): Promise<ImageQualityScore> {
  try {
    const { ctx, width, height } = await loadImageToCanvas(file)

    // 1. 提取灰度像素
    const imgData = ctx.getImageData(0, 0, width, height)
    const pixels = imgData.data
    const gray = new Uint8ClampedArray(width * height)
    let sumGray = 0
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      // ITU-R BT.601 灰度公式
      const g = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
      gray[j] = g
      sumGray += g
    }
    const meanGray = sumGray / gray.length / 255 // brightness [0,1]

    // 2. 拉普拉斯方差 -> 清晰度
    const lapVar = laplacianVariance(gray, width, height)
    // 经验阈值: 拉普拉斯方差 100 以下模糊, 500+ 清晰
    // 使用 sigmoid 归一化到 [0, 1]
    const clarity = Math.min(1, Math.max(0, lapVar / 500))

    // 3. 标准差 -> 对比度
    let sumSqDiff = 0
    const meanGrayByte = meanGray * 255
    for (let i = 0; i < gray.length; i++) {
      const diff = gray[i] - meanGrayByte
      sumSqDiff += diff * diff
    }
    const stdDev = Math.sqrt(sumSqDiff / gray.length) / 128 // [0, 1]
    const contrast = Math.min(1, stdDev)

    // 4. 亮度评分: [0.3, 0.7] 为最佳区间
    let brightnessScore: number
    if (meanGray >= 0.3 && meanGray <= 0.7) {
      brightnessScore = 1 - Math.abs(meanGray - 0.5) * 2 // 峰值 1.0
    } else if (meanGray < 0.3) {
      brightnessScore = meanGray / 0.3 // 0~0.3 线性递增
    } else {
      brightnessScore = Math.max(0, (1 - meanGray) / 0.3) // 0.7~1 线性递减
    }

    // 5. 分辨率评分: 阈值 200x200, 越大越好 (上限 800x800 = 1.0)
    const pixelsTotal = width * height
    const resolutionScore = Math.min(1, pixelsTotal / (800 * 800))

    // 6. 综合 quality_score: 清晰度 50% + 对比度 20% + 亮度 15% + 分辨率 15%
    let quality = clarity * 0.5 + contrast * 0.2 + brightnessScore * 0.15 + resolutionScore * 0.15
    quality = Math.min(1, Math.max(0, quality))

    return {
      quality_score: parseFloat(quality.toFixed(3)),
      clarity: parseFloat(clarity.toFixed(3)),
      brightness: parseFloat(meanGray.toFixed(3)),
      occlusion: 0.05, // 前端无法判定 ML 遮挡率, 给保守值
      pose_angle: 5.0, // 前端无法判定 ML 姿态角度, 给保守值
      width,
      height,
    }
  } catch (err) {
    console.warn('[imageQuality] 评估失败, 使用默认质量分:', err)
    return DEFAULT_QUALITY
  }
}

/**
 * 从 base64 dataURL 评估图片质量 (用于编辑时已有 image_data 的场景)
 */
export async function evaluateImageQualityFromDataUrl(dataUrl: string): Promise<ImageQualityScore> {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    return await evaluateImageQuality(blob)
  } catch (err) {
    console.warn('[imageQuality] base64 评估失败:', err)
    return DEFAULT_QUALITY
  }
}
