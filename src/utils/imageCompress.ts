/**
 * 华盾AI智能视频盒子 v7.0 - 图片压缩工具
 * utils/imageCompress.ts
 */

export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: string
}

export async function compressImage(file: File | Blob, options: CompressOptions = {}): Promise<Blob> {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.8, mimeType = 'image/jpeg' } = options
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
      if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('压缩失败')) }, mimeType, quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
    img.src = url
  })
}

export function getImageInfo(file: File | Blob): Promise<{ width: number; height: number; size: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height, size: file.size }) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')) }
    img.src = url
  })
}

/** 压缩结果类型 */
export interface CompressResult {
  blob: Blob; url: string; width: number; height: number; size: number; originalSize: number; ratio: number;
}

/** 文件大小格式化 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
