<template>
  <div class="floormap-view" :class="{ 'is-side-collapsed': sideCollapsed }">
    <!-- ═══ [FLOOR-MAP 2026-09-05 v3] 左侧: 平面图库资源列表 ═══
         卡片化 (缩略图+建筑/楼层+场景+设备统计+更新时间) + 关键字搜索 +
         建筑/楼层折叠分组 + 空态引导 + ≤1400px 折叠图标条 (华为 IVS 楼层切换对标) -->
    <aside class="floormap-view__side" :class="{ 'is-collapsed': sideCollapsed }">
      <div class="floormap-view__side-head">
        <el-tooltip :content="sideCollapsed ? '展开图库' : '收起图库'" placement="right">
          <button type="button" class="floormap-view__side-fold" @click="sideCollapsed = !sideCollapsed">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M15.5 5 8.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </el-tooltip>
        <span v-if="!sideCollapsed" class="floormap-view__side-title">平面图库</span>
        <span v-if="!sideCollapsed" class="floormap-view__side-count">{{ maps.length }}</span>
        <el-button type="primary" size="small" @click="openCreate">新建</el-button>
      </div>

      <template v-if="!sideCollapsed">
        <!-- [v4-A2] 搜索 + 场景筛选 + 组内排序 (华为 IVS 资源列表对标) -->
        <div class="floormap-view__side-filters">
          <el-input
            ref="searchBoxRef"
            v-model="keyword"
            placeholder="搜索名称 / 建筑 / 楼层"
            size="small"
            clearable
            :prefix-icon="Search"
          />
          <el-select
            v-model="sceneFilter"
            placeholder="全部场景"
            clearable
            size="small"
          >
            <el-option
              v-for="s in FLOOR_MAP_SCENES"
              :key="s.value"
              :value="s.value"
              :label="s.label"
            />
          </el-select>
          <el-select v-model="sortMode" size="small" class="floormap-view__sort" title="组内排序">
            <el-option value="floor" label="按楼层" />
            <el-option value="time" label="最近编辑优先" />
            <el-option value="name" label="按名称" />
            <el-option value="devs" label="按设备数" />
          </el-select>
        </div>

        <!-- [v4-A2] 快捷过滤 chips: 仅主图 / 仅空图 / 仅含告警 + 批量模式入口 -->
        <div class="floormap-view__quick-chips">
          <button
            v-for="q in QUICK_FILTERS"
            :key="q.value"
            type="button"
            class="floormap-view__chip"
            :class="{ 'is-on': quickFilter === q.value }"
            @click="quickFilter = quickFilter === q.value ? '' : q.value"
          >{{ q.label }}</button>
          <span class="floormap-view__chips-spacer" />
          <button
            type="button"
            class="floormap-view__chip"
            :class="{ 'is-on': batchMode }"
            @click="toggleBatch"
          >{{ batchMode ? '退出批量' : '批量' }}</button>
        </div>

        <!-- [v4-A2] 批量操作条 (勾选 N 张 → 删除 / 改场景 / 导出) -->
        <div v-if="batchMode" class="floormap-view__batch-bar">
          <span class="floormap-view__batch-count">已选 {{ checkedIds.size }} 张</span>
          <el-button size="small" type="danger" plain :disabled="!checkedIds.size" @click="batchDelete">删除</el-button>
          <el-select
            v-model="batchScene"
            size="small"
            placeholder="改场景"
            :disabled="!checkedIds.size"
            class="floormap-view__batch-scene"
            @change="batchSetScene"
          >
            <el-option v-for="s in FLOOR_MAP_SCENES" :key="s.value" :value="s.value" :label="s.label" />
          </el-select>
          <el-button size="small" :disabled="!checkedIds.size" @click="batchExport">导出</el-button>
        </div>

        <div class="floormap-view__cards">
          <!-- 建筑/楼层折叠分组 (研华层级分组对标; 未指定建筑归入默认组; [v4-A2] 组内排序可切) -->
          <div v-for="g in groupedMaps" :key="g.key" class="floormap-view__group">
            <button type="button" class="floormap-view__group-head" @click="toggleGroup(g.key)">
              <svg
                viewBox="0 0 24 24" width="12" height="12"
                :style="{ transform: collapsedGroups.has(g.key) ? 'rotate(-90deg)' : 'none' }"
              >
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="floormap-view__group-label">{{ g.label }}</span>
              <span class="floormap-view__group-count">{{ g.maps.length }}</span>
            </button>
            <div v-show="!collapsedGroups.has(g.key)" class="floormap-view__group-body">
              <!-- [v4-A1] 卡片信息密度: 尺寸/比例尺双格式/场景着色/主图星标 + hover 快捷操作 + 批量勾选 -->
              <div
                v-for="m in g.maps"
                :key="m.id"
                class="floormap-view__card"
                :class="{ 'is-active': !batchMode && m.id === selectedId, 'is-checked': checkedIds.has(m.id), 'is-kb': kbMaps[kbIdx]?.id === m.id }"
                :data-id="m.id"
                @click="batchMode ? toggleCheck(m.id) : selectMap(m.id)"
              >
                <el-checkbox
                  v-if="batchMode"
                  :model-value="checkedIds.has(m.id)"
                  class="floormap-view__card-check"
                  @change="toggleCheck(m.id)"
                  @click.stop
                />
                <div class="floormap-view__card-thumb">
                  <img v-if="m.image_path" :src="floorMapApi.getImageUrl(m)" alt="" >
                  <svg v-else viewBox="0 0 48 48" width="30" height="30">
                    <rect x="5" y="8" width="38" height="30" fill="none" stroke="#3A5A8C" stroke-width="2" />
                    <path d="M5 18h38M17 18v20" stroke="#3A5A8C" stroke-width="2" />
                  </svg>
                  <span v-if="primaryCount(m)" class="floormap-view__card-star" title="含主图绑定">主</span>
                </div>
                <div class="floormap-view__card-info">
                  <div class="floormap-view__card-name">{{ m.name }}</div>
                  <div class="floormap-view__card-meta">
                    <span v-if="m.floor">{{ m.floor }}</span>
                    <span v-if="m.width_px" class="floormap-view__card-dims">{{ m.width_px }}×{{ m.height_px }}</span>
                    <span class="floormap-view__card-time">{{ fmtTime(m.updated_at) }}</span>
                  </div>
                  <div class="floormap-view__card-spec">
                    <span :title="`比例尺 ${m.scale_m_per_px} 米/像素`">{{ fmtScale(m.scale_m_per_px) }}</span>
                  </div>
                  <div class="floormap-view__card-tags">
                    <span
                      v-if="m.scene_tag"
                      class="floormap-view__card-scene"
                      :style="{ '--sc': sceneTagColor(m.scene_tag) }"
                    >{{ sceneTagLabel(m.scene_tag) }}</span>
                    <span class="floormap-view__card-devs" :title="m.cameras.map(b => bindingName(b)).join('、') || '无绑定设备'">
                      <span
                        v-for="d in mapTypeDots(m)"
                        :key="d.t"
                        class="floormap-view__card-dot"
                        :style="{ background: d.color }"
                      />
                      {{ m.cameras.length }} 设备
                    </span>
                  </div>
                </div>
                <!-- [v4-A1] hover 快捷操作: 编辑 / 复制整图 / 删除 -->
                <div v-if="!batchMode" class="floormap-view__card-ops" @click.stop>
                  <button type="button" title="编辑" @click="selectMap(m.id)"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
                  <button type="button" title="复制整图（含点位）" :class="{ 'is-busy': copyingId === m.id }" @click="copyMap(m)"><svg viewBox="0 0 24 24" width="13" height="13"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
                  <button type="button" title="删除" class="is-danger" @click="confirmDeleteMap(m)"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
                </div>
              </div>
            </div>
          </div>

          <!-- [v4-A3] 空态: 库内有图但筛选无结果 -->
          <div v-if="!groupedMaps.length && maps.length" class="floormap-view__side-empty">
            <svg viewBox="0 0 64 64" width="56" height="56">
              <defs><linearGradient id="fmEs1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3294ED" stop-opacity=".35"/><stop offset="1" stop-color="#3294ED" stop-opacity=".08"/></linearGradient></defs>
              <circle cx="27" cy="27" r="16" fill="url(#fmEs1)" stroke="#3A5A8C" stroke-width="2.4"/>
              <path d="M39 39l11 11" stroke="#3A5A8C" stroke-width="3" stroke-linecap="round"/>
              <path d="M20 27h14M27 20v14" stroke="#7FB8F0" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
            <p>没有匹配的平面图</p>
            <p class="floormap-view__side-empty-sub">调整关键字、场景或快捷过滤试试</p>
          </div>
          <!-- [v4-A3] 空态: 全空大插画 + 三步引导 + 示例模板 (海康空库引导对标) -->
          <div v-else-if="!maps.length" class="floormap-view__side-empty floormap-view__side-empty--big">
            <svg viewBox="0 0 96 72" width="96" height="72">
              <defs>
                <linearGradient id="fmEs2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#3294ED" stop-opacity=".45"/><stop offset="1" stop-color="#3294ED" stop-opacity=".05"/>
                </linearGradient>
                <linearGradient id="fmEs3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#7FB8F0" stop-opacity=".5"/><stop offset="1" stop-color="#7FB8F0" stop-opacity=".1"/>
                </linearGradient>
              </defs>
              <rect x="14" y="10" width="68" height="46" rx="4" fill="url(#fmEs2)" stroke="#3A5A8C" stroke-width="2"/>
              <path d="M14 22h68M32 22v34M58 10v12" stroke="#3A5A8C" stroke-width="1.8"/>
              <rect x="38" y="28" width="16" height="12" rx="2" fill="url(#fmEs3)" opacity=".8"/>
              <circle cx="26" cy="34" r="3.2" fill="#3294ED"/>
              <circle cx="70" cy="40" r="3.2" fill="#22C55E"/>
              <circle cx="48" cy="52" r="3.2" fill="#F59E0B"/>
              <path d="M26 34l44 6" stroke="#3294ED" stroke-width="1.4" stroke-dasharray="3 3"/>
            </svg>
            <p class="floormap-view__side-empty-title">暂无平面图</p>
            <ol class="floormap-view__empty-steps">
              <li><i>1</i>上传一张底图 (SVG / PNG / JPG / PDF)</li>
              <li><i>2</i>填写建筑、楼层与场景元数据</li>
              <li><i>3</i>在画布上落点绑定设备</li>
            </ol>
            <div class="floormap-view__empty-actions">
              <el-button type="primary" size="small" @click="openCreate">新建平面图</el-button>
              <el-button size="small" :loading="loadingTemplate" @click="loadTemplate">加载示例模板</el-button>
            </div>
          </div>
        </div>
      </template>

      <!-- 折叠态: 图标条 (≤1400px 初始自动折叠; [v4-A4] 设备数徽标 + tooltip 含建筑/楼层/时间) -->
      <div v-else class="floormap-view__rail">
        <el-tooltip content="新建平面图" placement="right">
          <button type="button" class="floormap-view__rail-btn" @click="openCreate">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          </button>
        </el-tooltip>
        <el-tooltip
          v-for="m in maps"
          :key="m.id"
          placement="right"
          :content="`${m.name} · ${m.building || '未指定建筑'} ${m.floor || ''} · ${m.cameras.length} 设备 · ${fmtTime(m.updated_at)}`"
        >
          <button
            type="button"
            class="floormap-view__rail-thumb"
            :class="{ 'is-active': m.id === selectedId }"
            @click="selectMap(m.id)"
          >
            <img v-if="m.image_path" :src="floorMapApi.getImageUrl(m)" alt="" >
            <svg v-else viewBox="0 0 48 48" width="20" height="20">
              <rect x="5" y="8" width="38" height="30" fill="none" stroke="#3A5A8C" stroke-width="3" />
              <path d="M5 18h38" stroke="#3A5A8C" stroke-width="3" />
            </svg>
            <span v-if="m.cameras.length" class="floormap-view__rail-badge">{{ m.cameras.length }}</span>
          </button>
        </el-tooltip>
      </div>
    </aside>

    <!-- ═══ 右侧: 编辑器 ═══ -->
    <section class="floormap-view__main">
      <template v-if="selectedMap">
        <!-- 元数据工具条 -->
        <!-- [v4-D14] 新手引导横幅: 创建后出现, 3 步气泡, 可关闭不再显示 -->
        <div v-if="guideVisible" class="floormap-view__guide">
          <span class="floormap-view__guide-title">快速上手</span>
          <span class="floormap-view__guide-step">① 选设备点画布落点</span>
          <span class="floormap-view__guide-step">② 拖拽图标微调位置</span>
          <span class="floormap-view__guide-step">③ 填元数据保存</span>
          <el-button link size="small" class="floormap-view__guide-close" @click="dismissGuide">不再显示</el-button>
        </div>
        <div class="floormap-view__toolbar">
          <el-input v-model="form.name" class="floormap-view__ipt" placeholder="名称" size="small" />
          <el-input v-model="form.building" class="floormap-view__ipt" placeholder="建筑" size="small" />
          <el-input v-model="form.floor" class="floormap-view__ipt floormap-view__ipt--s" placeholder="楼层" size="small" />
          <el-select v-model="form.scene_tag" class="floormap-view__ipt floormap-view__ipt--s" placeholder="场景" size="small" clearable>
            <el-option v-for="s in FLOOR_MAP_SCENES" :key="s.value" :value="s.value" :label="s.label" />
          </el-select>
          <el-input-number
            v-model="form.scale_m_per_px"
            :min="0.001" :max="5" :step="0.01" :precision="3"
            class="floormap-view__ipt--num"
            size="small"
          />
          <span class="floormap-view__unit">米/像素</span>
          <div class="floormap-view__toolbar-spacer" />
          <!-- [P0-2] 栅格吸附开关 (默认开; 密集落点防重叠) -->
          <span class="floormap-view__snap">
            <el-switch v-model="snapEnabled" size="small" />
            吸附
          </span>
          <el-upload
            :show-file-list="false"
            :http-request="onUploadImage"
            accept=".svg,.png,.jpg,.jpeg"
          >
            <el-button size="small" :loading="uploading">上传底图</el-button>
          </el-upload>
          <el-button size="small" type="primary" :loading="savingMeta" @click="saveMeta">保存</el-button>
          <el-button size="small" type="danger" plain @click="removeMap">删除</el-button>
        </div>

        <!-- 画布 + 绑定面板 -->
        <div class="floormap-view__editor">
          <div class="floormap-view__canvas-wrap">
            <FloorMapCanvas
              :map="selectedMap"
              :bindings="selectedMap.cameras"
              :editable="true"
              :channel-labels="channelLabels"
              :channel-online="channelOnline"
              :snap-to-grid="snapEnabled"
              :alarm-channels="alarmChannels"
              :highlight-channel-id="focusChannelId"
              :ghost-type="pendingChannel ? pendingType : ''"
              @canvas-click="onCanvasClick"
              @binding-move="onBindingMove"
            />
            <div v-if="pendingChannel" class="floormap-view__pending-tip">
              正在放置: {{ pendingDesc }} — 点击画布落点
              <el-button link size="small" @click="pendingChannel = ''">取消</el-button>
            </div>

            <!-- [v4-C10] 落点成功浮层 (Popconfirm 风格): 继续添加 / 查看详情 / 关闭 -->
            <transition name="fm-drop">
              <div v-if="dropOk" class="floormap-view__drop-ok">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.16)" stroke="#22C55E" stroke-width="2"/>
                  <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#22C55E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="floormap-view__drop-ok-txt" :title="dropOk.ch">已落点 {{ dropOk.ch }}</span>
                <el-button size="small" type="primary" plain @click="continueDrop">继续添加</el-button>
                <el-button size="small" @click="viewDropped">查看详情</el-button>
                <el-button link size="small" @click="dropOk = null">关闭</el-button>
              </div>
            </transition>

            <!-- [UX] 地图上显眼的添加入口: 类型网格 → 选通道/输编号 → 点画布 (宇视工具箱对标)
                 与右侧面板共享 pendingType/pendingChannel 状态, 两条路径均可落点
                 [v4-C9] 搜索筛选 + 数量徽标 + 最近使用置顶 (localStorage 记忆)
                 [v4-G] 按需展开: 默认只留轻量入口按钮, 点击唤出; 单次落点后自动收起, 连续模式保持;
                       ESC/外点/head× 可手动收起 (收起同步清待放态防幽灵残留) -->
            <div class="floormap-view__add-kit">
              <!-- 收起态入口 -->
              <button
                v-if="!kitOpen"
                type="button"
                class="floormap-view__add-kit-entry"
                title="展开添加设备工具箱"
                @click="openKit"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
                </svg>
                <span>添加设备</span>
              </button>
              <!-- 展开态: 完整工具箱 (v4-C 全量保留) -->
              <transition name="fm-kit">
                <div v-if="kitOpen" class="floormap-view__add-kit-body">
                  <div class="floormap-view__add-kit-head">
                    <span>＋ 添加设备</span>
                    <span v-if="kitRecent.length" class="floormap-view__add-kit-rec" title="最近使用的类型自动置顶">最近置顶</span>
                    <button type="button" class="floormap-view__add-kit-close" title="收起工具箱 (ESC)" @click="closeKit">
                      <svg viewBox="0 0 24 24" width="12" height="12"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
                    </button>
                  </div>
                  <el-input
                    v-model="kitKeyword"
                    size="small"
                    clearable
                    placeholder="搜索设备类型"
                    :prefix-icon="Search"
                    class="floormap-view__add-kit-search"
                  />
                  <div v-if="kitTypes.length" class="floormap-view__add-kit-grid">
                    <button
                      v-for="t in kitTypes"
                      :key="t.value"
                      type="button"
                      class="floormap-view__add-kit-type"
                      :class="{ 'is-active': pendingType === t.value, 'is-recent': kitRecent[0] === t.value }"
                      :title="`${t.label} (当前图 ${typeCount(t.value)} 个)`"
                      @click="pendingType = t.value"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <circle cx="12" cy="12" r="11" :fill="deviceIconMeta(t.value).color" />
                        <path :d="deviceIconMeta(t.value).path" fill="#fff" />
                      </svg>
                      <span>{{ t.label }}</span>
                      <span class="floormap-view__add-kit-count" :class="{ 'is-zero': !typeCount(t.value) }">{{ typeCount(t.value) }}</span>
                    </button>
                  </div>
                  <div v-else class="floormap-view__add-kit-nohit">无匹配类型</div>
                  <div class="floormap-view__add-kit-pick">
                    <el-select
                      v-if="pendingType === 'camera'"
                      v-model="pendingChannel"
                      placeholder="选择通道"
                      size="small"
                      filterable
                      clearable
                    >
                      <el-option
                        v-for="ch in channelOptions"
                        :key="chKey(ch)"
                        :value="chKey(ch)"
                        :label="ch.name || chKey(ch)"
                      />
                    </el-select>
                    <el-input
                      v-else
                      v-model="pendingChannel"
                      :placeholder="`${deviceTypeLabel(pendingType)} 编号`"
                      size="small"
                      clearable
                    />
                  </div>
                  <!-- [v4-C10] 连续落点模式: 落点后不清编号 (非 camera 自动递增 SOS-001→002) -->
                  <label class="floormap-view__add-kit-cont">
                    <el-checkbox v-model="continuousMode" size="small">连续落点</el-checkbox>
                    <span class="floormap-view__add-kit-cont-sub">{{ pendingType === 'camera' ? '落点后保留通道' : '编号自动递增' }}</span>
                  </label>
                  <div class="floormap-view__add-kit-hint">
                    {{ pendingChannel ? (continuousMode ? '连续模式: 点画布连续落点' : '点击地图落点（自动吸附栅格）') : '选类型后选通道/输编号' }}
                  </div>
                </div>
              </transition>
            </div>
          </div>

          <!-- 设备绑定面板 ([P0-1] 通用化 + [v4-B5/B6/B7/B8] 批量/搜索/导入导出/状态) -->
          <div class="floormap-view__panel">
            <div class="floormap-view__panel-head">
              <span>设备绑定</span>
              <el-select
                v-model="pendingType"
                size="small"
                class="floormap-view__panel-select"
              >
                <el-option
                  v-for="t in FLOOR_MAP_DEVICE_TYPES"
                  :key="t.value"
                  :value="t.value"
                  :label="t.label"
                />
              </el-select>
            </div>
            <div class="floormap-view__panel-pick">
              <el-select
                v-if="pendingType === 'camera'"
                v-model="pendingChannel"
                placeholder="选择通道后点画布落点"
                size="small"
                filterable
                class="floormap-view__panel-pick-ipt"
              >
                <el-option
                  v-for="ch in channelOptions"
                  :key="chKey(ch)"
                  :value="chKey(ch)"
                  :label="ch.name || chKey(ch)"
                />
              </el-select>
              <el-input
                v-else
                v-model="pendingChannel"
                :placeholder="`${deviceTypeLabel(pendingType)} 设备编号`"
                size="small"
                clearable
                class="floormap-view__panel-pick-ipt"
              />
            </div>

            <!-- [v4-B7] 点位导入/导出 + 跨图复制粘贴 (零后端: JSON 下载/解析循环 upsert) -->
            <div class="floormap-view__panel-io">
              <el-button size="small" @click="exportBindings">导出点位</el-button>
              <el-upload
                :show-file-list="false"
                :auto-upload="false"
                accept=".json,.csv"
                :on-change="onImportFile"
                class="floormap-view__panel-io-up"
              >
                <el-button size="small">导入点位</el-button>
              </el-upload>
              <el-button size="small" @click="copyBindings">复制点位</el-button>
              <el-button size="small" :disabled="!fmClipboardCount" @click="pasteBindings">粘贴 ({{ fmClipboardCount }})</el-button>
            </div>

            <!-- [v4-B6] 搜索 + 类型过滤 chips (50+ 设备快速定位) -->
            <el-input
              v-model="bindKeyword"
              placeholder="搜编号 / 名称 / 类型"
              size="small"
              clearable
              :prefix-icon="Search"
              class="floormap-view__panel-search"
            />
            <div class="floormap-view__panel-chips">
              <button
                v-for="t in FLOOR_MAP_DEVICE_TYPES"
                :key="t.value"
                type="button"
                class="floormap-view__panel-chip"
                :class="{ 'is-hidden': hiddenTypes.has(t.value), 'is-zero': !typeCount(t.value) }"
                :title="`${t.label} ${typeCount(t.value)} 个 (点击显隐)`"
                @click="toggleTypeChip(t.value)"
              >
                <i :style="{ background: deviceIconMeta(t.value).color }" />{{ t.label }} {{ typeCount(t.value) }}
              </button>
            </div>

            <!-- [v4-B5] 批量行: 全选 + 批量解绑/设主图 -->
            <div class="floormap-view__panel-batch">
              <el-checkbox
                size="small"
                :model-value="allBindChecked"
                :indeterminate="someBindChecked && !allBindChecked"
                @change="toggleCheckAll"
              >全选</el-checkbox>
              <template v-if="bindChecked.size">
                <span class="floormap-view__panel-batch-count">{{ bindChecked.size }}</span>
                <el-button size="small" type="danger" plain @click="batchUnbind">解绑</el-button>
                <el-button size="small" @click="batchSetPrimary">设主图</el-button>
                <el-button link size="small" @click="bindChecked = new Set()">清空</el-button>
              </template>
            </div>
            <div class="floormap-view__bindings">
              <!-- [v4-B5] 按 device_type 分组折叠 (与左侧建筑分组对齐; 零数量类型不出现) -->
              <div v-for="g in groupedBindings" :key="g.type" class="floormap-view__bind-group">
                <button type="button" class="floormap-view__bind-group-head" @click="toggleBindGroup(g.type)">
                  <svg
                    viewBox="0 0 24 24" width="10" height="10"
                    :style="{ transform: bindCollapsed.has(g.type) ? 'rotate(-90deg)' : 'none' }"
                  >
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="11" :fill="deviceIconMeta(g.type).color"/><path :d="deviceIconMeta(g.type).path" fill="#fff"/></svg>
                  <span class="floormap-view__bind-group-label">{{ g.label }}</span>
                  <span class="floormap-view__bind-group-count">{{ g.list.length }}</span>
                </button>
                <div v-show="!bindCollapsed.has(g.type)" class="floormap-view__bind-group-body">
                  <div
                    v-for="b in g.list"
                    :key="b.id"
                    class="floormap-view__binding"
                    :class="{ 'is-dim': isBindingOffline(b), 'is-checked': bindChecked.has(b.id) }"
                    :data-ch="b.channel_id"
                  >
                    <div class="floormap-view__binding-row">
                      <el-checkbox
                        size="small"
                        :model-value="bindChecked.has(b.id)"
                        class="floormap-view__binding-check"
                        @change="toggleBindCheck(b.id)"
                      />
                      <!-- [v4-B8] 紧凑状态点: 告警红 / 在线绿 / 明确离线灰 (非网络设备不标) -->
                      <span
                        class="floormap-view__binding-status"
                        :class="alarmStats[b.channel_id] ? 'is-alarm' : (isBindingOffline(b) ? 'is-off' : 'is-on')"
                        :title="bindingStatusTitle(b)"
                      />
                      <span class="floormap-view__binding-name">{{ bindingName(b) }}</span>
                      <el-tag
                        size="small"
                        :type="b.device_type === 'camera' ? 'primary' : 'warning'"
                        effect="plain"
                      >
                        {{ deviceTypeLabel(b.device_type) }}
                      </el-tag>
                      <el-tag v-if="b.is_primary" size="small" type="success">主图</el-tag>
                      <!-- [v4-B8] 告警紧凑徽标: 24h N 次 + 最近时间 -->
                      <span
                        v-if="alarmStats[b.channel_id]"
                        class="floormap-view__binding-alarm"
                        :title="`24h 告警 ${alarmStats[b.channel_id].count} 次, 最近 ${fmtTime(alarmStats[b.channel_id].latest)}`"
                      >警{{ alarmStats[b.channel_id].count }}</span>
                      <div class="floormap-view__binding-spacer" />
                      <el-button link size="small" type="danger" @click="removeBinding(b)">解绑</el-button>
                    </div>
                <!-- camera: 朝向/半径/主图 (存量); 其他类型: 显示名 + 主图 -->
                <div
                  v-if="b.device_type === 'camera'"
                  class="floormap-view__binding-row floormap-view__binding-row--ctrl"
                >
                  <span class="floormap-view__binding-label">朝向</span>
                  <el-input-number
                    :model-value="b.fov_yaw" :min="-360" :max="360" :step="15"
                    size="small" controls-position="right"
                    @change="(v: number | undefined) => updateBinding(b, { fov_yaw: v ?? 0 })"
                  />
                  <span class="floormap-view__binding-label">半径m</span>
                  <el-input-number
                    :model-value="b.fov_radius_m" :min="1" :max="500" :step="5"
                    size="small" controls-position="right"
                    @change="(v: number | undefined) => updateBinding(b, { fov_radius_m: v ?? 20 })"
                  />
                  <div class="floormap-view__binding-spacer" />
                  <span class="floormap-view__binding-label">主图</span>
                  <el-switch
                    :model-value="b.is_primary"
                    size="small"
                    @change="(v: string | number | boolean) => updateBinding(b, { is_primary: !!v })"
                  />
                </div>
                <div v-else class="floormap-view__binding-row floormap-view__binding-row--ctrl">
                  <span class="floormap-view__binding-label">名称</span>
                  <el-input
                    :model-value="b.label"
                    size="small"
                    placeholder="显示名"
                    class="floormap-view__binding-ipt"
                    @change="(v: string) => updateBinding(b, { label: v })"
                  />
                  <div class="floormap-view__binding-spacer" />
                  <span class="floormap-view__binding-label">主图</span>
                  <el-switch
                    :model-value="b.is_primary"
                    size="small"
                    @change="(v: string | number | boolean) => updateBinding(b, { is_primary: !!v })"
                  />
                </div>
                </div>
              </div>
              </div>
              <!-- [v4-E17] 无绑定空态: 自定义插画 (线条+渐变填充, 56px, 替代 el-empty 简陋图) -->
              <div v-if="!selectedMap.cameras.length" class="floormap-view__bind-empty">
                <svg viewBox="0 0 64 48" width="56" height="42" aria-hidden="true">
                  <defs>
                    <linearGradient id="fmBindEmptyGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stop-color="rgba(50,148,237,0.20)"/>
                      <stop offset="1" stop-color="rgba(34,197,94,0.08)"/>
                    </linearGradient>
                  </defs>
                  <rect x="6" y="4" width="52" height="34" rx="4" fill="url(#fmBindEmptyGrad)" stroke="#3A5A8C" stroke-width="2"/>
                  <path d="M6 14h52M22 14v24M40 4v10" stroke="#3A5A8C" stroke-width="1.8" fill="none"/>
                  <circle cx="20" cy="28" r="4.6" fill="#3294ED"/>
                  <circle cx="36" cy="24" r="4.6" fill="#22C55E"/>
                  <circle cx="50" cy="30" r="4.6" fill="#F59E0B"/>
                  <path d="M20 28L36 24" stroke="#3294ED" stroke-width="1.4" stroke-dasharray="2.5 2.5" fill="none"/>
                  <path d="M46 38h12M52 32v12" stroke="#7FB8F0" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
                </svg>
                <p>暂无绑定设备</p>
                <p class="floormap-view__bind-empty-sub">从「添加设备」选类型 → 点画布落点</p>
              </div>
              <!-- [v4-B6] 搜索/过滤无结果空态 (区分全空) -->
              <div v-else-if="!groupedBindings.length" class="floormap-view__bind-nohit">
                <svg viewBox="0 0 48 48" width="36" height="36">
                  <circle cx="20" cy="20" r="12" fill="none" stroke="#3A5A8C" stroke-width="2.4"/>
                  <path d="M29 29l8 8" stroke="#3A5A8C" stroke-width="2.6" stroke-linecap="round"/>
                  <path d="M15 20h10M20 15v10" stroke="#7FB8F0" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>无匹配设备</p>
                <p class="floormap-view__bind-nohit-sub">调整关键字或类型过滤</p>
              </div>
            </div>
            <div v-if="gpsHint" class="floormap-view__gps-hint">{{ gpsHint }}</div>
          </div>
        </div>
      </template>
      <div v-else class="floormap-view__placeholder">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <rect x="10" y="14" width="44" height="36" rx="3" fill="none" stroke="#3A5A8C" stroke-width="2.4"/>
          <path d="M10 26h44M24 26v24M42 14v12" stroke="#3A5A8C" stroke-width="2.2"/>
          <circle cx="24" cy="40" r="3.4" fill="#3294ED"/>
          <circle cx="42" cy="34" r="3.4" fill="#22C55E"/>
          <path d="M24 40L42 34" stroke="#3294ED" stroke-width="1.6" stroke-dasharray="3 3"/>
        </svg>
        <p>从左侧选择平面图，或新建一张</p>
        <p class="floormap-view__placeholder-sub">三步向导: 上传底图 → 填写元数据 → 绑定设备</p>
      </div>
    </section>

    <!-- ═══ [FLOOR-MAP 2026-09-05 v3] 新建向导 (三步: 底图→元数据→创建并绑定) ═══
         el-dialog 600px + el-steps; 保存后选中新建图并预设 camera 落点引导 (宇视向导对标) -->
    <el-dialog
      v-model="wizardVisible"
      title="新建平面图"
      width="600px"
      :close-on-click-modal="false"
      class="floormap-wizard"
      @closed="onWizardClosed"
    >
      <el-steps :active="wizStep" simple>
        <el-step title="上传底图" />
        <el-step title="元数据" />
        <el-step title="创建" />
      </el-steps>

      <!-- Step 1: 拖拽/点击上传 + 本地预览 (不上传, 暂存 File)
           [v4-D11] PDF 第一帧提取 + 分辨率实时预览 + 文件名启发式回填名称 -->
      <div v-if="wizStep === 0" class="floormap-wizard__step">
        <el-upload
          drag
          class="floormap-wizard__upload"
          :auto-upload="false"
          :show-file-list="false"
          accept=".svg,.png,.jpg,.jpeg,.pdf"
          :on-change="onWizardFile"
        >
          <div v-if="!wizFileUrl" class="floormap-wizard__upload-empty">
            <svg viewBox="0 0 24 24" width="34" height="34">
              <path d="M12 16V5m0 0l-4 4m4-4l4 4" fill="none" stroke="#3294ED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" fill="none" stroke="#3A5A8C" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>拖拽底图到此处，或点击选择文件</p>
            <p class="floormap-wizard__upload-sub">支持 SVG / PNG / JPG / PDF (取第一帧)，不超过 15MB</p>
          </div>
          <img v-else :src="wizFileUrl" class="floormap-wizard__upload-preview" alt="底图预览" >
        </el-upload>
        <div v-if="wizPdfBusy" class="floormap-wizard__pdf-busy">PDF 第一帧提取中…</div>
        <div v-if="wizFile" class="floormap-wizard__file-row">
          <span class="floormap-wizard__file-name" :title="wizFile.name">{{ wizFile.name }}</span>
          <span class="floormap-wizard__file-size">{{ wizFile.type || '未知类型' }} · {{ fmtSize(wizFile.size) }}<template v-if="wizImgDims"> · {{ wizImgDims.w }}×{{ wizImgDims.h }}px</template></span>
          <el-button link size="small" type="danger" @click="clearWizardFile">移除</el-button>
        </div>
      </div>

      <!-- Step 2: 元数据表单 ([v4-D12] 名称建议/建筑 inline 新建/楼层快捷芯片/两点测比例尺) -->
      <div v-else-if="wizStep === 1" class="floormap-wizard__step">
        <el-form label-width="92px" label-position="right" size="default">
          <el-form-item label="名称" required>
            <el-input v-model="wizForm.name" placeholder="如: 教学楼A-1F" maxlength="40" show-word-limit />
            <el-button link size="small" class="floormap-wizard__suggest" @click="suggestName">⌁ 智能建议</el-button>
          </el-form-item>
          <el-form-item label="建筑">
            <el-select
              v-model="wizForm.building"
              filterable
              allow-create
              clearable
              default-first-option
              placeholder="选择或输入新建筑（同建筑自动分组）"
              style="width: 100%"
            >
              <el-option v-for="b in buildingOptions" :key="b" :value="b" :label="b" />
            </el-select>
          </el-form-item>
          <el-form-item label="楼层">
            <el-input v-model="wizForm.floor" placeholder="如: F1 / -1 / 厂区总平" maxlength="16" style="width: 160px" />
            <div class="floormap-wizard__floor-chips">
              <button v-for="f in FLOOR_CHIPS" :key="f" type="button" class="floormap-wizard__floor-chip" :class="{ 'is-on': wizForm.floor === f }" @click="wizForm.floor = wizForm.floor === f ? '' : f">{{ f }}</button>
            </div>
          </el-form-item>
          <el-form-item label="场景标签">
            <el-select v-model="wizForm.scene_tag" placeholder="选择场景（可空）" clearable style="width: 100%">
              <el-option v-for="s in FLOOR_MAP_SCENES" :key="s.value" :value="s.value" :label="s.label" />
            </el-select>
          </el-form-item>
          <el-form-item label="比例尺">
            <el-input-number v-model="wizForm.scale_m_per_px" :min="0.001" :max="5" :step="0.01" :precision="3" />
            <span class="floormap-wizard__unit">米/像素</span>
            <el-button link size="small" @click="wizScaleCalc = !wizScaleCalc">{{ wizScaleCalc ? '收起测算' : '两点测算' }}</el-button>
          </el-form-item>
          <!-- [v4-D12] 两点测算: 底图上点两个端点 + 输实际距离 → 反算 m/px -->
          <div v-if="wizScaleCalc" class="floormap-wizard__scale-calc">
            <div class="floormap-wizard__scale-img" @click="onScaleImgClick">
              <img :src="wizFileUrl" alt="" >
              <span
                v-for="(p, i) in wizScalePts"
                :key="i"
                class="floormap-wizard__scale-pt"
                :style="{ left: `${p.x}%`, top: `${p.y}%` }"
              >{{ i + 1 }}</span>
              <svg v-if="wizScalePts.length === 2" class="floormap-wizard__scale-line" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line
                  :x1="wizScalePts[0].x" :y1="wizScalePts[0].y"
                  :x2="wizScalePts[1].x" :y2="wizScalePts[1].y"
                  stroke="#00E5FF" stroke-width="0.6" stroke-dasharray="2 1.2"
                />
              </svg>
            </div>
            <div class="floormap-wizard__scale-row">
              <span>两点间距 {{ wizScalePx ? wizScalePx.toFixed(0) + ' px' : '—' }}</span>
              <el-input-number v-model="wizScaleReal" :min="0.1" :max="999" :step="1" :precision="1" size="small" controls-position="right" style="width: 110px" />
              <span>米</span>
              <el-button size="small" type="primary" plain :disabled="!wizScalePx" @click="applyScaleCalc">反算比例尺</el-button>
            </div>
            <div class="floormap-wizard__tip">在底图上点两个端点 (如一段已知长度的墙/门)，输入实际距离后反算</div>
          </div>
          <div class="floormap-wizard__tip">比例尺 = 每像素代表的米数，影响 FOV 扇形与告警落点换算；不确定可先默认，后续在工具栏修改</div>
        </el-form>
      </div>

      <!-- Step 3: 确认摘要 (split: 缩略图+元数据卡) → 创建 → 成功态
           [v4-D13] mini 效果预览 + [v4-D14] 下一步建议卡片 -->
      <div v-else class="floormap-wizard__step">
        <template v-if="!wizCreated">
          <div class="floormap-wizard__confirm">
            <img :src="wizFileUrl" class="floormap-wizard__confirm-thumb" alt="" >
            <dl class="floormap-wizard__confirm-meta">
              <div><dt>名称</dt><dd>{{ wizForm.name || '-' }}</dd></div>
              <div><dt>建筑 / 楼层</dt><dd>{{ wizForm.building || '-' }} / {{ wizForm.floor || '-' }}</dd></div>
              <div><dt>场景</dt><dd>{{ wizForm.scene_tag ? sceneTagLabel(wizForm.scene_tag) : '-' }}</dd></div>
              <div><dt>比例尺</dt><dd>{{ wizForm.scale_m_per_px }} 米/像素</dd></div>
              <div><dt>底图</dt><dd>{{ wizFile?.name }} ({{ wizFile ? fmtSize(wizFile.size) : '' }}<template v-if="wizImgDims"> · {{ wizImgDims.w }}×{{ wizImgDims.h }}px</template>)</dd></div>
            </dl>
          </div>
          <!-- [v4-D13] 地图效果预览: SVG 模拟设备落位后的编辑器形态 (camera FOV + 四类图标) -->
          <div class="floormap-wizard__mini">
            <div class="floormap-wizard__mini-label">效果预览</div>
            <svg viewBox="0 0 220 64" preserveAspectRatio="none">
              <rect x="1" y="1" width="218" height="62" rx="4" fill="#1F2D4A" stroke="#3A5A8C" stroke-width="1"/>
              <path d="M38 16L70 8 74 26Z" fill="rgba(0,229,255,0.18)"/>
              <g>
                <circle cx="38" cy="16" r="6" :fill="deviceIconMeta('camera').color" stroke="#22C55E" stroke-width="1.4"/>
                <path :d="deviceIconMeta('camera').path" fill="#fff" transform="translate(31,9) scale(0.58)"/>
              </g>
              <g>
                <circle cx="96" cy="42" r="5.4" :fill="deviceIconMeta('access').color"/>
                <path :d="deviceIconMeta('access').path" fill="#fff" transform="translate(90,36) scale(0.5)"/>
              </g>
              <g>
                <circle cx="150" cy="20" r="5.4" :fill="deviceIconMeta('smoke').color"/>
                <path :d="deviceIconMeta('smoke').path" fill="#fff" transform="translate(144,14) scale(0.5)"/>
              </g>
              <g>
                <circle cx="188" cy="46" r="5.4" :fill="deviceIconMeta('sos').color"/>
                <path :d="deviceIconMeta('sos').path" fill="#fff" transform="translate(182,40) scale(0.5)"/>
              </g>
              <text x="110" y="56" text-anchor="middle" fill="#4A5E80" font-size="7">创建后: 选设备 → 点画布落点 → 拖拽微调</text>
            </svg>
          </div>
          <div class="floormap-wizard__tip">创建后将自动选中并进入设备绑定流程（选通道 → 点画布落点）</div>
        </template>
        <div v-else class="floormap-wizard__done">
          <svg viewBox="0 0 24 24" width="44" height="44">
            <circle cx="12" cy="12" r="10.5" fill="rgba(34,197,94,0.16)" stroke="#22C55E" stroke-width="2"/>
            <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#22C55E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>已创建「{{ wizForm.name }}」</p>
          <!-- [v4-D14] 下一步建议卡片 (替代生硬自动关闭) -->
          <div class="floormap-wizard__next">
            <div class="floormap-wizard__next-card">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" :fill="deviceIconMeta('camera').color"/><path :d="deviceIconMeta('camera').path" fill="#fff"/></svg>
              <div><b>绑定摄像头</b><span>选通道后点画布落点</span></div>
            </div>
            <div class="floormap-wizard__next-card">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" :fill="deviceIconMeta('sos').color"/><path :d="deviceIconMeta('sos').path" fill="#fff"/></svg>
              <div><b>设为主图</b><span>告警弹窗默认渲染</span></div>
            </div>
            <div class="floormap-wizard__next-card">
              <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" :fill="deviceIconMeta('access').color"/><path :d="deviceIconMeta('access').path" fill="#fff"/></svg>
              <div><b>复制点位</b><span>从其他图复用配置</span></div>
            </div>
          </div>
          <el-button type="primary" @click="wizardVisible = false">开始绑定设备</el-button>
        </div>
      </div>

      <template #footer>
        <el-button @click="wizardVisible = false">取消</el-button>
        <el-button v-if="wizStep > 0 && !wizCreated" @click="wizStep--">上一步</el-button>
        <el-button
          v-if="wizStep < 2"
          type="primary"
          :disabled="!wizNextable"
          @click="wizStep++"
        >下一步</el-button>
        <el-button
          v-else-if="!wizCreated"
          type="primary"
          :loading="creating"
          @click="submitCreate"
        >创建并绑定设备</el-button>
        <!-- 成功态: footer 只留操作 (主 CTA 在 done 区) -->
      </template>
    </el-dialog>

    <!-- [v4-E18] 快捷键提示条 (底部居中, 可关闭 localStorage 记忆; 复用 fm-drop 过渡) -->
    <transition name="fm-drop">
      <div v-if="kbdHintVisible" class="floormap-view__kbd-hint">
        <span><kbd>/</kbd>搜索</span>
        <span><kbd>N</kbd>新建</span>
        <span><kbd>↑↓</kbd>切换卡片</span>
        <span><kbd>Enter</kbd>选中</span>
        <span><kbd>Del</kbd>解绑勾选</span>
        <span><kbd>Ctrl+S</kbd>保存元数据</span>
        <el-button link size="small" class="floormap-view__kbd-close" @click="dismissKbdHint">关闭</el-button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
/**
 * [FLOOR-MAP 2026-09-03] 平面图管理页 (/maps)
 *
 * 三层联动·管理层: 平面图 CRUD + 底图上传 (SVG/PNG/JPG) + 摄像头点位/FOV 绑定。
 * 左侧卡片列表 (场景筛选) + 右侧编辑器 (元数据表单 + FloorMapCanvas 编辑模式 +
 * 绑定面板)。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { http } from '@/api/http'
import { floorMapApi } from '@/api/floorMap'
import { channelApi } from '@/api/channel'
import { useFloorMap } from '@/composables/useFloorMap'
import FloorMapCanvas from '@/components/map/FloorMapCanvas.vue'
import {
  FLOOR_MAP_DEVICE_TYPES,
  FLOOR_MAP_SCENES,
  deviceIconMeta,
  deviceTypeLabel,
  sceneTagLabel,
  type CameraMapBinding,
  type FloorMapDeviceType,
  type FloorMapWithCameras,
} from '@/types/floorMap'
import type { ChannelItem } from '@/types/device'
import { Search } from '@element-plus/icons-vue'

const { maps, loadMaps, invalidateMaps } = useFloorMap()

// [FLOOR-LINK 2026-09-06] ⑤ 外部跳转定位: ?map_id=<id>&ch=<channel_id>
//   (设备列表「平面图」按钮 → by-channel 反查后携参跳入; 金色光环定位)
const route = useRoute()
const focusChannelId = ref('')

const sceneFilter = ref('')
const selectedId = ref(0)
const uploading = ref(false)
const savingMeta = ref(false)
const pendingChannel = ref('')
/** [P0-1] 待落点设备类型 (camera=选通道; 其他=输设备编号) */
const pendingType = ref<FloorMapDeviceType>('camera')
/** [P0-2] 栅格吸附开关 (默认开) */
const snapEnabled = ref(true)
watch(pendingType, (t) => {
  pendingChannel.value = ''
  // [v4-C9] 最近使用置顶记忆 (localStorage; 两条选择路径统一在此 bump)
  kitRecent.value = [t, ...kitRecent.value.filter((x) => x !== t)].slice(0, 3)
  try { localStorage.setItem(KIT_RECENT_KEY, JSON.stringify(kitRecent.value)) } catch { /* 隐私模式忽略 */ }
})
const pendingDesc = computed(() =>
  pendingType.value === 'camera'
    ? (channelLabels.value[pendingChannel.value] || pendingChannel.value)
    : `${deviceTypeLabel(pendingType.value)} ${pendingChannel.value}`
)

// ── [v4-C9] 添加工具箱: 搜索筛选 + 数量徽标 + 最近使用置顶 (宇视工具箱对标) ──
const KIT_RECENT_KEY = 'fm.kit.recent.v1'
const kitKeyword = ref('')
/** localStorage 读取 (容错: 非数组/隐私模式回退 []) */
function loadKitRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KIT_RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
const kitRecent = ref<string[]>(loadKitRecent())
/** 展示顺序 = 最近使用置顶 + 其余按 FLOOR_MAP_DEVICE_TYPES 原序; 关键字实时过滤 */
const kitTypes = computed(() => {
  const kw = kitKeyword.value.trim().toLowerCase()
  const list = FLOOR_MAP_DEVICE_TYPES.filter((t) => !kw || t.label.toLowerCase().includes(kw) || t.value.includes(kw))
  const rank = new Map(kitRecent.value.map((v, i) => [v, i]))
  return [...list].sort((a, b) => (rank.get(a.value) ?? 99) - (rank.get(b.value) ?? 99))
})

// ── [v4-C10] 落点交互: 连续落点模式 + 成功浮层 (Popconfirm 风格三选) ──
const continuousMode = ref(false)
// ── [v4-G] 工具箱按需展开: 默认收起, 点击唤出; 单次落点自动收起, 连续模式保持; ESC/外点/× 收起 ──
const kitOpen = ref(false)
function openKit() {
  kitOpen.value = true
}
/** 收起并同步清待放态 (幽灵图标依赖 pendingChannel, 不清会在画布残留) */
function closeKit() {
  kitOpen.value = false
  pendingChannel.value = ''
}
/** 点击坐标是否落在元素矩形内 (±pad 容差) */
function pointInRect(el: Element | null, x: number, y: number, pad = 4): boolean {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
}
/** 点击工具箱外部: 普通区域收起+清待放; 右侧面板区域仅收起 (面板路径接管待放态, pending-tip 继续引导)
 *  [鲁棒性] 真实输入管道下 click 派发途中 target 链可能因 v-for 重排脱离 DOM (closest 失效),
 *  故辅以几何矩形判定; teleported 弹层 (下拉/浮层) 属工具箱自身交互, 不视为外部点击 */
function onKitDocClick(ev: MouseEvent) {
  if (!kitOpen.value) return
  const t = ev.target as HTMLElement | null
  if (t?.closest('.el-popper, .el-select-dropdown, .el-overlay, .el-message, .el-notification, .el-message-box')) return
  if (t?.closest('.floormap-view__add-kit') || pointInRect(document.querySelector('.floormap-view__add-kit'), ev.clientX, ev.clientY)) return
  // 画布落点点击豁免: 有待放态时点画布是落点操作而非外部点击 (单次由 onCanvasClick 收起, 连续模式保持)
  if (t?.closest('.floormap-view__canvas-wrap') && pendingChannel.value) return
  if (t?.closest('.floormap-view__panel') || pointInRect(document.querySelector('.floormap-view__panel'), ev.clientX, ev.clientY)) {
    kitOpen.value = false
    return
  }
  closeKit()
}
/** 编号尾数递增: SOS-001→SOS-002 / 无数字→-2 (连续落点体验) */
function bumpDeviceId(id: string): string {
  const m = id.match(/^(.*?)(\d+)$/)
  if (!m) return `${id}-2`
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0')
}
const dropOk = ref<{ ch: string; type: FloorMapDeviceType } | null>(null)
let dropOkTimer = 0 as unknown as ReturnType<typeof setTimeout>
function showDropOk(ch: string, type: FloorMapDeviceType) {
  dropOk.value = { ch, type }
  clearTimeout(dropOkTimer)
  dropOkTimer = setTimeout(() => { dropOk.value = null }, 6000)
}
function continueDrop() {
  continuousMode.value = true
  kitOpen.value = true // [v4-G] 重新唤起工具箱
  // 恢复待放态: camera 还原通道 (用户可换选), 其他类型编号自动递增 — 点「继续添加」即刻可落点
  if (dropOk.value) {
    pendingType.value = dropOk.value.type
    pendingChannel.value = dropOk.value.type === 'camera' ? dropOk.value.ch : bumpDeviceId(dropOk.value.ch)
  }
  dropOk.value = null
}
/** 查看详情: 滚动到右侧绑定面板对应行并闪烁高亮 */
function viewDropped() {
  const ch = dropOk.value?.ch
  dropOk.value = null
  if (!ch) return
  const el = document.querySelector(`.floormap-view__binding[data-ch="${CSS.escape(ch)}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el?.classList.add('is-flash')
  setTimeout(() => el?.classList.remove('is-flash'), 1600)
}

// ── [FLOOR-MAP 2026-09-05 v3] 图库侧栏: 搜索/分组/折叠/时间 ──
/** 关键字搜索 (名称/建筑/楼层, 大小写不敏感) */
const keyword = ref('')
/** [v4-A2] 组内排序: floor(默认) / time(最近编辑优先) / name / devs */
const sortMode = ref<'floor' | 'time' | 'name' | 'devs'>('floor')
/** [v4-A2] 快捷过滤: 仅主图 / 仅空图(无绑定) / 仅含告警 */
const quickFilter = ref<'' | 'primary' | 'empty' | 'alarm'>('')
const QUICK_FILTERS = [
  { value: 'primary', label: '仅主图' },
  { value: 'empty', label: '仅空图' },
  { value: 'alarm', label: '仅含告警' },
] as const
/** [v4-A2] 批量模式 + 勾选集合 */
const batchMode = ref(false)
const checkedIds = ref(new Set<number>())
function toggleBatch() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) checkedIds.value = new Set()
}
function toggleCheck(id: number) {
  const s = new Set(checkedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  checkedIds.value = s
}
/** 侧栏折叠 (≤1400px 初始自动收起为图标条; 手动可切换) */
const sideCollapsed = ref(false)
/** 已折叠的建筑分组 key 集合 */
const collapsedGroups = ref(new Set<string>())
function toggleGroup(k: string) {
  const s = new Set(collapsedGroups.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  collapsedGroups.value = s
}

const filteredMaps = computed(() => {
  let arr = maps.value
  if (sceneFilter.value) arr = arr.filter((m) => m.scene_tag === sceneFilter.value)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    arr = arr.filter((m) =>
      [m.name, m.building, m.floor].join(' ').toLowerCase().includes(kw))
  }
  // [v4-A2] 快捷过滤 (主图标记 / 空图 / 近 24h 含告警通道)
  if (quickFilter.value === 'primary') arr = arr.filter((m) => m.cameras.some((b) => b.is_primary))
  else if (quickFilter.value === 'empty') arr = arr.filter((m) => !m.cameras.length)
  else if (quickFilter.value === 'alarm') arr = arr.filter((m) => m.cameras.some((b) => alarmChannels.value[b.channel_id]))
  return arr
})

/** 建筑/楼层折叠分组: 按 building 分组 (空→未指定建筑), 组内按楼层自然排序 (研华层级分组对标)
 *  [v4-A2] 组内排序可切: time=最近编辑优先 / name / devs=绑定设备数 */
const groupedMaps = computed(() => {
  const by = new Map<string, FloorMapWithCameras[]>()
  for (const m of filteredMaps.value) {
    const k = m.building?.trim() || '__none__'
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(m)
  }
  const groups: { key: string; label: string; maps: FloorMapWithCameras[] }[] = []
  for (const [k, list] of by) {
    if (sortMode.value === 'time') list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
    else if (sortMode.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    else if (sortMode.value === 'devs') list.sort((a, b) => b.cameras.length - a.cameras.length)
    else list.sort((a, b) => (a.floor || '').localeCompare(b.floor || '', 'zh', { numeric: true }))
    groups.push({ key: k, label: k === '__none__' ? '未指定建筑' : k, maps: list })
  }
  return groups
})

/** 卡片设备统计: 按类型分色圆点 (色值 SSOT = DEVICE_ICON_META) */
function mapTypeDots(m: FloorMapWithCameras): { t: string; color: string }[] {
  const seen = new Set<string>()
  for (const b of m.cameras) seen.add(b.device_type || 'camera')
  return [...seen].map((t) => ({ t, color: deviceIconMeta(t).color }))
}

// ── [v4-A1] 卡片信息密度: 场景着色 / 比例尺双格式 / 主图标记 ──
/** 场景 tag 着色 (与 DEVICE_ICON_META 同族色值, 避免统一 info 灰) */
const SCENE_TAG_COLORS: Record<string, string> = {
  school_campus: '#3294ED',
  hotel_unattended: '#22C55E',
  gas_station: '#F59E0B',
  factory_industrial: '#F93A55',
  park_estate: '#06B6D4',
  video_perimeter: '#A78BFA',
}
function sceneTagColor(tag: string): string {
  return SCENE_TAG_COLORS[tag] || '#3A5A8C'
}
/** 比例尺双格式: 1px=X cm / 1m=Y px (小值用 cm 表达更直观) */
function fmtScale(mPerPx: number): string {
  if (!mPerPx || mPerPx <= 0) return ''
  return mPerPx < 0.1
    ? `1px=${(mPerPx * 100).toFixed(1)}cm`
    : `1m=${Math.round(1 / mPerPx)}px`
}
/** 主图绑定数 (缩略图左下角「主」标) */
function primaryCount(m: FloorMapWithCameras): number {
  return m.cameras.filter((b) => b.is_primary).length
}

// ── [v4-A1/A2] 卡片 hover 快捷操作 + 批量管控 ──
const copyingId = ref(0)
/** 复制整图: 同元数据 + 底图 fetch 转存 + 点位逐条 upsert */
async function copyMap(m: FloorMapWithCameras) {
  copyingId.value = m.id
  try {
    const created = await floorMapApi.createMap({
      name: `${m.name} 副本`,
      building: m.building,
      floor: m.floor,
      scene_tag: m.scene_tag,
      scale_m_per_px: m.scale_m_per_px,
    })
    if (m.image_path) {
      try {
        const url = floorMapApi.getImageUrl(m)
        const res = await fetch(url)
        const blob = await res.blob()
        await floorMapApi.uploadImage(created.id, new File([blob], `copy.${m.image_type || 'png'}`, { type: blob.type }))
      } catch (e) {
        console.warn('[FloorMapView] copyMap image failed:', e)
        ElMessage.warning('底图复制失败, 可在工具栏重新上传')
      }
    }
    let ok = 0
    for (const b of m.cameras) {
      try {
        await floorMapApi.upsertBinding(created.id, {
          channel_id: b.channel_id,
          device_type: b.device_type,
          label: b.label,
          pos_x: b.pos_x,
          pos_y: b.pos_y,
          fov_yaw: b.fov_yaw,
          fov_radius_m: b.fov_radius_m,
          is_primary: b.is_primary,
        })
        ok++
      } catch { /* 单条失败不阻断 */ }
    }
    await loadMaps(true)
    selectedId.value = created.id
    ElMessage.success(`已复制「${m.name}」(含 ${ok}/${m.cameras.length} 个点位)`,
    )
  } catch (e) {
    console.warn('[FloorMapView] copyMap failed:', e)
    ElMessage.error('复制失败')
  } finally {
    copyingId.value = 0
  }
}

/** 卡片 hover 删除 (与工具栏 removeMap 同链路, 支持删非选中图) */
async function confirmDeleteMap(m: FloorMapWithCameras) {
  try {
    await ElMessageBox.confirm(
      `删除「${m.name}」及其 ${m.cameras.length} 个设备绑定? 图片文件一并删除。`,
      '删除平面图',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await floorMapApi.deleteMap(m.id)
    if (selectedId.value === m.id) selectedId.value = 0
    invalidateMaps()
    await loadMaps(true)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

const batchScene = ref('')
async function batchDelete() {
  const ids = [...checkedIds.value]
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(
      `批量删除 ${ids.length} 张平面图及其全部绑定? 不可恢复。`,
      '批量删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }
  let ok = 0
  for (const id of ids) {
    try { await floorMapApi.deleteMap(id); ok++ } catch { /* 逐张报告 */ }
  }
  if (selectedId.value && ids.includes(selectedId.value)) selectedId.value = 0
  checkedIds.value = new Set()
  invalidateMaps()
  await loadMaps(true)
  ElMessage.success(`已删除 ${ok}/${ids.length} 张`)
}
async function batchSetScene(v: string) {
  const ids = [...checkedIds.value]
  batchScene.value = ''
  if (!v || !ids.length) return
  let ok = 0
  for (const id of ids) {
    const m = maps.value.find((x) => x.id === id)
    if (!m) continue
    try {
      await floorMapApi.updateMap(id, {
        name: m.name, building: m.building, floor: m.floor,
        scene_tag: v, scale_m_per_px: m.scale_m_per_px,
      })
      ok++
    } catch { /* 逐张报告 */ }
  }
  await loadMaps(true)
  ElMessage.success(`已将 ${ok} 张场景改为「${sceneTagLabel(v)}」`)
}

/** 通用 JSON 下载 ([v4-B7] 导出复用) */
function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
/** 批量导出: 选中图的元数据 + 全部点位 (schema 与单图导出一致) */
function batchExport() {
  const ids = [...checkedIds.value]
  if (!ids.length) return
  const payload = {
    schema: 'shieldbox/floormaps@1',
    exported_at: new Date().toISOString(),
    maps: ids
      .map((id) => maps.value.find((m) => m.id === id))
      .filter((m): m is FloorMapWithCameras => !!m)
      .map((m) => ({
        map: {
          name: m.name, building: m.building, floor: m.floor,
          scene_tag: m.scene_tag, scale_m_per_px: m.scale_m_per_px,
        },
        bindings: m.cameras.map((b) => ({
          channel_id: b.channel_id, device_type: b.device_type, label: b.label,
          pos_x: b.pos_x, pos_y: b.pos_y, fov_yaw: b.fov_yaw,
          fov_radius_m: b.fov_radius_m, is_primary: b.is_primary,
        })),
      })),
  }
  downloadJSON(`floormaps_batch_${Date.now()}.json`, payload)
  ElMessage.success(`已导出 ${payload.maps.length} 张图点位`)
}

// ── [v4-A3] 空库示例模板 (零后端: 内置 SVG 底图 + 3 示例设备落点) ──
const loadingTemplate = ref(false)
const TEMPLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720"><rect width="960" height="720" fill="#0F2244"/><g stroke="#2A4A7C" stroke-width="2" fill="#13294B"><rect x="40" y="40" width="880" height="640" rx="8"/></g><g stroke="#22406E" stroke-width="1.5" fill="#0F2244"><rect x="70" y="70" width="380" height="280"/><rect x="490" y="70" width="400" height="180"/><rect x="490" y="290" width="400" height="360"/><rect x="70" y="390" width="380" height="260"/></g><text x="260" y="215" fill="#5E7BA6" font-size="26" text-anchor="middle" font-family="sans-serif">大厅</text><text x="690" y="165" fill="#5E7BA6" font-size="26" text-anchor="middle" font-family="sans-serif">机房</text><text x="690" y="475" fill="#5E7BA6" font-size="26" text-anchor="middle" font-family="sans-serif">办公区</text><text x="260" y="525" fill="#5E7BA6" font-size="26" text-anchor="middle" font-family="sans-serif">会议室</text></svg>`
async function loadTemplate() {
  loadingTemplate.value = true
  try {
    const created = await floorMapApi.createMap({
      name: '示例平面图', building: '示例建筑', floor: 'F1',
      scene_tag: 'school_campus', scale_m_per_px: 0.05,
    })
    try {
      const blob = new Blob([TEMPLATE_SVG], { type: 'image/svg+xml' })
      await floorMapApi.uploadImage(created.id, new File([blob], 'template.svg', { type: 'image/svg+xml' }))
    } catch (e) {
      console.warn('[FloorMapView] template uploadImage failed:', e)
      ElMessage.warning('模板底图上传失败')
    }
    const demos: { id: string; t: FloorMapDeviceType; x: number; y: number; label: string }[] = [
      { id: 'DEMO-ACCESS-001', t: 'access', x: 0.27, y: 0.31, label: '大厅门禁' },
      { id: 'DEMO-SMOKE-001', t: 'smoke', x: 0.72, y: 0.23, label: '机房烟感' },
      { id: 'DEMO-SOS-001', t: 'sos', x: 0.27, y: 0.73, label: '走廊紧急按钮' },
    ]
    for (const d of demos) {
      try {
        await floorMapApi.upsertBinding(created.id, {
          channel_id: d.id, device_type: d.t, label: d.label, pos_x: d.x, pos_y: d.y,
        })
      } catch { /* 示例点位失败不阻断 */ }
    }
    await loadMaps(true)
    selectedId.value = created.id
    ElMessage.success('已创建示例平面图 (含 3 个示例设备)')
  } catch (e) {
    console.warn('[FloorMapView] loadTemplate failed:', e)
    ElMessage.error('模板创建失败')
  } finally {
    loadingTemplate.value = false
  }
}

/** 更新时间格式化: 秒级时间戳 → 相对时间/MM-DD HH:mm (后端 unixepoch 秒; 毫秒防御) */
function fmtTime(ts: number): string {
  if (!ts) return '-'
  const ms = ts > 1e12 ? ts : ts * 1000
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 文件大小格式化 (向导展示) */
function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
const selectedMap = computed(() => maps.value.find((m) => m.id === selectedId.value) || null)

// ── 通道下拉 + 在线态/名称映射 (ChannelItem.status → 在线点) ──
const channels = ref<ChannelItem[]>([])
// [FIX 2026-09-04] channels API 实测字段 channel_id/status:"online",
//   与 ChannelItem 类型声明 (id/status:"active") 不符 → 键取值双兼容,
//   否则名称/在线态映射键全为 undefined (色环恒灰真机验证发现)
function chKey(ch: ChannelItem): string {
  return String((ch as any).channel_id || ch.id || '')
}
const channelOptions = computed(() =>
  channels.value.filter((ch) => !selectedMap.value?.cameras.some((b) => b.channel_id === chKey(ch)))
)
const channelLabels = computed<Record<string, string>>(() => {
  const o: Record<string, string> = {}
  for (const ch of channels.value) o[chKey(ch)] = ch.name || chKey(ch)
  return o
})
const channelOnline = computed<Record<string, boolean>>(() => {
  const o: Record<string, boolean> = {}
  for (const ch of channels.value) {
    // status 值域双兼容: "active" (类型声明) / "online" (API 实测)
    // [FIX tsc 2026-09-07] 声明类型无 'online', as string 放宽比较 (TS2367)
    o[chKey(ch)] = ch.status === 'active' || (ch.status as string) === 'online'
  }
  return o
})
function shortCh(ch: string): string {
  return ch.length > 18 ? `${ch.slice(0, 10)}…${ch.slice(-4)}` : ch
}
// [P0-1] 绑定项显示名: 非摄像头用 label, 摄像头走通道名
function bindingName(b: CameraMapBinding): string {
  if (b.device_type && b.device_type !== 'camera') return b.label || b.channel_id
  return channelLabels.value[b.channel_id] || shortCh(b.channel_id)
}

// ── [P0-3] 告警状态注入 (30s 轮询近 24h 告警 → 色环红闪; 海康告警源定位对标) ──
/** [v4-B8] 告警统计: 次数 + 最近一次 (绑定行紧凑徽标用); alarmChannels 由此派生保持 Canvas prop 契约 */
const alarmStats = ref<Record<string, { count: number; latest: number }>>({})
const alarmChannels = computed<Record<string, boolean>>(() => {
  const o: Record<string, boolean> = {}
  for (const k of Object.keys(alarmStats.value)) o[k] = true
  return o
})
let alarmTimer: number | undefined
async function loadAlarmChannels() {
  try {
    const res = await http.get('/alarms', { params: { page: 1, page_size: 200 } })
    const d = (res.data as any)?.data ?? res.data
    const items = Array.isArray(d?.items) ? d.items : []
    const o: Record<string, { count: number; latest: number }> = {}
    const dayAgo = Date.now() - 24 * 3600 * 1000
    for (const a of items) {
      const ch = String(a.channel_id_str || a.channel_id || '')
      const ts = Number(a.timestamp) || 0
      if (ch && ts >= dayAgo) {
        const s = o[ch] || (o[ch] = { count: 0, latest: 0 })
        s.count++
        if (ts > s.latest) s.latest = ts
      }
    }
    alarmStats.value = o
  } catch (e) {
    console.warn('[FloorMapView] load alarm channels failed:', e)
  }
}

// GPS 建议落点提示: 待落点通道带 GPS 时提示 (简化 — 不自动落点)
const gpsHint = computed(() => {
  if (!pendingChannel.value) return ''
  const ch = channels.value.find((c) => c.id === pendingChannel.value)
  const meta = (ch?.metadata || {}) as Record<string, unknown>
  const lat = meta.gps_lat ?? meta.latitude
  const lng = meta.gps_lng ?? meta.longitude
  return lat && lng ? `该通道带 GPS (${lat}, ${lng}), 可参考实际安装位置落点` : ''
})

// ── 元数据表单 ──
const form = reactive({ name: '', building: '', floor: '', scene_tag: '', scale_m_per_px: 0.05 })
watch(selectedMap, (m) => {
  if (m) {
    form.name = m.name
    form.building = m.building
    form.floor = m.floor
    form.scene_tag = m.scene_tag
    form.scale_m_per_px = m.scale_m_per_px
  }
})

function selectMap(id: number) {
  selectedId.value = id
  pendingChannel.value = ''
}

// ── [FLOOR-MAP 2026-09-05 v3] 新建向导: 三步 (底图暂存 → 元数据 → createMap+uploadImage 串行) ──
const wizardVisible = ref(false)
const wizStep = ref(0)
const wizFile = ref<File | null>(null)
const wizFileUrl = ref('')
const wizForm = reactive({ name: '', building: '', floor: '', scene_tag: '', scale_m_per_px: 0.05 })
const creating = ref(false)
const wizCreated = ref(false)
/** 下一步可用: step0 需已选底图, step1 需非空名称 */
const wizNextable = computed(() =>
  wizStep.value === 0 ? !!wizFile.value : wizForm.name.trim().length > 0)

// ── [v4-D11] 上传增强: 分辨率实时预览 + PDF 第一帧提取 + 文件名启发式回填 ──
const wizImgDims = ref<{ w: number; h: number } | null>(null)
const wizPdfBusy = ref(false)
/** 图片尺寸探测 (dataURL → Image → naturalWidth/Height) */
function probeDims(url: string) {
  const img = new Image()
  img.onload = () => {
    if (img.naturalWidth) wizImgDims.value = { w: img.naturalWidth, h: img.naturalHeight }
  }
  img.src = url
}
/** PDF 第一帧 → PNG File
 *  pdfjs-dist 动态 import 按需分包; worker 用 vite ?worker 打包 (产出 .js — 设备 nginx
 *  对 .mjs MIME 是 octet-stream 会被模块 worker 安全策略拒绝), workerPort 单例复用 */
let pdfWorkerPort: Worker | null = null
async function pdfFirstPage(raw: File): Promise<File> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfWorkerPort) {
    const PdfWorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default
    pdfWorkerPort = new PdfWorkerCtor()
    pdfjs.GlobalWorkerOptions.workerPort = pdfWorkerPort
  }
  const pdf = await pdfjs.getDocument({ data: await raw.arrayBuffer() }).promise
  const page = await pdf.getPage(1)
  const vp0 = page.getViewport({ scale: 1 })
  const scale = Math.min(2, 1600 / vp0.width)
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp } as never).promise
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
  return new File([blob], raw.name.replace(/\.pdf$/i, '') + '.png', { type: 'image/png' })
}
/** 文件名启发式 → 名称建议 (B1F_平面图.png → "B1F 平面图") */
function nameFromFile(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').trim().slice(0, 40)
}

function openCreate() {
  wizStep.value = 0
  wizFile.value = null
  wizFileUrl.value = ''
  wizImgDims.value = null
  wizScalePts.value = []
  wizScaleCalc.value = false
  Object.assign(wizForm, { name: '', building: '', floor: '', scene_tag: '', scale_m_per_px: 0.05 })
  wizCreated.value = false
  wizardVisible.value = true
}

function onWizardClosed() {
  // 成功态自动关闭后不重置 (保留 wizCreated 供外部判断); 手动取消时静默
}

/** 底图选择校验: 类型 SVG/PNG/JPG/PDF + ≤15MB (本地暂存, 不立即上传) */
async function onWizardFile(f: { raw?: File }) {
  const raw = f.raw
  if (!raw) return
  const isPdf = /\.pdf$/i.test(raw.name) || raw.type === 'application/pdf'
  if (!isPdf && !/\.(svg|png|jpe?g)$/i.test(raw.name)) {
    ElMessage.error('仅支持 SVG / PNG / JPG / PDF 底图')
    return
  }
  if (raw.size > 15 * 1024 * 1024) {
    ElMessage.error('底图不超过 15MB')
    return
  }
  let file = raw
  if (isPdf) {
    wizPdfBusy.value = true
    try {
      file = await pdfFirstPage(raw)
    } catch (e) {
      console.warn('[FloorMapView] pdf first page failed:', e)
      notifyError('PDF 解析失败', '无法提取第一页, 请先转换为 PNG 后重试')
      return
    } finally {
      wizPdfBusy.value = false
    }
  }
  wizFile.value = file
  const fr = new FileReader()
  fr.onload = () => {
    wizFileUrl.value = String(fr.result)
    probeDims(wizFileUrl.value)
  }
  fr.readAsDataURL(file)
  // [v4-D11] 名称空时启发式回填 (文件名即图纸名的常见习惯)
  if (!wizForm.name.trim()) wizForm.name = nameFromFile(raw.name)
}

function clearWizardFile() {
  wizFile.value = null
  wizFileUrl.value = ''
  wizImgDims.value = null
  wizScalePts.value = []
}

// ── [v4-D12] 元数据智能: 名称模板建议 / 楼层快捷芯片 / 两点测算比例尺 ──
const FLOOR_CHIPS = ['F1', 'F2', 'F3', 'B1', 'B2', '总平']
/** 建筑下拉选项: 已有图聚合 (allow-create 可输入新建筑 inline 创建) */
const buildingOptions = computed(() => {
  const set = new Set<string>()
  for (const m of maps.value) {
    const b = (m.building || '').trim()
    if (b) set.add(b)
  }
  return [...set]
})
function suggestName() {
  const parts = [wizForm.building.trim(), wizForm.floor.trim(), wizForm.scene_tag ? sceneTagLabel(wizForm.scene_tag) : '']
  wizForm.name = parts.filter(Boolean).join('-') || nameFromFile(wizFile.value?.name || '') || '新建平面图'
}
/** 两点测算: 底图点两个端点 (自然像素坐标) + 实际距离 → m/px */
const wizScaleCalc = ref(false)
const wizScalePts = ref<{ x: number; y: number }[]>([])
const wizScaleReal = ref(10)
function onScaleImgClick(ev: MouseEvent) {
  const img = (ev.currentTarget as HTMLElement).querySelector('img')
  if (!img || !img.naturalWidth) return
  const r = img.getBoundingClientRect()
  if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return
  // 存百分比 (相对显示区) + 换算自然像素距离
  const pct = { x: ((ev.clientX - r.left) / r.width) * 100, y: ((ev.clientY - r.top) / r.height) * 100 }
  wizScalePts.value = [...wizScalePts.value, pct].slice(-2)
}
const wizScalePx = computed(() => {
  const [a, b] = wizScalePts.value
  if (!a || !b) return 0
  // 百分比 → 自然像素 (x 按 naturalWidth, y 按 naturalHeight)
  const w = wizImgDims.value?.w || 0
  const h = wizImgDims.value?.h || 0
  if (!w || !h) return 0
  return Math.hypot(((b.x - a.x) / 100) * w, ((b.y - a.y) / 100) * h)
})
function applyScaleCalc() {
  if (!wizScalePx.value || wizScaleReal.value <= 0) {
    notifyWarn('无法测算比例尺', '请先在底图上点两个端点, 并输入大于 0 的实际距离')
    return
  }
  const s = wizScaleReal.value / wizScalePx.value
  wizForm.scale_m_per_px = Number(s.toFixed(4))
  ElMessage.success(`已反算: 1px = ${s.toFixed(4)}m (1m ≈ ${Math.round(1 / s)}px)`)
}

// ── [v4-E19] 关键错误统一 el-notification 兜底 (需求 19: 上传失败/比例尺异常/落点失败; 替代散落的 ElMessage.error) ──
function notifyError(title: string, detail = '') {
  ElNotification({ title, message: detail, type: 'error', duration: 5000, position: 'bottom-right' })
}
function notifyWarn(title: string, detail = '') {
  ElNotification({ title, message: detail, type: 'warning', duration: 5000, position: 'bottom-right' })
}

// ── [v4-D14] 新手引导横幅: 创建后出现, 可关闭不再显示 ──
const GUIDE_KEY = 'fm.guide.dismissed.v1'
const guideVisible = ref(false)
function showGuideBanner() {
  try { if (localStorage.getItem(GUIDE_KEY)) return } catch { /* 忽略 */ }
  guideVisible.value = true
}
function dismissGuide() {
  guideVisible.value = false
  try { localStorage.setItem(GUIDE_KEY, '1') } catch { /* 忽略 */ }
}

/** 创建: createMap → uploadImage 串行 (REST 契约不变; 底图失败不阻断创建, 可工具栏补传) */
async function submitCreate() {
  if (!wizFile.value || !wizForm.name.trim()) return
  creating.value = true
  try {
    const created = await floorMapApi.createMap({
      name: wizForm.name.trim(),
      building: wizForm.building.trim(),
      floor: wizForm.floor.trim(),
      scene_tag: wizForm.scene_tag,
      scale_m_per_px: wizForm.scale_m_per_px,
    })
    try {
      await floorMapApi.uploadImage(created.id, wizFile.value)
    } catch (e) {
      console.warn('[FloorMapView] wizard uploadImage failed:', e)
      notifyWarn('底图上传失败', '平面图已创建, 可稍后在工具栏重新上传')
    }
    await loadMaps(true)
    selectedId.value = created.id
    // 自动进入绑定流程: 预设 camera 类型, 用户选通道后点画布落点
    pendingType.value = 'camera'
    pendingChannel.value = ''
    wizCreated.value = true
    ElMessage.success(`已创建「${created.name}」, 选择通道后点击画布绑定设备`)
    // [v4-D14] 不再 1600ms 自动关闭 — done 区内嵌下一步建议卡片, 用户主动进入绑定
    showGuideBanner()
  } catch (e) {
    console.warn('[FloorMapView] wizard create failed:', e)
    notifyError('创建失败', '请检查网络或服务状态后重试')
  } finally {
    creating.value = false
  }
}

async function saveMeta() {
  if (!selectedMap.value || !form.name.trim()) {
    ElMessage.warning('名称不能为空')
    return
  }
  savingMeta.value = true
  try {
    await floorMapApi.updateMap(selectedMap.value.id, {
      name: form.name.trim(),
      building: form.building,
      floor: form.floor,
      scene_tag: form.scene_tag,
      scale_m_per_px: form.scale_m_per_px,
    })
    // [v4-E] 保存成功先反馈 (loadMaps 隧道慢时不阻塞提示)
    ElMessage.success('已保存')
    await loadMaps(true)
  } catch (e) {
    console.warn('[FloorMapView] saveMeta failed:', e)
    notifyError('元数据保存失败', '请检查网络或服务状态后重试')
  } finally {
    savingMeta.value = false
  }
}

async function onUploadImage(opts: UploadRequestOptions) {
  if (!selectedMap.value) return
  uploading.value = true
  try {
    await floorMapApi.uploadImage(selectedMap.value.id, opts.file as File)
    await loadMaps(true)
    ElMessage.success('底图已上传')
  } catch (e) {
    console.warn('[FloorMapView] uploadImage failed:', e)
    notifyError('底图上传失败', '支持 SVG / PNG / JPG, 不超过 15MB')
  } finally {
    uploading.value = false
  }
}

async function removeMap() {
  if (!selectedMap.value) return
  try {
    await ElMessageBox.confirm(
      `删除「${selectedMap.value.name}」及其摄像头绑定? 图片文件一并删除。`,
      '删除平面图',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await floorMapApi.deleteMap(selectedMap.value.id)
    selectedId.value = 0
    invalidateMaps()
    await loadMaps(true)
    ElMessage.success('已删除')
  } catch { /* 取消 */ }
}

// ── 绑定交互: 点击落点 / 拖拽微调 / 参数编辑 ──
async function onCanvasClick(x: number, y: number) {
  if (!selectedMap.value || !pendingChannel.value) return
  const ch = pendingChannel.value
  const dt = pendingType.value
  try {
    await floorMapApi.upsertBinding(selectedMap.value.id, {
      channel_id: ch,
      device_type: dt,
      // 非摄像头默认显示名 = 设备编号 (可后续在列表改名)
      label: dt === 'camera' ? '' : ch,
      pos_x: x,
      pos_y: y,
    })
    // [v4-C10] 连续落点: 保留待放态 (camera 保留通道由用户换选; 其他类型编号自动递增)
    if (continuousMode.value) {
      if (dt !== 'camera') pendingChannel.value = bumpDeviceId(ch)
    } else {
      pendingChannel.value = ''
      // [v4-G] 单次落点完成 → 工具箱自动收起 (面板/工具箱双路径统一; 连续模式分支保持展开)
      if (kitOpen.value) kitOpen.value = false
    }
    await loadMaps(true)
    showDropOk(ch, dt)
  } catch (e) {
    console.warn('[FloorMapView] bind failed:', e)
    notifyError('落点失败', `设备 ${ch} 绑定未成功, 请重试`)
  }
}

async function onBindingMove(b: CameraMapBinding, x: number, y: number) {
  if (!selectedMap.value) return
  try {
    await floorMapApi.upsertBinding(b.map_id, {
      channel_id: b.channel_id,
      device_type: b.device_type,
      label: b.label,
      pos_x: x,
      pos_y: y,
      fov_yaw: b.fov_yaw,
      fov_radius_m: b.fov_radius_m,
      is_primary: b.is_primary,
    })
    await loadMaps(true)
  } catch (e) {
    console.warn('[FloorMapView] move failed:', e)
  }
}

async function updateBinding(b: CameraMapBinding, patch: Partial<CameraMapBinding>): Promise<boolean> {
  if (!selectedMap.value) return false
  try {
    await floorMapApi.upsertBinding(b.map_id, {
      channel_id: b.channel_id,
      device_type: patch.device_type ?? b.device_type,
      label: patch.label ?? b.label,
      pos_x: b.pos_x,
      pos_y: b.pos_y,
      fov_yaw: patch.fov_yaw ?? b.fov_yaw,
      fov_radius_m: patch.fov_radius_m ?? b.fov_radius_m,
      is_primary: patch.is_primary ?? b.is_primary,
    })
    await loadMaps(true)
    return true
  } catch (e) {
    console.warn('[FloorMapView] updateBinding failed:', e)
    ElMessage.error('更新失败')
    return false
  }
}

async function removeBinding(b: CameraMapBinding) {
  try {
    await floorMapApi.deleteBinding(b.map_id, b.channel_id)
    await loadMaps(true)
    ElMessage.success('已解绑')
  } catch (e) {
    console.warn('[FloorMapView] removeBinding failed:', e)
    ElMessage.error('解绑失败')
  }
}

// ── [v4-B5/B6] 绑定面板: 搜索 + 类型过滤 chips + 分组折叠 + 批量管控 ──
const bindKeyword = ref('')
const hiddenTypes = ref(new Set<string>())
const bindCollapsed = ref(new Set<string>())
const bindChecked = ref(new Set<number>())

function typeCount(t: string): number {
  return selectedMap.value?.cameras.filter((b) => b.device_type === t).length || 0
}
function toggleTypeChip(t: string) {
  const s = new Set(hiddenTypes.value)
  if (s.has(t)) s.delete(t)
  else s.add(t)
  hiddenTypes.value = s
}
function toggleBindGroup(t: string) {
  const s = new Set(bindCollapsed.value)
  if (s.has(t)) s.delete(t)
  else s.add(t)
  bindCollapsed.value = s
}
function toggleBindCheck(id: number) {
  const s = new Set(bindChecked.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  bindChecked.value = s
}
const filteredBindings = computed<CameraMapBinding[]>(() => {
  const arr = selectedMap.value?.cameras || []
  const kw = bindKeyword.value.trim().toLowerCase()
  return arr.filter((b) => {
    if (hiddenTypes.value.has(b.device_type)) return false
    if (kw && !`${b.channel_id} ${b.label} ${deviceTypeLabel(b.device_type)}`.toLowerCase().includes(kw)) return false
    return true
  })
})
/** [v4-B5] 按 device_type 分组 (FLOOR_MAP_DEVICE_TYPES 顺序, 与左侧建筑分组对齐) */
const groupedBindings = computed(() => {
  const by = new Map<string, CameraMapBinding[]>()
  for (const b of filteredBindings.value) {
    if (!by.has(b.device_type)) by.set(b.device_type, [])
    by.get(b.device_type)!.push(b)
  }
  return FLOOR_MAP_DEVICE_TYPES
    .filter((t) => by.has(t.value))
    .map((t) => ({ type: t.value, label: t.label, list: by.get(t.value)! }))
})
const allBindChecked = computed(() => {
  const list = filteredBindings.value
  return list.length > 0 && list.every((b) => bindChecked.value.has(b.id))
})
const someBindChecked = computed(() => filteredBindings.value.some((b) => bindChecked.value.has(b.id)))
function toggleCheckAll() {
  if (allBindChecked.value) bindChecked.value = new Set()
  else bindChecked.value = new Set(filteredBindings.value.map((b) => b.id))
}
async function batchUnbind() {
  const ids = [...bindChecked.value]
  if (!ids.length || !selectedMap.value) return
  try {
    await ElMessageBox.confirm(`批量解绑 ${ids.length} 个设备? 点位一并移除。`, '批量解绑',
      { confirmButtonText: '解绑', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  let ok = 0
  for (const id of ids) {
    const b = selectedMap.value.cameras.find((x) => x.id === id)
    if (!b) continue
    try { await floorMapApi.deleteBinding(b.map_id, b.channel_id); ok++ } catch { /* 逐条报告 */ }
  }
  bindChecked.value = new Set()
  await loadMaps(true)
  ElMessage.success(`已解绑 ${ok}/${ids.length}`)
}
async function batchSetPrimary() {
  const ids = [...bindChecked.value]
  if (!ids.length || !selectedMap.value) return
  let ok = 0
  for (const id of ids) {
    const b = selectedMap.value.cameras.find((x) => x.id === id)
    if (!b) continue
    if (await updateBinding(b, { is_primary: true })) ok++
  }
  bindChecked.value = new Set()
  ElMessage.success(`已设主图 ${ok}/${ids.length}`)
}

// ── [v4-B8] 绑定行状态: 告警徽标 / 离线 dim (色环规范沿用 v2) ──
function isBindingOffline(b: CameraMapBinding): boolean {
  // camera 是网络设备: 不在在线表 (含已移除通道) 即离线; 与 Canvas devStatus 的 !! 语义一致
  return b.device_type === 'camera' && channelOnline.value[b.channel_id] !== true
}
function bindingStatusTitle(b: CameraMapBinding): string {
  const a = alarmStats.value[b.channel_id]
  if (a) return `24h 告警 ${a.count} 次, 最近 ${fmtTime(a.latest)}`
  if (isBindingOffline(b)) return '离线'
  if (b.device_type !== 'camera') return '非网络设备'
  return '在线'
}

// ── [v4-B7] 点位导入/导出 + 跨图复制粘贴 (零后端: 前端解析循环 upsert, schema 与批量导出一致) ──
type ParsedBinding = {
  channel_id: string
  device_type: FloorMapDeviceType
  label: string
  pos_x: number
  pos_y: number
  fov_yaw: number
  fov_radius_m: number
  is_primary: boolean
}
function bindingToPayload(b: CameraMapBinding): ParsedBinding {
  return {
    channel_id: b.channel_id, device_type: b.device_type, label: b.label,
    pos_x: b.pos_x, pos_y: b.pos_y, fov_yaw: b.fov_yaw,
    fov_radius_m: b.fov_radius_m, is_primary: b.is_primary,
  }
}
const FM_CLIPBOARD_KEY = 'fm_bindings_clipboard'
const fmClipboardCount = ref(0)
try {
  fmClipboardCount.value = (JSON.parse(localStorage.getItem(FM_CLIPBOARD_KEY) || '[]') as unknown[]).length
} catch { fmClipboardCount.value = 0 }

function exportBindings() {
  if (!selectedMap.value) return
  const m = selectedMap.value
  downloadJSON(`floormap_${m.id}_bindings.json`, {
    schema: 'shieldbox/floormaps@1',
    exported_at: new Date().toISOString(),
    map: { name: m.name, building: m.building, floor: m.floor, scene_tag: m.scene_tag, scale_m_per_px: m.scale_m_per_px },
    bindings: m.cameras.map(bindingToPayload),
  })
  ElMessage.success(`已导出 ${m.cameras.length} 个点位`)
}
function copyBindings() {
  if (!selectedMap.value?.cameras.length) {
    ElMessage.warning('当前图无点位可复制')
    return
  }
  localStorage.setItem(FM_CLIPBOARD_KEY, JSON.stringify(selectedMap.value.cameras.map(bindingToPayload)))
  fmClipboardCount.value = selectedMap.value.cameras.length
  ElMessage.success(`已复制 ${fmClipboardCount.value} 个点位, 切换目标图后点「粘贴」`)
}
async function pasteBindings() {
  let arr: ParsedBinding[] = []
  try { arr = JSON.parse(localStorage.getItem(FM_CLIPBOARD_KEY) || '[]') } catch { /* 下面判空 */ }
  if (!Array.isArray(arr) || !arr.length) {
    ElMessage.warning('剪贴板无点位, 先在源图点「复制点位」')
    return
  }
  await doImportBindings(arr)
}
function onImportFile(f: { raw?: File }) {
  const raw = f.raw
  if (!raw) return
  const fr = new FileReader()
  fr.onload = () => {
    const parsed = parseBindingsText(String(fr.result), raw.name)
    if (!parsed.length) {
      ElMessage.error('未解析到有效点位 (JSON 需 bindings 数组 / CSV 需 channel_id 列)')
      return
    }
    doImportBindings(parsed)
  }
  fr.readAsText(raw)
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5))
}
function validDeviceType(t: unknown): FloorMapDeviceType {
  return (FLOOR_MAP_DEVICE_TYPES.some((d) => d.value === t) ? t : 'camera') as FloorMapDeviceType
}
/** JSON ({bindings:[...]} / 裸数组 / 批量导出 maps 格式) + CSV 双格式解析 */
function parseBindingsText(text: string, filename: string): ParsedBinding[] {
  const trim = text.trim()
  if (trim.startsWith('{') || trim.startsWith('[') || /\.json$/i.test(filename)) {
    let j: unknown
    try { j = JSON.parse(trim) } catch { return [] }
    const obj = j as Record<string, any>
    const arr: any[] = Array.isArray(j) ? j : obj?.bindings || obj?.maps?.[0]?.bindings || []
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && x.channel_id)
      .map((x) => ({
        channel_id: String(x.channel_id),
        device_type: validDeviceType(x.device_type),
        label: String(x.label || ''),
        pos_x: clamp01(Number(x.pos_x ?? 0.5)),
        pos_y: clamp01(Number(x.pos_y ?? 0.5)),
        fov_yaw: Number(x.fov_yaw) || 0,
        fov_radius_m: Number(x.fov_radius_m) || 0,
        is_primary: !!x.is_primary,
      }))
  }
  // CSV: 首行 header (channel_id,device_type,pos_x,pos_y,fov_yaw,fov_radius_m,label[,is_primary])
  const lines = trim.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((s) => s.trim().toLowerCase())
  const idx = (k: string) => header.indexOf(k)
  if (idx('channel_id') < 0) return []
  return lines.slice(1)
    .map((ln) => {
      const c = ln.split(',').map((s) => s.trim())
      return {
        channel_id: c[idx('channel_id')] || '',
        device_type: validDeviceType(c[idx('device_type')] || ''),
        label: c[idx('label')] || '',
        pos_x: clamp01(Number(c[idx('pos_x')] ?? 0.5)),
        pos_y: clamp01(Number(c[idx('pos_y')] ?? 0.5)),
        fov_yaw: Number(c[idx('fov_yaw')]) || 0,
        fov_radius_m: Number(c[idx('fov_radius_m')]) || 0,
        is_primary: /^(1|true|yes)$/i.test(c[idx('is_primary')] || ''),
      }
    })
    .filter((x) => x.channel_id)
}
async function doImportBindings(list: ParsedBinding[]) {
  if (!selectedMap.value) return
  let ok = 0
  for (const x of list) {
    try { await floorMapApi.upsertBinding(selectedMap.value.id, x); ok++ } catch { /* 逐条报告 */ }
  }
  await loadMaps(true)
  ElMessage.success(`已导入 ${ok}/${list.length} 个点位`)
}

// ── [v4-E18] 快捷键: / 聚焦搜索 · N 新建 · ↑↓ 切换卡片 · Enter 选中 · Del 解绑勾选 · Ctrl+S 保存元数据 ──
const KBD_HINT_KEY = 'fm.kbd.dismissed.v1'
const kbdHintVisible = ref(false)
const searchBoxRef = ref<{ focus: () => void } | null>(null)
const kbIdx = ref(-1)
/** 快捷键导航的可见卡片序列 (分组展平, 与左侧渲染顺序一致) */
const kbMaps = computed(() => groupedMaps.value.flatMap((g) => g.maps))
watch(() => kbMaps.value.length, () => { kbIdx.value = -1 })

function dismissKbdHint() {
  kbdHintVisible.value = false
  try { localStorage.setItem(KBD_HINT_KEY, '1') } catch { /* 隐私模式忽略 */ }
}

function onKeydown(ev: KeyboardEvent) {
  // Ctrl/Cmd+S 优先: 输入框内也生效, 阻止浏览器"保存网页"默认行为
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
    if (selectedMap.value) { ev.preventDefault(); void saveMeta() }
    return
  }
  // [v4-G] ESC 收起工具箱 (向导开着/告警弹窗在场时不抢, 弹窗 ESC 由 AlarmPopup 自己处理)
  if (ev.key === 'Escape') {
    if (kitOpen.value && !wizardVisible.value && !document.querySelector('.alarm-popup-overlay')) {
      ev.preventDefault()
      closeKit()
    }
    return
  }
  const tgt = ev.target as HTMLElement | null
  const inField = !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)
  if (inField || ev.ctrlKey || ev.metaKey || ev.altKey || wizardVisible.value) return
  if (ev.key === '/') {
    ev.preventDefault()
    searchBoxRef.value?.focus()
  } else if (ev.key === 'n' || ev.key === 'N') {
    ev.preventDefault()
    openCreate()
  } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    if (!kbMaps.value.length) return
    ev.preventDefault()
    const d = ev.key === 'ArrowDown' ? 1 : -1
    kbIdx.value = (kbIdx.value + d + kbMaps.value.length) % kbMaps.value.length
    document.querySelector(`.floormap-view__card[data-id="${kbMaps.value[kbIdx.value].id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  } else if (ev.key === 'Enter') {
    const m = kbMaps.value[kbIdx.value]
    if (m) { ev.preventDefault(); selectMap(m.id) }
  } else if (ev.key === 'Delete') {
    if (bindChecked.value.size) { ev.preventDefault(); void batchUnbind() }
  }
}

onMounted(async () => {
  // [v4-E18] 快捷键监听 + 提示条可见性 (localStorage 记忆关闭)
  window.addEventListener('keydown', onKeydown)
  // [v4-G] 工具箱外点收起
  document.addEventListener('click', onKitDocClick)
  try { kbdHintVisible.value = !localStorage.getItem(KBD_HINT_KEY) } catch { kbdHintVisible.value = true }
  // [FLOOR-MAP 2026-09-05 v3] ≤1400px (含 1366 主屏) 初始自动收起侧栏为图标条
  try {
    sideCollapsed.value = !!window.matchMedia?.('(max-width: 1400px)').matches
  } catch { /* matchMedia 不可用时保持展开 */ }
  await loadMaps(true)
  // [FLOOR-LINK 2026-09-06] ⑤ query 定位: 指定 map_id 直达对应图,
  //   否则保持首图; ch 参数驱动 FloorMapCanvas highlightChannelId 金色光环
  const qMapId = Number(route.query.map_id ?? 0)
  if (qMapId > 0 && maps.value.some((m) => m.id === qMapId)) {
    selectedId.value = qMapId
  } else if (maps.value.length) {
    selectedId.value = maps.value[0].id
  }
  const qCh = String(route.query.ch ?? '')
  if (qCh) {
    focusChannelId.value = qCh
    // 高亮 15s 后自动消退 (避免长期残留干扰编辑)
    window.setTimeout(() => {
      if (focusChannelId.value === qCh) focusChannelId.value = ''
    }, 15000)
  }
  try {
    const res = await channelApi.getList({ page: 1, pageSize: 500 })
    const d = (res.data as any)?.data ?? res.data
    // [FIX 2026-09-04] channels API 实测返回 data.channels[] (非 items);
    //   原取值链得到对象非数组 → 映射循环零次, 名称/在线点从未生效
    channels.value = d?.items ?? d?.channels ?? (Array.isArray(d) ? d : [])
  } catch (e) {
    console.warn('[FloorMapView] load channels failed:', e)
  }
  // [P0-3] 告警状态轮询 (30s)
  loadAlarmChannels()
  alarmTimer = window.setInterval(loadAlarmChannels, 30000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onKitDocClick)
  if (alarmTimer) clearInterval(alarmTimer)
})
</script>

<style scoped>
/* [FLOOR-MAP 2026-09-05 v3] 深色科技感底 (与 SituationScreen/AlarmPopup 同色系渐变) */
.floormap-view {
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
  background: linear-gradient(160deg, #0B1B36 0%, #071228 100%);
  border-radius: 8px;
}

/* ── [FLOOR-MAP 2026-09-05 v3] 左侧图库: 磨砂玻璃 + 卡片分组 + 折叠图标条 ── */
.floormap-view__side {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 12px;
  border: 1px solid rgba(58, 90, 140, 0.55);
  border-radius: 10px;
  background: rgba(16, 30, 55, 0.55);
  backdrop-filter: blur(10px);
  transition: width 0.2s, padding 0.2s;
  overflow: hidden;
}
.floormap-view__side.is-collapsed {
  width: 56px;
  padding: 12px 8px;
  align-items: center;
}
.floormap-view__side-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.floormap-view__side-fold {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: #8AA3C7;
  background: rgba(42, 63, 102, 0.35);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.floormap-view__side-fold:hover { color: #EAF2FC; border-color: #3294ED; }
.is-collapsed .floormap-view__side-fold svg { transform: rotate(180deg); }
.floormap-view__side-title {
  color: #B7CDE6;
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__side-count {
  flex-shrink: 0;
  padding: 0 7px;
  border-radius: 9px;
  background: rgba(50, 148, 237, 0.18);
  color: #7FB8F0;
  font-size: 11px;
  line-height: 17px;
}
.floormap-view__side-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* [v4-E] 搜索框整行 + 场景/排序平分第二行 (300px 侧栏下三控件同行会把搜索框挤到 ~40px) */
.floormap-view__side-filters .el-input { flex: 1 1 100%; }
.floormap-view__side-filters .el-select { flex: 1 1 calc(50% - 8px); min-width: 0; }
.floormap-view__cards {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.floormap-view__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.floormap-view__group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  background: none;
  border: none;
  color: #8AA3C7;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s;
}
.floormap-view__group-head:hover { color: #B7CDE6; }
.floormap-view__group-head svg { transition: transform 0.2s; flex-shrink: 0; }
.floormap-view__group-label {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__group-count {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(42, 63, 102, 0.5);
  font-size: 10px;
  line-height: 16px;
  color: #7E93B4;
}
.floormap-view__group-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.floormap-view__card {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 8px 10px 8px 13px;
  border: 1px solid #2A3F66;
  border-radius: 8px;
  background: rgba(31, 45, 74, 0.45);
  cursor: pointer;
  transition: all 0.2s;
}
/* 选中态: 左侧 3px 主题色高亮条 (需求规范) */
.floormap-view__card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  bottom: 20%;
  width: 3px;
  border-radius: 2px;
  background: #3294ED;
  opacity: 0;
  transition: opacity 0.2s;
}
.floormap-view__card:hover {
  border-color: #3294ED;
  transform: translateY(-1px);
}
.floormap-view__card.is-active {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.12);
  box-shadow: 0 2px 10px rgba(50, 148, 237, 0.15);
}
.floormap-view__card.is-active::before { opacity: 1; }
.floormap-view__card-thumb {
  width: 72px;
  height: 54px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid #3A5A8C;
  background: #0a1a35;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.floormap-view__card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.floormap-view__card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.floormap-view__card-name {
  color: #E8F1FA;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__card-meta {
  display: flex;
  gap: 6px;
  color: #8aa3c7;
  font-size: 11px;
}
.floormap-view__card-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.floormap-view__card-time {
  margin-left: auto;
  color: #5F7699;
  font-size: 10px;
  white-space: nowrap;
}
.floormap-view__card-devs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border: 1px solid rgba(58, 90, 140, 0.6);
  border-radius: 8px;
  color: #9FB4D4;
  font-size: 11px;
  line-height: 15px;
  white-space: nowrap;
}
.floormap-view__card-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── [v4-A2] 快捷过滤 chips + 批量操作条 ── */
.floormap-view__quick-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.floormap-view__chips-spacer { flex: 1; }
.floormap-view__chip {
  padding: 0 9px;
  height: 22px;
  line-height: 20px;
  font-size: 11px;
  color: #8AA3C7;
  background: rgba(42, 63, 102, 0.35);
  border: 1px solid #2A3F66;
  border-radius: 11px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.floormap-view__chip:hover { color: #EAF2FC; border-color: #3294ED; }
.floormap-view__chip.is-on {
  color: #EAF2FC;
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.22);
}
.floormap-view__batch-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(50, 148, 237, 0.4);
  border-radius: 8px;
  background: rgba(50, 148, 237, 0.1);
}
.floormap-view__batch-count { font-size: 11px; color: #7FB8F0; white-space: nowrap; }
.floormap-view__batch-scene { width: 86px; }
.floormap-view__sort { width: 96px; flex-shrink: 0; }

/* ── [v4-A1] 卡片信息密度增强: 场景着色 / 尺寸 / 比例尺 / 主图标 / hover 操作 / 勾选 ── */
.floormap-view__card-check {
  flex-shrink: 0;
  height: auto;
  margin-right: -2px;
}
.floormap-view__card.is-checked {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.16);
}
.floormap-view__card-dims {
  color: #5F7699;
  font-size: 10px;
  white-space: nowrap;
}
.floormap-view__card-spec {
  color: #6E86AB;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__card-scene {
  --sc: #3A5A8C;
  padding: 0 7px;
  height: 17px;
  line-height: 16px;
  font-size: 10px;
  border-radius: 8px;
  color: #EAF2FC;
  border: 1px solid color-mix(in srgb, var(--sc) 60%, transparent);
  background: color-mix(in srgb, var(--sc) 26%, transparent);
  white-space: nowrap;
}
.floormap-view__card-star {
  position: absolute;
  left: 3px;
  bottom: 3px;
  min-width: 15px;
  height: 15px;
  line-height: 15px;
  padding: 0 3px;
  border-radius: 7px;
  background: rgba(50, 148, 237, 0.9);
  color: #fff;
  font-size: 9px;
  text-align: center;
}
.floormap-view__card-ops {
  position: absolute;
  top: 4px;
  right: 5px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}
.floormap-view__card:hover .floormap-view__card-ops,
.floormap-view__card-ops:focus-within { opacity: 1; }
.floormap-view__card-ops button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: #B7CDE6;
  background: rgba(10, 26, 53, 0.85);
  border: 1px solid #2A3F66;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.floormap-view__card-ops button:hover { color: #EAF2FC; border-color: #3294ED; }
.floormap-view__card-ops button.is-danger:hover { color: #F93A55; border-color: #F93A55; }
.floormap-view__card-ops button.is-busy { opacity: 0.5; pointer-events: none; }

/* ── [v4-A3] 空库大插画 + 三步引导 ── */
.floormap-view__side-empty--big { gap: 8px; padding: 8px 0; }
.floormap-view__side-empty-title { color: #B7CDE6; font-size: 13px; font-weight: 600; margin-top: 2px; }
.floormap-view__empty-steps {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 2px 0 6px;
  padding: 0;
  list-style: none;
}
.floormap-view__empty-steps li {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #8AA3C7;
  font-size: 11px;
}
.floormap-view__empty-steps i {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(50, 148, 237, 0.2);
  border: 1px solid rgba(50, 148, 237, 0.55);
  color: #7FB8F0;
  font-size: 10px;
  font-style: normal;
}
.floormap-view__empty-actions { display: flex; gap: 8px; }

/* ── [v4-A4] rail 缩略图设备数徽标 ── */
.floormap-view__rail-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  min-width: 14px;
  height: 14px;
  line-height: 13px;
  padding: 0 3px;
  border-radius: 7px;
  background: #3294ED;
  border: 1.5px solid #0B1B36;
  color: #fff;
  font-size: 9px;
  text-align: center;
}

/* ── [FLOOR-MAP 2026-09-05 v3] 空态引导 (SVG 插画 + 引导文案) ── */
.floormap-view__side-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 10px;
  text-align: center;
  color: #8AA3C7;
  font-size: 13px;
}
.floormap-view__side-empty-sub {
  color: #5F7699;
  font-size: 11px;
  margin-bottom: 4px;
}

/* ── [FLOOR-MAP 2026-09-05 v3] 折叠图标条 (≤1400px 初始自动) ── */
.floormap-view__rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
  width: 100%;
}
.floormap-view__rail-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  color: #EAF2FC;
  background: rgba(50, 148, 237, 0.22);
  border: 1px solid #3294ED;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.floormap-view__rail-btn:hover { background: rgba(50, 148, 237, 0.4); }
.floormap-view__rail-thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  padding: 2px;
  background: rgba(31, 45, 74, 0.45);
  border: 1px solid #2A3F66;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
}
.floormap-view__rail-thumb:hover { border-color: #3294ED; }
.floormap-view__rail-thumb.is-active {
  border-color: #3294ED;
  box-shadow: 0 0 0 2px rgba(50, 148, 237, 0.35);
}
.floormap-view__rail-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}

/* ── 右侧编辑器 ── */
.floormap-view__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* ── [FLOOR-MAP 2026-09-05 v3] 右侧空态引导 (SVG 插画 + 三步提示) ── */
.floormap-view__placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8AA3C7;
  font-size: 14px;
}
.floormap-view__placeholder-sub {
  color: #5F7699;
  font-size: 12px;
}
.floormap-view__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.floormap-view__ipt { width: 150px; }
.floormap-view__ipt--s { width: 110px; }
.floormap-view__ipt--num { width: 118px; }
.floormap-view__unit { color: #8aa3c7; font-size: 12px; }
.floormap-view__toolbar-spacer { flex: 1; }

.floormap-view__editor {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.floormap-view__canvas-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  border: 1px solid #2A3F66;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(10, 22, 40, 0.5);
}
.floormap-view__pending-tip {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  padding: 4px 12px;
  background: rgba(249, 58, 85, 0.18);
  border: 1px solid #F93A55;
  border-radius: 4px;
  color: #F93A55;
  font-size: 12px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── [UX] 地图添加设备工具箱 (浮于画布右上; 宇视工具箱对标) ── */
/* [v4-G] 容器改壳: 收起态仅含入口按钮, 展开态含 body (定位不变) */
.floormap-view__add-kit {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 7;
}
/* 收起态轻量入口 (深色科技感主色按钮) */
.floormap-view__add-kit-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  background: linear-gradient(135deg, rgba(50, 148, 237, 0.88), rgba(26, 96, 180, 0.88));
  border: 1px solid #3294ED;
  border-radius: 8px;
  color: #F2F8FF;
  font-size: 12px;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(50, 148, 237, 0.35);
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}
.floormap-view__add-kit-entry:hover {
  background: linear-gradient(135deg, rgba(74, 168, 248, 0.92), rgba(34, 118, 214, 0.92));
  box-shadow: 0 3px 16px rgba(50, 148, 237, 0.5);
}
.floormap-view__add-kit-entry:active {
  transform: scale(0.97);
}
/* 展开态主体 (原容器样式平移) */
.floormap-view__add-kit-body {
  width: 196px;
  padding: 10px 10px 8px;
  background: rgba(10, 22, 40, 0.88);
  border: 1px solid #2A3F66;
  border-radius: 8px;
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* [v4-G] 展开/收起过渡 (统一 0.2s ease); leave 态穿透点击 — 收起瞬间入口按钮即可点 (免竞态遮挡) */
.fm-kit-enter-active,
.fm-kit-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fm-kit-leave-active {
  pointer-events: none;
}
.fm-kit-enter-from,
.fm-kit-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
/* head 收起按钮 (×, 靠右) */
.floormap-view__add-kit-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #7A90B3;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.floormap-view__add-kit-close:hover {
  background: rgba(42, 63, 102, 0.6);
  color: #EAF2FC;
}
.floormap-view__add-kit-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #DCE7F5;
  letter-spacing: 0.5px;
}
/* [v4-C9] 最近置顶角标 */
.floormap-view__add-kit-rec {
  margin-left: auto;
  padding: 0 5px;
  border: 1px solid rgba(0, 229, 255, 0.45);
  border-radius: 8px;
  color: #00E5FF;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
}
.floormap-view__add-kit-search :deep(.el-input__wrapper) {
  background: rgba(42, 63, 102, 0.28);
  box-shadow: 0 0 0 1px rgba(58, 90, 140, 0.6) inset;
}
.floormap-view__add-kit-nohit {
  padding: 10px 0;
  text-align: center;
  color: #4A5E80;
  font-size: 12px;
}
.floormap-view__add-kit-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.floormap-view__add-kit-type {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  background: rgba(42, 63, 102, 0.35);
  border: 1px solid transparent;
  border-radius: 6px;
  color: #B9C7DB;
  font-size: 12px;
  cursor: pointer;
  /* [v4-E16] 过渡统一 0.2s ease (锚点规范, 不混用其他曲线) */
  transition: background 0.2s ease, border-color 0.2s ease;
}
.floormap-view__add-kit-type:hover {
  background: rgba(42, 63, 102, 0.6);
}
.floormap-view__add-kit-type.is-active {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.18);
  color: #EAF2FC;
}
.floormap-view__add-kit-type span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* [v4-C9] 数量徽标 (当前图该类型绑定数; 0 变暗) */
.floormap-view__add-kit-count {
  margin-left: auto;
  min-width: 17px;
  padding: 0 4px;
  text-align: center;
  background: rgba(5, 14, 48, 0.65);
  border-radius: 8px;
  color: #8AA3C7;
  font-size: 10px;
  line-height: 15px;
  font-variant-numeric: tabular-nums;
}
.floormap-view__add-kit-count.is-zero { opacity: 0.4; }
/* [v4-C9] 最近使用第一位角标 */
.floormap-view__add-kit-type.is-recent::after {
  content: '最近';
  position: absolute;
  top: -5px;
  right: -3px;
  padding: 0 3px;
  background: #00E5FF;
  border-radius: 3px;
  color: #050E30;
  font-size: 9px;
  line-height: 13px;
}
/* [v4-C10] 连续落点开关行 */
.floormap-view__add-kit-cont {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.floormap-view__add-kit-cont-sub {
  color: #4A5E80;
  font-size: 10px;
}
.floormap-view__add-kit-pick :deep(.el-select),
.floormap-view__add-kit-pick :deep(.el-input) {
  width: 100%;
}

/* ── [v4-C10] 落点成功浮层 (Popconfirm 风格; 6s 自动关闭) ── */
.floormap-view__drop-ok {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: rgba(10, 22, 40, 0.94);
  border: 1px solid rgba(34, 197, 94, 0.5);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.floormap-view__drop-ok-txt {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #DCE7F5;
  font-size: 12px;
}
.fm-drop-enter-active,
.fm-drop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fm-drop-enter-from,
.fm-drop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
/* [v4-C10] 查看详情: 绑定行闪烁高亮 */
.floormap-view__binding.is-flash {
  animation: fm-bind-flash 1.6s ease;
  outline: 1px solid rgba(0, 229, 255, 0.7);
}
@keyframes fm-bind-flash {
  0%, 100% { background: transparent; }
  30% { background: rgba(0, 229, 255, 0.18); }
}
.floormap-view__add-kit-hint {
  font-size: 11px;
  color: #7E93B4;
  text-align: center;
}

/* ── 绑定面板 ── */
.floormap-view__panel {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #2A3F66;
  border-radius: 8px;
  background: rgba(31, 45, 74, 0.35);
  backdrop-filter: blur(6px);
  min-height: 0;
}
.floormap-view__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #2A3F66;
  color: #B7CDE6;
  font-size: 13px;
  font-weight: 600;
}
.floormap-view__panel-select { width: 140px; }
.floormap-view__panel-pick { padding: 8px 10px 0; }
.floormap-view__panel-pick-ipt { width: 100%; }
.floormap-view__binding-ipt { width: 120px; }
.floormap-view__snap {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #8aa3c7;
  font-size: 12px;
}
/* ── [v4-B5/B6/B7/B8] 绑定面板增强: io 行 / 类型 chips / 批量行 / 分组 / 状态 ── */
.floormap-view__panel-io {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.floormap-view__panel-io .el-button { margin: 0; padding: 5px 8px; }
.floormap-view__panel-io-up { display: inline-flex; }
.floormap-view__panel-search { margin-top: 6px; }
.floormap-view__panel-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.floormap-view__panel-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  height: 20px;
  font-size: 10px;
  color: #B7CDE6;
  background: rgba(42, 63, 102, 0.4);
  border: 1px solid #2A3F66;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.floormap-view__panel-chip i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.floormap-view__panel-chip:hover { border-color: #3294ED; }
.floormap-view__panel-chip.is-hidden {
  opacity: 0.38;
  text-decoration: line-through;
}
.floormap-view__panel-chip.is-zero { opacity: 0.55; }
.floormap-view__panel-batch {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 8px;
  border: 1px solid #2A3F66;
  border-radius: 8px;
  background: rgba(42, 63, 102, 0.25);
}
.floormap-view__panel-batch .el-button { margin: 0; }
.floormap-view__panel-batch-count {
  font-size: 11px;
  color: #7FB8F0;
}
.floormap-view__bind-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.floormap-view__bind-group-head {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 2px;
  background: none;
  border: none;
  color: #8AA3C7;
  font-size: 11px;
  cursor: pointer;
  transition: color 0.2s;
}
.floormap-view__bind-group-head:hover { color: #B7CDE6; }
.floormap-view__bind-group-head svg { flex-shrink: 0; }
.floormap-view__bind-group-label { font-weight: 600; }
.floormap-view__bind-group-count {
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(42, 63, 102, 0.5);
  font-size: 10px;
  line-height: 15px;
  color: #7E93B4;
}
.floormap-view__bind-group-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.floormap-view__binding.is-dim { opacity: 0.6; }
.floormap-view__binding.is-checked {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.1);
}
.floormap-view__binding-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.floormap-view__binding-status.is-on { background: #22C55E; box-shadow: 0 0 5px rgba(34, 197, 94, 0.6); }
.floormap-view__binding-status.is-off { background: #64748B; }
.floormap-view__binding-status.is-alarm {
  background: #F93A55;
  box-shadow: 0 0 5px rgba(249, 58, 85, 0.7);
  animation: fm-bind-blink 1s ease-in-out infinite;
}
@keyframes fm-bind-blink { 50% { opacity: 0.45; } }
.floormap-view__binding-alarm {
  padding: 0 5px;
  height: 16px;
  line-height: 15px;
  border-radius: 8px;
  background: rgba(249, 58, 85, 0.18);
  border: 1px solid rgba(249, 58, 85, 0.55);
  color: #F87A8D;
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
.floormap-view__binding-check { margin-right: -2px; height: auto; }
.floormap-view__bind-nohit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 0 10px;
  color: #8AA3C7;
  font-size: 12px;
}
.floormap-view__bind-nohit-sub { color: #5F7699; font-size: 11px; }

/* [v4-E17] 无绑定空态插画 (线条+渐变, 替代 el-empty) */
.floormap-view__bind-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 26px 12px 22px;
  text-align: center;
}
.floormap-view__bind-empty p {
  margin: 0;
  color: #8FA3BF;
  font-size: 13px;
}
.floormap-view__bind-empty-sub { color: #5F7699; font-size: 12px; }

/* [v4-E18] 快捷键提示条 (fixed 底部居中, 可关闭 localStorage 记忆) */
.floormap-view__kbd-hint {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 12px;
  background: rgba(16, 32, 63, 0.92);
  border: 1px solid #2E4570;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  color: #8FA3BF;
  font-size: 12px;
  z-index: 1200;
  backdrop-filter: blur(4px);
}
.floormap-view__kbd-hint kbd {
  display: inline-block;
  min-width: 18px;
  padding: 1px 5px;
  margin-right: 4px;
  background: rgba(42, 63, 102, 0.7);
  border: 1px solid #3A5A8C;
  border-radius: 4px;
  color: #CFE0F5;
  font-size: 11px;
  font-family: inherit;
  text-align: center;
}
.floormap-view__kbd-close { margin-left: 4px; }
/* [v4-E18] 快捷键导航高亮 (↑↓ 选中态, 弱于 is-active 主高亮) */
.floormap-view__card.is-kb {
  border-color: #7FB8F0;
  box-shadow: 0 0 0 1px rgba(127, 184, 240, 0.4);
}

.floormap-view__bindings {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.floormap-view__binding {
  padding: 6px 8px;
  border: 1px solid #2A3F66;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.floormap-view__binding-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.floormap-view__binding-row--ctrl { flex-wrap: wrap; }
.floormap-view__binding-name {
  color: #E8F1FA;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-view__binding-label { color: #8aa3c7; font-size: 11px; }
.floormap-view__binding-spacer { flex: 1; }
.floormap-view__gps-hint {
  padding: 6px 10px;
  border-top: 1px solid #2A3F66;
  color: #00E5FF;
  font-size: 11px;
}
</style>

<!-- ══ [FLOOR-MAP 2026-09-05 v3] 新建向导样式 (el-dialog teleport 到 body, 需非 scoped; .floormap-wizard 前缀隔离) ══ -->
<style>
.floormap-wizard .el-dialog {
  border-radius: 12px;
  background: linear-gradient(170deg, #10203F 0%, #0A1628 100%);
  border: 1px solid rgba(58, 90, 140, 0.6);
}
.floormap-wizard .el-dialog__title {
  color: #E8F1FA;
  font-size: 15px;
  font-weight: 600;
}
.floormap-wizard .el-dialog__body {
  padding: 14px 24px 6px;
}
.floormap-wizard .el-dialog__footer {
  padding: 10px 24px 16px;
}
.floormap-wizard__step {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 6px;
}
.floormap-wizard__upload {
  width: 100%;
}
.floormap-wizard__upload .el-upload,
.floormap-wizard__upload .el-upload-dragger {
  width: 100%;
  background: rgba(16, 30, 55, 0.5);
  border: 1px dashed #3A5A8C;
  border-radius: 10px;
  transition: border-color 0.2s;
}
.floormap-wizard__upload .el-upload-dragger:hover,
.floormap-wizard__upload .el-upload-dragger.is-dragover {
  border-color: #3294ED;
}
.floormap-wizard__upload-empty {
  padding: 26px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #8AA3C7;
  font-size: 13px;
}
.floormap-wizard__upload-sub {
  color: #5F7699;
  font-size: 11px;
}
.floormap-wizard__upload-preview {
  max-width: 100%;
  max-height: 240px;
  padding: 8px;
  object-fit: contain;
}
.floormap-wizard__file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid rgba(58, 90, 140, 0.6);
  border-radius: 8px;
  background: rgba(42, 63, 102, 0.25);
}

/* ── [v4-D14] 新手引导横幅 (创建后出现, 可关闭) ── */
.floormap-view__guide {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  margin-bottom: 8px;
  background: linear-gradient(90deg, rgba(50, 148, 237, 0.16), rgba(0, 229, 255, 0.08));
  border: 1px solid rgba(50, 148, 237, 0.45);
  border-radius: 8px;
  font-size: 12px;
  animation: fm-guide-in 0.2s ease;
}
@keyframes fm-guide-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.floormap-view__guide-title {
  color: #00E5FF;
  font-weight: 600;
}
.floormap-view__guide-step {
  color: #B7CDE6;
}
.floormap-view__guide-close {
  margin-left: auto;
  color: #8AA3C7;
}

/* ── [v4-D11] PDF 提取中提示 ── */
.floormap-wizard__pdf-busy {
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px dashed #3294ED;
  border-radius: 6px;
  color: #3294ED;
  font-size: 12px;
  text-align: center;
}
/* [v4-D12] 名称智能建议 */
.floormap-wizard__suggest { margin-left: 8px; color: #00E5FF; }
/* [v4-D12] 楼层快捷芯片 */
.floormap-wizard__floor-chips {
  display: flex;
  gap: 4px;
  margin-left: 8px;
}
.floormap-wizard__floor-chip {
  padding: 2px 8px;
  background: rgba(42, 63, 102, 0.35);
  border: 1px solid transparent;
  border-radius: 10px;
  color: #B9C7DB;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.floormap-wizard__floor-chip:hover { background: rgba(42, 63, 102, 0.6); }
.floormap-wizard__floor-chip.is-on {
  border-color: #3294ED;
  background: rgba(50, 148, 237, 0.18);
  color: #EAF2FC;
}
/* [v4-D12] 两点测算 */
.floormap-wizard__scale-calc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0 10px 92px;
  padding: 8px;
  background: rgba(10, 22, 40, 0.55);
  border: 1px dashed #3A5A8C;
  border-radius: 6px;
}
.floormap-wizard__scale-img {
  position: relative;
  cursor: crosshair;
  text-align: center;
  background: #0A1628;
  border-radius: 4px;
  overflow: hidden;
}
.floormap-wizard__scale-img img {
  max-width: 100%;
  max-height: 140px;
  width: auto;
  height: auto;
  display: inline-block;
  user-select: none;
  -webkit-user-drag: none;
}
.floormap-wizard__scale-pt {
  position: absolute;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #00E5FF;
  border-radius: 50%;
  color: #050E30;
  font-size: 10px;
  font-weight: 600;
  pointer-events: none;
}
.floormap-wizard__scale-line {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.floormap-wizard__scale-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #B7CDE6;
}
/* [v4-D13] 效果预览 mini */
.floormap-wizard__mini {
  margin-top: 10px;
}
.floormap-wizard__mini-label {
  margin-bottom: 4px;
  color: #4A5E80;
  font-size: 11px;
}
.floormap-wizard__mini svg {
  width: 100%;
  display: block;
  border-radius: 4px;
}
/* [v4-D14] 下一步建议卡片 */
.floormap-wizard__next {
  display: flex;
  gap: 8px;
  margin: 12px 0 4px;
}
.floormap-wizard__next-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(42, 63, 102, 0.28);
  border: 1px solid rgba(58, 90, 140, 0.6);
  border-radius: 8px;
  text-align: left;
  transition: border-color 0.2s ease;
}
.floormap-wizard__next-card:hover { border-color: #3294ED; }
.floormap-wizard__next-card b {
  display: block;
  color: #EAF2FC;
  font-size: 12px;
}
.floormap-wizard__next-card span {
  color: #8AA3C7;
  font-size: 11px;
}
.floormap-wizard__done .el-button { margin-top: 6px; }
.floormap-wizard__file-name {
  flex: 1;
  min-width: 0;
  color: #DCE7F5;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.floormap-wizard__file-size {
  flex-shrink: 0;
  color: #7E93B4;
  font-size: 11px;
}
.floormap-wizard__unit {
  margin-left: 8px;
  color: #8AA3C7;
  font-size: 12px;
}
.floormap-wizard__tip {
  color: #5F7699;
  font-size: 11px;
  line-height: 1.5;
  padding: 0 4px;
}
.floormap-wizard__confirm {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.floormap-wizard__confirm-thumb {
  width: 180px;
  height: 130px;
  flex-shrink: 0;
  object-fit: contain;
  border: 1px solid rgba(58, 90, 140, 0.6);
  border-radius: 8px;
  background: rgba(10, 22, 40, 0.5);
  padding: 4px;
}
.floormap-wizard__confirm-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}
.floormap-wizard__confirm-meta > div {
  display: flex;
  gap: 10px;
}
.floormap-wizard__confirm-meta dt {
  flex-shrink: 0;
  width: 82px;
  color: #7E93B4;
  font-size: 12px;
}
.floormap-wizard__confirm-meta dd {
  margin: 0;
  color: #DCE7F5;
  font-size: 12px;
  word-break: break-all;
}
.floormap-wizard__done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #E8F1FA;
  font-size: 14px;
}
.floormap-wizard__done-sub {
  color: #7E93B4;
  font-size: 12px;
}
</style>
