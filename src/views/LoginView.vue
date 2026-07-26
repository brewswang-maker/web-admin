<template>
  <div class="login-page">
    <!-- 背景装饰 -->
    <div class="login-bg">
      <div class="bg-grid"></div>
      <div class="bg-glow bg-glow--left"></div>
      <div class="bg-glow bg-glow--right"></div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-card-wrapper">
      <div class="login-card">
        <!-- Logo 区域 -->
        <div class="login-header">
          <div class="login-logo">
            <img src="/favicon.svg" alt="华盾AI" width="48" height="48" />
          </div>
          <h1 class="login-title">华盾AI</h1>
          <p class="login-subtitle">Smart Gateway v7.0</p>
          <p class="login-desc">Hermes 多智能体自进化架构</p>
        </div>

        <!-- 表单 -->
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          class="login-form"
          size="large"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="form.username"
              placeholder="用户名或邮箱"
              :prefix-icon="User"
              clearable
              autocomplete="username"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
              autocomplete="current-password"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <!-- 记住设备 / 忘记密码 -->
          <div class="login-options">
            <el-checkbox v-model="form.remember" size="small">记住此设备</el-checkbox>
            <el-button link type="primary" size="small" class="forgot-link">忘记密码?</el-button>
          </div>

          <!-- 登录按钮 -->
          <el-form-item>
            <el-button
              type="primary"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '验证中...' : '登 录' }}
            </el-button>
          </el-form-item>

          <!-- 错误提示 -->
          <transition name="fade">
            <el-alert
              v-if="authError"
              :title="authError"
              type="error"
              show-icon
              :closable="true"
              @close="authError = null"
              class="login-error"
            />
          </transition>
        </el-form>

        <!-- 分隔线 -->
        <div class="login-divider">
          <span class="divider-text">或</span>
        </div>

        <!-- 第三方登录 -->
        <div class="login-social">
          <el-button class="social-btn" size="large" @click="handleWechatLogin">
            <span class="social-icon">📱</span> 企业微信登录
          </el-button>
          <el-button class="social-btn" size="large" @click="handleCertLogin">
            <span class="social-icon">🔑</span> 国密证书登录
          </el-button>
        </div>

        <!-- 底部信息 -->
        <div class="login-footer">
          <span class="version-text">v7.0.0 · Hermes</span>
        </div>
      </div>

      <!-- 安全声明 -->
      <div class="login-security">
        <span>🔒 TLS 1.3加密</span>
        <span class="sep">·</span>
        <span>国密SM2/SM4</span>
        <span class="sep">·</span>
        <span>等保三级合规</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const authError = ref<string | null>(null)

const form = reactive({
  username: '',
  password: '',
  remember: false,
})

const rules = {
  username: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' },
    { min: 2, message: '用户名至少2个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' },
  ],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  authError.value = null

  try {
    await auth.login({
      username: form.username,
      password: form.password,
    })

    ElMessage.success({
      message: `欢迎回来，${auth.username || form.username}`,
      duration: 2000,
    })

    // 跳转到目标页面或默认仪表盘
    const redirect = (router.currentRoute.value.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (err: any) {
    authError.value = err?.message || '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}

function handleWechatLogin() {
  ElMessage.info('企业微信登录功能开发中...')
}

function handleCertLogin() {
  ElMessage.info('国密证书登录功能开发中...')
}
</script>

<style scoped>
/* ============================================================
 * 登录页 — v6.0 独立云端设计
 * ============================================================ */

.login-page {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('@/assets/bg_login.jpg') center / cover no-repeat;
  overflow: hidden;
}

/* ── 背景装饰 ── */
.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(3, 35, 94, 0.18), rgba(0, 73, 160, 0.12));
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}

.bg-glow {
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.12;
  animation: glowPulse 6s ease-in-out infinite alternate;
}

.bg-glow--left {
  top: -100px;
  left: -100px;
  background: #3B82F6;
}

.bg-glow--right {
  bottom: -100px;
  right: -100px;
  background: #7C3AED;
  animation-delay: -3s;
}

@keyframes glowPulse {
  0% { opacity: 0.08; transform: scale(1); }
  100% { opacity: 0.16; transform: scale(1.2); }
}

/* ── 卡片容器 ── */
.login-card-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 520px;
  min-height: 100vh;
  box-sizing: border-box;
  gap: 24px;
  padding: 32px 24px;
  margin: 0 auto;
}

.login-card {
  width: 400px;
  padding: 48px 40px 36px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-2xl, 16px);
  /* box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05); */
}

/* ── Logo & 标题 ── */
.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 16px;
  padding: 8px;
}

.login-logo img {
  width: 100%;
  height: 100%;
}

.login-title {
  font-size: 28px;
  font-weight: var(--font-bold, 700);
  color: #FFFFFF;
  letter-spacing: 2px;
  margin: 0 0 4px;
}

.login-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 1);
  font-family: var(--font-mono);
  margin: 0 0 4px;
}

.login-desc {
  font-size: 12px;
  color: rgba(164, 235, 255, 0.86);
  margin: 0;
  letter-spacing: 0.5px;
}

/* ── 表单 ── */
.login-form {
  margin-top: 8px;
}

.login-form :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: none;
  transition: all var(--transition-normal, 0.2s ease);
}

.login-form :deep(.el-input__wrapper:hover) {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
}

.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: var(--color-primary);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.login-form :deep(.el-input__inner) {
  color: #FFFFFF;
}

.login-form :deep(.el-input__inner:-webkit-autofill),
.login-form :deep(.el-input__inner:-webkit-autofill:hover),
.login-form :deep(.el-input__inner:-webkit-autofill:focus),
.login-form :deep(.el-input__inner:-webkit-autofill:active) {
  -webkit-text-fill-color: #FFFFFF;
  -webkit-box-shadow: 0 0 0 1000px transparent inset;
  box-shadow: 0 0 0 1000px transparent inset;
  transition: background-color 9999s ease-out 0s;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.3);
}

.login-form :deep(.el-input__prefix .el-icon) {
  color: rgba(255, 255, 255, 1);
}

.login-form :deep(.el-input__suffix .el-icon) {
  color: rgba(255, 255, 255, 1);
}

.login-form :deep(.el-input__clear) {
  color: rgba(255, 255, 255, 1);
}

/* ── 记住设备 / 忘记密码 ── */
.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -8px 0 20px;
}

.login-options :deep(.el-checkbox) {
  color: rgba(255, 255, 255, 1);
  --el-checkbox-checked-text-color: rgba(255, 255, 255, 1);
}

.login-options :deep(.el-checkbox__label) {
  font-size: 13px;
}

.forgot-link {
  color: rgba(255, 255, 255, 1);
  font-size: 13px;
}

.forgot-link:hover {
  color: rgba(255, 255, 255, 0.5);
}

/* ── 登录按钮 ── */
.login-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: var(--font-semibold, 600);
  letter-spacing: 4px;
  border-radius: 8px;
  /* background: linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%); */
  border: none;
  transition: all var(--transition-normal, 0.2s ease);
  position: relative;
  overflow: hidden;
}

.login-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 60%);
  pointer-events: none;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn.is-loading {
  opacity: 0.8;
}

/* ── 错误提示 ── */
.login-error {
  margin-top: 12px;
  border-radius: 8px;
}

.login-error :deep(.el-alert__title) {
  font-size: 13px;
}

/* ── 分隔线 ── */
.login-divider {
  display: flex;
  align-items: center;
  margin: 24px 0;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.divider-text {
  padding: 0 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

/* ── 第三方登录 ── */
.login-social {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.social-btn {
  width: 100%;
  height: 44px;
  margin-left: 0 !important;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 1);
  font-size: 14px;
  transition: all var(--transition-normal, 0.2s ease);
}

.social-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}

.social-icon {
  margin-right: 8px;
  font-size: 16px;
}

/* ── 底部信息 ── */
.login-footer {
  text-align: center;
  margin-top: 24px;
}

.version-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 1);
  font-family: var(--font-mono);
  letter-spacing: 1px;
}

/* ── 安全声明 ── */
.login-security {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 1);
  letter-spacing: 0.5px;
}

.login-security .sep {
  color: rgba(255, 255, 255, 0.1);
}

/* ── 过渡动画 ── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-normal, 0.2s ease), transform var(--transition-normal, 0.2s ease);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
