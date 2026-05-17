/**
 * 华盾AI智能视频盒子 v7.0 - Vitest 测试配置
 *
 * 单元测试覆盖: stores / utils / api / composables
 */
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    // 测试环境
    environment: 'happy-dom',

    // 全局设置
    globals: true,

    // 测试文件匹配
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.spec.ts',
    ],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/stores/**/*.ts',
        'src/utils/**/*.ts',
        'src/api/**/*.ts',
        'src/composables/**/*.ts',
      ],
      exclude: [
        'src/types/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
      ],
      // 覆盖率阈值 — 目标 80%
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },

    // 超时配置
    testTimeout: 10000,
    hookTimeout: 10000,

    // Mock 设置
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
