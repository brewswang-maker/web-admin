/**
 * [FLOOR-MAP 2026-09-03] 2D 平面图三层联动 — 设备 :80 入口真机验证 (照 .algosync_verify.mjs 模式)
 *
 * 覆盖计划 3.1 五组场景:
 *   M1 平面图 CRUD: 创建 → SVG base64 上传 (宽高回写) → 列表 → 静态服务 → 元数据编辑 (contains 守卫)
 *   M2 摄像头绑定: 落点 upsert → 持久化 → 二次 upsert 不重复 → by-channel 反查主图在前
 *   M3 规则 map_ids: 创建带 map_ids → 回读 → PUT {enabled} 守卫不丢 → PUT source_cond (编辑抽屉保存形态) 更新
 *   U1 /maps 页面: 卡片列表 + 编辑画布渲染
 *   U2 /linkage 列表: 「适用地图」列 el-tag 展示
 *   U3 弹窗 bound 通道: plan 模式 FloorMapCanvas (底图+摄像头+涟漪) 真实渲染
 *   U4 弹窗 unbound 通道: GPS 占位兜底 (零破坏)
 *
 * 前置: ssh -L 18080:127.0.0.1:80 <设备> 且设备已部署含本功能的前后端。
 * 验证规则 enabled=false (action=Web弹窗 也不会触发真实联动), 结束全清理。
 */
import { chromium } from 'playwright';
import http from 'http';

const PORT = 18080; // ssh -L 18080:127.0.0.1:80
const api = (method, path, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: '127.0.0.1', port: PORT, path, method,
    headers: { 'Content-Type': 'application/json' } },
    (res) => { let buf = ''; res.on('data', d => buf += d); res.on('end', () => resolve({ status: res.statusCode, body: buf })); });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});
const jbody = (r) => { try { return JSON.parse(r.body) } catch { return {} } };
const raw = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
    let buf = ''; res.on('data', d => buf += d); res.on('end', () => resolve({ status: res.statusCode, body: buf }));
  }).on('error', reject);
});
const login = await api('POST', '/api/v1/auth/login', { username: 'admin', password: 'admin123' });
const ad = jbody(login).data ?? jbody(login);
const TOKEN = ad.token;

const MAP1_NAME = '测试-平面图V';
const MAP2_NAME = '测试-平面图V-辅';
const RULE_ID = 'test_floormap_v1';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

// ── 测试 SVG (viewBox 800x600, 后端解析宽高回写) ──
const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect width="800" height="600" fill="#1F2D4A"/><rect x="60" y="60" width="300" height="180" fill="none" stroke="#3A5A8C" stroke-width="4"/><rect x="440" y="60" width="300" height="180" fill="none" stroke="#3A5A8C" stroke-width="4"/><rect x="60" y="340" width="680" height="200" fill="none" stroke="#3A5A8C" stroke-width="4"/></svg>`;

// ── 通道发现 (调度列表第一个, 供绑定/弹窗) ──
const schedChs = async () => (jbody(await api('GET', '/api/v1/inference/channels'))?.data?.channels ?? []);
const CH_ID = String((await schedChs())[0]?.channel_id ?? '');
if (!CH_ID) { console.error('[FATAL] 调度列表为空, 无法测绑定'); process.exit(1); }
console.log(`[操作通道] ${CH_ID}`);

// ── 前置清理 (幂等) ──
const allMaps = async () => (jbody(await api('GET', '/api/v1/maps'))?.data?.items ?? []);
for (const m of await allMaps()) {
  if (m.name === MAP1_NAME || m.name === MAP2_NAME) await api('DELETE', `/api/v1/maps/${m.id}`);
}
await api('DELETE', `/api/v1/linkage/rules/${RULE_ID}`);
const allRules = async () => (jbody(await api('GET', '/api/v1/linkage/rules/all'))?.data?.items ?? []);

// ═══ M1: 平面图 CRUD ═══
const c1 = jbody(await api('POST', '/api/v1/maps', {
  name: MAP1_NAME, building: '验证楼', floor: 'F1', scene_tag: 'school_campus', scale_m_per_px: 0.05,
}));
const MAP1 = c1?.data?.id ?? c1?.id;
check('M1a 创建平面图 (元数据)', !!MAP1 && (c1?.code === 0 || c1?.code === undefined), `code=${c1?.code} id=${MAP1}`);

const b64 = Buffer.from(TEST_SVG, 'utf8').toString('base64');
const c2 = jbody(await api('POST', `/api/v1/maps/${MAP1}/image`, { image_data: b64, filename: 'verify.svg' }));
const m1img = (await allMaps()).find(m => m.id === MAP1);
check('M1b SVG 上传 → 宽高回写 (viewBox 800x600)', m1img?.width_px === 800 && m1img?.height_px === 600 && String(m1img?.image_type) === 'svg',
  `w=${m1img?.width_px} h=${m1img?.height_px} type=${m1img?.image_type}`);

check('M1c 列表可见 + image_path', !!(m1img && String(m1img.image_path || '').includes(`/floormaps/${MAP1}.svg`)), `image_path=${m1img?.image_path}`);

const imgHttp = await raw(`/floormaps/${MAP1}.svg`);
check('M1d 底图静态服务 (/floormaps/:id.svg)', imgHttp.status === 200 && imgHttp.body.includes('<svg'), `status=${imgHttp.status} len=${imgHttp.body.length}`);

const c5 = jbody(await api('PUT', `/api/v1/maps/${MAP1}`, { name: MAP1_NAME, building: '验证楼-改' }));
const m1e = (await allMaps()).find(m => m.id === MAP1);
check('M1e PUT 元数据编辑 + contains 守卫 (未传字段保留)', m1e?.building === '验证楼-改' && m1e?.floor === 'F1' && m1e?.width_px === 800,
  `building=${m1e?.building} floor=${m1e?.floor} w=${m1e?.width_px}`);

// ═══ M2: 摄像头绑定 ═══
const b1 = jbody(await api('POST', `/api/v1/maps/${MAP1}/cameras`, {
  channel_id: CH_ID, pos_x: 0.3, pos_y: 0.4, fov_yaw: 45, fov_radius_m: 20, is_primary: true,
}));
check('M2a 绑定落点 (is_primary)', b1?.code === 0 || b1?.code === undefined, `code=${b1?.code}`);

const binds = () => api('GET', `/api/v1/maps/${MAP1}/cameras`).then(r => jbody(r)?.data?.items ?? []);
const bs1 = await binds();
check('M2b 绑定持久化', bs1.length === 1 && bs1[0]?.channel_id === CH_ID && (bs1[0]?.is_primary === 1 || bs1[0]?.is_primary === true),
  `len=${bs1.length} ch=${bs1[0]?.channel_id} primary=${bs1[0]?.is_primary}`);

const b2 = jbody(await api('POST', `/api/v1/maps/${MAP1}/cameras`, {
  channel_id: CH_ID, pos_x: 0.6, pos_y: 0.55, fov_yaw: 90, fov_radius_m: 25, is_primary: true,
}));
const bs2 = await binds();
check('M2c 二次 upsert 更新不重复 (UNIQUE map+channel)', bs2.length === 1 && Math.abs(bs2[0]?.pos_x - 0.6) < 0.001,
  `len=${bs2.length} pos_x=${bs2[0]?.pos_x}`);

const byCh = jbody(await api('GET', `/api/v1/maps/by-channel/${encodeURIComponent(CH_ID)}`))?.data?.items ?? [];
check('M2d by-channel 反查主图在前', byCh.length >= 1 && byCh[0]?.map?.id === MAP1 && !!(byCh[0]?.binding?.is_primary),
  `len=${byCh.length} first=${byCh[0]?.map?.id} primary=${byCh[0]?.binding?.is_primary}`);

// ═══ M3: 规则 map_ids 透传 ═══
const c2map = jbody(await api('POST', '/api/v1/maps', { name: MAP2_NAME, building: '验证楼', floor: 'F2', scene_tag: 'hotel_unattended', scale_m_per_px: 0.08 }));
const MAP2 = c2map?.data?.id ?? c2map?.id;

const mkRule = (mapIds) => api('POST', '/api/v1/linkage/rules', {
  id: RULE_ID, name: '测试-平面图联动V', description: '平面图验证用, 结束删除', enabled: false, priority: 50, cooldown_ms: 5000,
  source_cond: { channel_ids: [], device_ids: [], event_types: ['intrusion'], algorithm_ids: [], min_severity: 0, min_confidence: 0, map_ids: mapIds },
  actions: [{ type: 200, target: 1, name: 'Web弹窗', enabled: true, channel_id: '', device_id: '', delay_ms: 0 }],
});
const r1 = jbody(await mkRule([MAP1]));
const ruleOf = async () => (await allRules()).find(r => r.id === RULE_ID);
const rr1 = await ruleOf();
check('M3a 规则创建带 map_ids → GET 回读一致', (r1?.code === 0 || r1?.code === undefined) && JSON.stringify(rr1?.source_cond?.map_ids ?? []) === JSON.stringify([MAP1]),
  `code=${r1?.code} map_ids=${JSON.stringify(rr1?.source_cond?.map_ids ?? null)}`);

// PUT 只传 enabled (列表行 toggle / 简易抽屉形态) → map_ids 不得丢
await api('PUT', `/api/v1/linkage/rules/${RULE_ID}`, { enabled: true });
const rr2 = await ruleOf();
check('M3b PUT {enabled} 守卫: map_ids 保留', JSON.stringify(rr2?.source_cond?.map_ids ?? []) === JSON.stringify([MAP1]) && rr2?.enabled === true,
  `enabled=${rr2?.enabled} map_ids=${JSON.stringify(rr2?.source_cond?.map_ids ?? null)}`);

// PUT 带完整 source_cond (编辑抽屉保存形态) → map_ids 更新
await api('PUT', `/api/v1/linkage/rules/${RULE_ID}`, {
  source_cond: { channel_ids: [], device_ids: [], event_types: ['intrusion'], algorithm_ids: [], min_severity: 0, min_confidence: 0, map_ids: [MAP1, MAP2] },
});
const rr3 = await ruleOf();
check('M3c PUT source_cond (编辑抽屉形态) map_ids 更新', JSON.stringify(rr3?.source_cond?.map_ids ?? []) === JSON.stringify([MAP1, MAP2]),
  `map_ids=${JSON.stringify(rr3?.source_cond?.map_ids ?? null)}`);

// ── UI (Playwright) ──
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await ctx.addCookies([{ name: 'shieldai_token', value: TOKEN, url: `http://127.0.0.1:${PORT}` }]);
await ctx.addInitScript(([u]) => { localStorage.setItem('shieldai_user', JSON.stringify(u)); }, [ad.user ?? { username: 'admin', roles: ['admin'] }]);

/** 弹窗注入 + 地图 Tab + plan 模式, 返回就绪后的 page
 *  注: page.evaluate(fn, [arg]) 惯例 — 参数包数组 + 函数签名解构 (照 algosync addInitScript 模式),
 *     不解构则收到数组本体 → normalize 后 channelId 为空 → 反查永远空 (曾致 U3 误报)。 */
async function popupMapReady(alarm) {
  await page.goto(`http://127.0.0.1:${PORT}/?popuptest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body', { timeout: 20000 });
  await page.waitForFunction(() => typeof window.__popupTest !== 'undefined', null, { timeout: 20000 });
  await page.evaluate(([a]) => window.__popupTest.showAlarmPopup(a), [alarm]);
  await page.locator('.alarm-popup__tab', { hasText: '联动地图位置' }).click();
  await page.locator('.alarm-popup__map-switcher .alarm-popup__map-thumb').first().click(); // plan
  await page.waitForTimeout(2500); // mapsByChannel 异步反查 + FloorMapCanvas 渲染
}

try {
  // U1: /maps 管理页 (左侧卡片 + 编辑画布)
  await page.goto(`http://127.0.0.1:${PORT}/maps`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.floormap-view__card', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const cardTxt = await page.locator('.floormap-view__card').allTextContents();
  const u1a = cardTxt.some(t => t.includes(MAP1_NAME)) && cardTxt.some(t => t.includes(MAP2_NAME));
  check('U1a /maps 页面卡片列表 (两张测试图)', u1a, `cards=${cardTxt.length}`);
  const u1b = await page.locator('.floormap-view__canvas-wrap .fm-canvas').count();
  check('U1b 编辑画布 FloorMapCanvas 渲染', u1b >= 1, `canvas=${u1b}`);

  // U2: /linkage 列表「适用地图」列
  await page.goto(`http://127.0.0.1:${PORT}/linkage`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.el-table__row', { timeout: 20000 });
  await page.locator('input[placeholder="搜索规则名称..."]').fill('测试-平面图联动V');
  await page.waitForTimeout(1200);
  const row = page.locator('.el-table__row').filter({ hasText: '测试-平面图联动V' }).first();
  const rowTxt = await row.textContent().catch(() => '');
  check('U2 联动列表「适用地图」列 el-tag 展示', rowTxt.includes(MAP1_NAME) && rowTxt.includes(MAP2_NAME),
    `tags=${(rowTxt.match(/测试-平面图V[^\s|]*/g) || []).join(',')}`);

  // U3: 弹窗 bound 通道 → 真实平面图渲染
  await popupMapReady({
    id: 'verify-fm-alarm-1', type: 'intrusion', level: 2, description: '平面图验证-bound',
    channelId: CH_ID, channel_id: CH_ID,
    metadata: { bbox: [0.4, 0.5, 0.6, 0.75] },
  });
  const liveOk = await page.locator('.alarm-popup__map-live').isVisible().catch(() => false);
  const camN = await page.locator('.alarm-popup__map-live .fm-canvas__cam').count();
  const rippleN = await page.locator('.alarm-popup__map-live .fm-canvas__ripple').count();
  const imgOk = await page.locator('.alarm-popup__map-live .fm-canvas__img').isVisible().catch(() => false);
  check('U3a bound 通道弹窗: map-live 真实渲染 (非 GPS 占位)', liveOk, `visible=${liveOk}`);
  check('U3b 画布摄像头图标 (绑定通道)', camN >= 1, `cams=${camN}`);
  check('U3c 告警落点涟漪 + bbox (近似投影)', rippleN >= 1, `ripples=${rippleN}`);
  check('U3d 底图渲染 (静态服务回源)', imgOk, `img=${imgOk}`);

  // U4: 弹窗 unbound 通道 → GPS 占位兜底
  await popupMapReady({
    id: 'verify-fm-alarm-2', type: 'intrusion', level: 2, description: '平面图验证-unbound',
    channelId: 'verify_unbound_ch_xx', channel_id: 'verify_unbound_ch_xx',
    metadata: { bbox: [0.4, 0.5, 0.6, 0.75] },
  });
  const phOk = await page.locator('.alarm-popup__map-placeholder').isVisible().catch(() => false);
  const liveBad = await page.locator('.alarm-popup__map-live').isVisible().catch(() => false);
  check('U4 unbound 通道弹窗: GPS 占位兜底 (零破坏)', phOk && !liveBad, `placeholder=${phOk} live=${liveBad}`);
} catch (e) {
  check('UI 场景执行 (异常中断)', false, String(e?.message || e).slice(0, 160));
} finally {
  // ── 清理: 删规则 + 删地图 (级联 binding + 底图文件) + 列表复原检查 ──
  await api('DELETE', `/api/v1/linkage/rules/${RULE_ID}`);
  await api('DELETE', `/api/v1/maps/${MAP2}`);
  await api('DELETE', `/api/v1/maps/${MAP1}`);
  const mapsAfter = (await allMaps()).filter(m => m.name === MAP1_NAME || m.name === MAP2_NAME);
  const ruleAfter = await ruleOf();
  const byChAfter = jbody(await api('GET', `/api/v1/maps/by-channel/${encodeURIComponent(CH_ID)}`))?.data?.items ?? [];
  const cleaned = mapsAfter.length === 0 && !ruleAfter;
  check('C1 清理复原 (规则+双图+绑定级联)', cleaned && !byChAfter.some(p => p?.map?.id === MAP1),
    `maps=${mapsAfter.length} rule=${!!ruleAfter} byCh=${byChAfter.length}`);
  await browser.close();
}

const pass = results.filter(r => r.ok).length;
console.log(`\n===== FLOOR-MAP VERIFY: ${pass}/${results.length} =====`);
process.exit(pass === results.length ? 0 : 1);
