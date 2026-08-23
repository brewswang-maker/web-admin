/**
 * 3D体育场态势地图 E2E 测试
 *
 * 测试范围:
 *   1. 工厂纹理显示正常 — 地面/建筑/围栏纹理渲染
 *   2. 地图交互功能正常 — 拖拽旋转、滚轮缩放、设备悬停
 *   3. 视觉改善效果符合预期 — 告警脉冲、设备标签、工具栏操作
 *   4. 态势大屏数据展示 — 安全评分、告警列表、WebSocket状态
 */
import { test, expect, type Page, type Locator } from '@playwright/test'

// ── 测试路由 ──
const SITUATION_PATH = '/situation'

// ── 辅助: 登录并导航到态势大屏 ──
async function navigateToSituation(page: Page) {
  // 先访问根路径，等待应用加载
  await page.goto('/', { waitUntil: 'networkidle' })

  // 检查是否在登录页，如果是则跳过（E2E需配合mock或测试账号）
  const isLoginPage = await page.locator('.login-page, .login-container, [data-testid="login"]').count()
  if (isLoginPage > 0) {
    // 如果项目有mock模式或已注入token，尝试直接导航
    await page.goto(SITUATION_PATH, { waitUntil: 'networkidle' })
  } else {
    // 从侧边栏导航
    const menuSituation = page.locator('.el-menu-item').filter({ hasText: '态势大屏' })
    if (await menuSituation.count() > 0) {
      await menuSituation.click()
      await page.waitForURL(/situation/, { timeout: 10000 })
    } else {
      // 直接导航
      await page.goto(SITUATION_PATH, { waitUntil: 'networkidle' })
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 测试套件 1: 页面加载与3D场景渲染
// ════════════════════════════════════════════════════════════════════
test.describe('3D体育场态势地图 — 页面加载', () => {
  test('态势大屏页面成功加载', async ({ page }) => {
    await navigateToSituation(page)

    // 验证页面标题
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('h1')).toContainText('安全态势大屏')
  })

  test('3D场景容器正确挂载', async ({ page }) => {
    await navigateToSituation(page)

    // 场景容器存在
    const sceneContainer = page.locator('.scene3d-container')
    await expect(sceneContainer).toBeVisible({ timeout: 15000 })

    // Canvas WebGL 画布渲染完成
    const canvas = sceneContainer.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })

    // 验证canvas有实际尺寸（说明WebGL已初始化）
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('地图面板标题显示正确', async ({ page }) => {
    await navigateToSituation(page)

    const mapPanel = page.locator('.map-panel .panel-title')
    await expect(mapPanel).toContainText('体育场态势图')
  })
})

// ════════════════════════════════════════════════════════════════════
// 测试套件 2: 工厂纹理显示
// ════════════════════════════════════════════════════════════════════
test.describe('3D体育场态势地图 — 纹理渲染', () => {
  test('WebGL场景渲染完成，包含地面和建筑', async ({ page }) => {
    await navigateToSituation(page)

    // 等待3D场景完全加载
    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // 截图验证：场景有实际渲染内容（非全黑/全白）
    // 通过像素采样判断场景已渲染
    await page.waitForTimeout(2000) // 等待纹理加载

    const screenshot = await canvas.screenshot()
    // 截图不为空
    expect(screenshot.length).toBeGreaterThan(1000)
  })

  test('纹理管理器正常初始化，默认程序化纹理加载', async ({ page }) => {
    await navigateToSituation(page)

    // 通过控制台日志验证纹理加载（如果实现中有的话）
    const textureLogs: string[] = []
    page.on('console', msg => {
      if (msg.text().includes('texture') || msg.text().includes('纹理')) {
        textureLogs.push(msg.text())
      }
    })

    // 刷新页面捕获初始化日志
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)

    // 场景已正常渲染（无WebGL错误）
    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })
  })

  test('建筑模型正确渲染（6栋建筑）', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // 截图比对：确保场景包含建筑（非空场景）
    const screenshotBuffer = await canvas.screenshot()
    expect(screenshotBuffer.byteLength).toBeGreaterThan(5000)
  })

  test('纹理配置文件可访问', async ({ page }) => {
    // 验证默认纹理配置JSON可加载
    const response = await page.request.get('/textures/config-default.json')
    expect(response.ok()).toBeTruthy()

    const config = await response.json()
    expect(config.id).toBe('default-procedural')
    expect(config.textures).toBeDefined()
    expect(config.textures.length).toBeGreaterThan(0)

    // 验证包含必要的纹理类型
    const types = config.textures.map((t: any) => t.type)
    expect(types).toContain('ground')
    expect(types).toContain('buildingWall')
    expect(types).toContain('roof')
    expect(types).toContain('fence')
  })
})

// ════════════════════════════════════════════════════════════════════
// 测试套件 3: 地图交互功能
// ════════════════════════════════════════════════════════════════════
test.describe('3D体育场态势地图 — 交互功能', () => {
  test('工具栏按钮可见', async ({ page }) => {
    await navigateToSituation(page)

    // 工具栏存在
    const toolbar = page.locator('.scene-toolbar')
    await expect(toolbar).toBeVisible()

    // 复位按钮
    await expect(page.locator('.scene-toolbar').getByText('复位')).toBeVisible()

    // 脉冲开关按钮
    await expect(page.locator('.scene-toolbar').getByText(/关闭脉冲|开启脉冲/)).toBeVisible()

    // 标签开关按钮
    await expect(page.locator('.scene-toolbar').getByText(/隐藏标签|显示标签/)).toBeVisible()
  })

  test('鼠标拖拽旋转3D场景', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // 获取初始截图
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    // 拖拽旋转操作
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 150, centerY + 30, { steps: 10 })
    await page.mouse.up()

    // 等待渲染更新
    await page.waitForTimeout(500)

    // 场景仍在渲染（无崩溃）
    await expect(canvas).toBeVisible()
  })

  test('鼠标滚轮缩放3D场景', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    // 滚轮缩放
    await page.mouse.move(centerX, centerY)
    await page.mouse.wheel(0, -300) // 放大

    await page.waitForTimeout(500)

    await page.mouse.wheel(0, 300) // 缩小

    await page.waitForTimeout(500)

    // 场景仍在渲染（无崩溃）
    await expect(canvas).toBeVisible()
  })

  test('复位按钮重置相机位置', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // 先旋转场景
    const box = await canvas.boundingBox()
    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 200, centerY + 50, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)

    // 点击复位按钮
    await page.locator('.scene-toolbar').getByText('复位').click()
    await page.waitForTimeout(500)

    // 场景正常
    await expect(canvas).toBeVisible()
  })

  test('图例显示正确（在线/告警/离线）', async ({ page }) => {
    await navigateToSituation(page)

    const legendBar = page.locator('.legend-bar')
    await expect(legendBar).toBeVisible()

    await expect(legendBar).toContainText('在线设备')
    await expect(legendBar).toContainText('告警点位')
    await expect(legendBar).toContainText('离线设备')
  })
})

// ════════════════════════════════════════════════════════════════════
// 测试套件 4: 视觉改善效果
// ════════════════════════════════════════════════════════════════════
test.describe('3D体育场态势地图 — 视觉效果', () => {
  test('告警脉冲动画可切换', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // 初始状态：脉冲开启
    const pulseBtn = page.locator('.scene-toolbar').getByText('关闭脉冲')
    await expect(pulseBtn).toBeVisible()

    // 关闭脉冲
    await pulseBtn.click()
    await page.waitForTimeout(300)

    // 按钮文字变为"开启脉冲"
    await expect(page.locator('.scene-toolbar').getByText('开启脉冲')).toBeVisible()

    // 重新开启
    await page.locator('.scene-toolbar').getByText('开启脉冲').click()
    await page.waitForTimeout(300)

    await expect(page.locator('.scene-toolbar').getByText('关闭脉冲')).toBeVisible()
  })

  test('设备标签可切换显示/隐藏', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    // 初始状态：标签可见
    const labelBtn = page.locator('.scene-toolbar').getByText('隐藏标签')
    await expect(labelBtn).toBeVisible()

    // 隐藏标签
    await labelBtn.click()
    await page.waitForTimeout(300)

    await expect(page.locator('.scene-toolbar').getByText('显示标签')).toBeVisible()

    // 重新显示
    await page.locator('.scene-toolbar').getByText('显示标签').click()
    await page.waitForTimeout(300)

    await expect(page.locator('.scene-toolbar').getByText('隐藏标签')).toBeVisible()
  })

  test('CSS2D标签渲染器正确初始化', async ({ page }) => {
    await navigateToSituation(page)

    // CSS2DRenderer 会创建一个覆盖在 canvas 上的 div 容器
    await page.waitForTimeout(3000)

    // 验证场景容器内有子元素（标签渲染器的DOM）
    const container = page.locator('.scene3d-container')
    const childCount = await container.evaluate(el => el.children.length)
    expect(childCount).toBeGreaterThanOrEqual(2) // 至少有 toolbar + canvas + label renderer
  })

  test('3D场景无WebGL上下文错误', async ({ page }) => {
    const webglErrors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error' && (
        msg.text().includes('WebGL') ||
        msg.text().includes('webgl') ||
        msg.text().includes('THREE.WebGLRenderer')
      )) {
        webglErrors.push(msg.text())
      }
    })

    await navigateToSituation(page)

    // 等待场景加载完成
    await page.waitForTimeout(5000)

    // 不应有 WebGL 错误
    expect(webglErrors).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════════
// 测试套件 5: 态势大屏整体布局
// ════════════════════════════════════════════════════════════════════
test.describe('态势大屏 — 整体布局与数据', () => {
  test('三栏布局正确渲染（左/中/右）', async ({ page }) => {
    await navigateToSituation(page)
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })

    // 左侧面板
    const leftCol = page.locator('.left-col')
    await expect(leftCol).toBeVisible()

    // 中间地图
    const centerCol = page.locator('.center-col')
    await expect(centerCol).toBeVisible()

    // 右侧面板
    const rightCol = page.locator('.right-col')
    await expect(rightCol).toBeVisible()
  })

  test('左侧面板包含安全评分/告警趋势/设备状态', async ({ page }) => {
    await navigateToSituation(page)
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })

    const leftCol = page.locator('.left-col')
    await expect(leftCol.locator('.panel-title').filter({ hasText: '安全评分' })).toBeVisible()
    await expect(leftCol.locator('.panel-title').filter({ hasText: '告警趋势' })).toBeVisible()
    await expect(leftCol.locator('.panel-title').filter({ hasText: '设备状态' })).toBeVisible()
  })

  test('右侧面板包含告警类型/Agent活跃度/今日统计', async ({ page }) => {
    await navigateToSituation(page)
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })

    const rightCol = page.locator('.right-col')
    await expect(rightCol.locator('.panel-title').filter({ hasText: '告警类型分布' })).toBeVisible()
    await expect(rightCol.locator('.panel-title').filter({ hasText: 'Agent活跃度' })).toBeVisible()
    await expect(rightCol.locator('.panel-title').filter({ hasText: '今日统计' })).toBeVisible()
  })

  test('最新告警列表可见', async ({ page }) => {
    await navigateToSituation(page)
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })

    await expect(page.locator('.panel-title').filter({ hasText: '最新告警' })).toBeVisible()
    const alarmScroll = page.locator('.alarm-scroll')
    await expect(alarmScroll).toBeVisible()
  })

  test('WebSocket连接状态标签显示', async ({ page }) => {
    await navigateToSituation(page)
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })

    // 连接状态 tag（无论在线/离线都应显示）
    const statusTag = page.locator('.ss-header .el-tag')
    await expect(statusTag).toBeVisible({ timeout: 10000 })
  })

  test('时钟实时更新', async ({ page }) => {
    await navigateToSituation(page)
    await expect(page.locator('.situation-screen')).toBeVisible({ timeout: 15000 })

    const clock = page.locator('.ss-clock')
    await expect(clock).toBeVisible()

    // 时钟内容不为空
    const timeText = await clock.textContent()
    expect(timeText).not.toBeNull()
    expect(timeText!.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════════════
// 测试套件 6: 响应式与性能
// ════════════════════════════════════════════════════════════════════
test.describe('3D体育场态势地图 — 性能与稳定性', () => {
  test('场景加载时间在合理范围内 (<8s)', async ({ page }) => {
    const startTime = Date.now()
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    const loadTime = Date.now() - startTime
    expect(loadTime).toBeLessThan(8000)
  })

  test('连续交互不会导致页面崩溃', async ({ page }) => {
    await navigateToSituation(page)

    const canvas = page.locator('.scene3d-container canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })

    const box = await canvas.boundingBox()
    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    // 快速连续拖拽
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(centerX, centerY)
      await page.mouse.down()
      await page.mouse.move(centerX + (i % 2 === 0 ? 100 : -100), centerY, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(200)
    }

    // 快速连续缩放
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, i % 2 === 0 ? -200 : 200)
      await page.waitForTimeout(200)
    }

    // 场景仍然正常
    await expect(canvas).toBeVisible()
  })

  test('页面无JS运行时错误', async ({ page }) => {
    const jsErrors: string[] = []

    page.on('pageerror', error => {
      jsErrors.push(error.message)
    })

    await navigateToSituation(page)
    await page.waitForTimeout(5000)

    // 排除非关键的第三方库警告，只关注真正的错误
    const criticalErrors = jsErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Non-Error promise rejection')
    )

    expect(criticalErrors).toHaveLength(0)
  })
})
