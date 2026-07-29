<template>
  <div class="login-page">
    <div class="login-card-wrapper">
      <header class="login-header">
        <h1 class="login-title">华盾智能视频盒子</h1>
        <div class="login-features" aria-label="智能识别、实时解析、异常预警">
          <img :src="loginLeftImage" alt="" aria-hidden="true" />
          <span>智能识别</span>
          <span>实时解析</span>
          <span>异常预警</span>
          <img :src="loginRightImage" alt="" aria-hidden="true" />
        </div>
      </header>

      <div class="login-card">
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
              placeholder="用户名"
              clearable
              autocomplete="username"
            >
              <template #prefix>
                <i class="iconfont1 icon1-renyuan login-field-icon" aria-hidden="true"></i>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              show-password
              autocomplete="current-password"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <i class="iconfont1 icon1-mima login-field-icon" aria-hidden="true"></i>
              </template>
            </el-input>
          </el-form-item>



          <!-- 登录按钮 -->
          <el-form-item>
            <el-button
              type="primary"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中...' : '登 录' }}
            </el-button>
          </el-form-item>
          <div class="login-options">
            <el-checkbox v-model="form.remember" size="small">记住密码</el-checkbox>
          </div>

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
        <!-- <div class="login-divider">
          <span class="divider-text">或</span>
        </div> -->

        <!-- 第三方登录 -->
        <!-- <div class="login-social">
          <el-button class="social-btn" size="large" @click="handleWechatLogin">
            <span class="social-icon">📱</span> 企业微信登录
          </el-button>
          <el-button class="social-btn" size="large" @click="handleCertLogin">
            <span class="social-icon">🔑</span> 国密证书登录
          </el-button>
        </div> -->

        <!-- 底部信息 -->
        <!-- <div class="login-footer">
          <span class="version-text">v7.0.0 · Hermes</span>
        </div> -->
      </div>

      <!-- 安全声明 -->
      <!-- <div class="login-security">
        <span>🔒 TLS 1.3加密</span>
        <span class="sep">·</span>
        <span>国密SM2/SM4</span>
        <span class="sep">·</span>
        <span>等保三级合规</span>
      </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import loginLeftImage from '@/assets/login_left.png'
import loginRightImage from '@/assets/login_right.png'

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
    const redirect = (router.currentRoute.value.query.redirect as string) || '/situation'
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
.login-page {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #020D25 url('@/assets/bg_login.png') center / cover no-repeat;
}

.login-card-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(800px, calc(100vw - 32px));
  flex-direction: column;
  align-items: center;
  transform: translateY(-20px);
}

.login-header {
  width: 100%;
  margin-bottom: 38px;
  text-align: center;
}

.login-title {
  margin: 0 0 24px;
  color: #FFFFFF;
  background: linear-gradient(0deg, #00CCFF 0%, #FFFFFF 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-size: 57px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
}

.login-features {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 26px;
  color: #33B2FF;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}

.login-features img {
  width: 86px;
  height: 4px;
  object-fit: fill;
}

.login-card {
  width: min(716px, calc(100vw - 32px));
  height: 386px;
  min-height: 386px;
  padding: 63px 116px 0 123px;
  box-sizing: border-box;
  background: url('@/assets/login.png') center / 100% 100% no-repeat;
  /* box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05); */
}

.login-form {
  width: 100%;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 32px;
}

.login-form :deep(.el-input__wrapper) {
  min-height: 55px;
  padding: 0 16px;
  border: 1px solid #1F6DE0;
  border-radius: 7px;
  background: rgba(1, 35, 80, 0.38);
  box-shadow: none;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.login-form :deep(.el-input__wrapper:hover),
.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: #00CAFD;
  background: rgba(1, 43, 96, 0.52);
  box-shadow: 0 0 8px rgba(0, 202, 253, 0.15);
}

.login-form :deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: #1F6DE0;
  box-shadow: none;
}

.login-form :deep(.el-form-item.is-error .el-input__wrapper.is-focus) {
  border-color: #00CAFD;
  box-shadow: 0 0 8px rgba(0, 202, 253, 0.15);
}

.login-form :deep(.el-input__inner) {
  color: #00CAFD;
  background: transparent;
  font-size: 16px;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: #1450A8;
}

.login-form :deep(.login-field-icon),
.login-form :deep(.el-input__prefix .el-icon),
.login-form :deep(.el-input__suffix .el-icon) {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  color: #00CAFD;
  font-size: 18px;
}

.login-form :deep(.el-input__clear) {
  color: #00CAFD;
}

.login-form :deep(.el-input__inner:-webkit-autofill),
.login-form :deep(.el-input__inner:-webkit-autofill:hover),
.login-form :deep(.el-input__inner:-webkit-autofill:focus),
.login-form :deep(.el-input__inner:-webkit-autofill:active) {
  -webkit-text-fill-color: #00CAFD;
  -webkit-background-clip: text;
  background-clip: text;
  background-color: transparent !important;
  -webkit-box-shadow: 0 0 0 1000px transparent inset;
  box-shadow: 0 0 0 1000px transparent inset;
  caret-color: #00CAFD;
  transition: background-color 9999s ease-out 0s;
}

.login-options {
  display: flex;
  align-items: center;
  margin: 0 0 32px;
}

.login-options :deep(.el-checkbox) {
  color: #1F6DE0;
  --el-checkbox-text-color: #1F6DE0;
  --el-checkbox-checked-text-color: #1F6DE0;
  --el-checkbox-input-border-color: #1F6DE0;
  --el-checkbox-checked-bg-color: transparent;
  --el-checkbox-checked-input-border-color: #1F6DE0;
}

.login-options :deep(.el-checkbox__inner) {
  border-color: #1F6DE0;
  background: transparent;
  width: 16px;
  height: 16px;
}

.login-options :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  border-color: #1F6DE0;
  background: transparent;
}

.login-options :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  border-color: #1F6DE0;
}

.login-options :deep(.el-checkbox__input.is-focus .el-checkbox__inner),
.login-options :deep(.el-checkbox__inner:hover) {
  border-color: #1F6DE0;
}

.login-options :deep(.el-checkbox__label) {
  padding-left: 8px;
  color: #1F6DE0;
  font-size: 14px;
}

.login-form :deep(.el-form-item:last-of-type) {
  margin-bottom: 0;
}

.login-btn {
  position: relative;
  width: 100%;
  height: 52px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #FFFFFF;
  background:
    linear-gradient(0deg, #123E8C 0%, #2578EA 100%) padding-box,
    linear-gradient(0deg, #2694D1 0%, #2694D1 100%) border-box;
  box-shadow: none;
  font-size: 20px;
  --el-button-border-color: transparent;
  --el-button-hover-border-color: transparent;
  --el-button-active-border-color: transparent;
  transition: filter 0.12s ease;
}

.login-btn:hover:not(:disabled),
.login-btn:focus-visible:not(:disabled) {
  color: #FFFFFF;
  border-color: transparent;
  background:
    linear-gradient(0deg, #123E8C 0%, #25B9EA 100%) padding-box,
    linear-gradient(0deg, #2694D1 0%, #2694D1 100%) border-box;
  box-shadow: none;
}

.login-btn.is-loading {
  opacity: 0.8;
}

.login-error {
  margin-top: 12px;
  border-radius: 6px;
}

.login-error :deep(.el-alert__title) {
  font-size: 13px;
}

/* ── 分隔线（保留备用） ── */
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
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

/* ── 第三方登录（保留备用） ── */
.login-social {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.social-btn {
  width: 100%;
  height: 44px;
  margin-left: 0 !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.04);
  font-size: 14px;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.social-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.08);
}

.social-icon {
  margin-right: 8px;
  font-size: 16px;
}

/* ── 底部信息（保留备用） ── */
.login-footer {
  margin-top: 24px;
  text-align: center;
}

.version-text {
  color: rgba(255, 255, 255, 1);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 1px;
}

/* ── 安全声明（保留备用） ── */
.login-security {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 1);
  font-size: 12px;
  letter-spacing: 0.5px;
}

.login-security .sep {
  color: rgba(255, 255, 255, 0.1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 720px) {
  .login-card-wrapper {
    transform: none;
  }

  .login-header {
    margin-bottom: 24px;
  }

  .login-title {
    font-size: 34px;
  }

  .login-features {
    gap: 4px;
    font-size: 12px;
  }

  .login-card {
    height: auto;
    min-height: 310px;
    padding: 46px 12% 34px;
  }

  .login-form :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  .login-form :deep(.el-input__wrapper) {
    min-height: 50px;
  }

  .login-options {
    margin-bottom: 20px;
  }
}

@media (max-height: 650px) and (min-width: 721px) {
  .login-card-wrapper {
    transform: none;
  }

  .login-header {
    margin-bottom: 20px;
  }

  .login-title {
    font-size: 44px;
  }
}
</style>
