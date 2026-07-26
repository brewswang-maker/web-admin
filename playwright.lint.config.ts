import { defineConfig } from '@playwright/test'

// [P1-3] 简化的 E2E 配置 — 不启动 webServer, 仅做静态语法验证
export default defineConfig({
  testDir: './e2e',
  testMatch: 'linkage-rule.spec.ts',
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
})