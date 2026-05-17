/**
 * Vitest 构建测试配置 — 3D场景打包及资源加载
 *
 * 专门用于 vite-build-3d.test.ts
 * - node 环境（不需要 DOM）
 * - 更长的超时（构建耗时）
 */
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/build/__tests__/vite-build-3d.test.ts',
    ],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // 不需要 mock（构建测试是真实的文件系统操作）
    mockReset: false,
    restoreMocks: false,
    clearMocks: false,
  },
})
