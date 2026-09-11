<template>
  <div class="user-management">
    <div class="page-header">
      <h2>用户管理</h2>
      <div>
        <el-button @click="openOrgCreate('')">
          <el-icon><OfficeBuilding /></el-icon> 新增组织
        </el-button>
        <!-- [UI-8 2026-09-10] 人脸库人员批量建档为平台用户 + 自动绑定 -->
        <el-button type="success" @click="openFaceImport" v-permission="['users:write']">
          <el-icon><Avatar /></el-icon> 人脸建档
        </el-button>
        <el-button type="primary" @click="openCreateDialog" v-permission="['users:write']">
          <el-icon><Plus /></el-icon> 新增用户
        </el-button>
      </div>
    </div>

    <div class="um-body">
      <!-- ── 左侧：组织机构树 (组织机构→部门 任意多级) ── -->
      <el-card class="um-org-panel" shadow="never">
        <div class="um-org-head">
          <span class="um-org-title">组织机构</span>
          <el-button link size="small" @click="orgExpandAll = !orgExpandAll">
            {{ orgExpandAll ? '折叠' : '展开' }}
          </el-button>
        </div>
        <el-tree
          :key="orgExpandAll ? 'expanded' : 'collapsed'"
          :data="orgTreeData"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          :default-expand-all="orgExpandAll"
          :expand-on-click-node="false"
          highlight-current
          class="um-org-tree"
        >
          <template #default="{ data }">
            <div
              class="um-org-node"
              :class="{ 'is-active': selectedOrgId === data.id }"
              @click="selectOrg(data.id)"
            >
              <el-icon class="um-org-icon"><OfficeBuilding /></el-icon>
              <span class="um-org-name">{{ data.name }}</span>
              <span class="um-org-count">{{ orgUserCount(data.id) }}</span>
              <span class="um-org-actions" @click.stop>
                <el-button link type="primary" size="small" @click="openOrgCreate(data.id)">加子级</el-button>
                <el-button link type="primary" size="small" @click="openOrgEdit(data.org)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeOrg(data.org)">删除</el-button>
              </span>
            </div>
          </template>
        </el-tree>
        <el-empty v-if="orgUnits.length === 0" description="暂无组织，点击右上角新增" :image-size="56" />
      </el-card>

      <!-- ── 右侧：搜索 + 人员表格 ── -->
      <div class="um-main">
        <el-card class="search-bar" shadow="never">
          <el-form :inline="true" :model="searchForm">
            <el-form-item label="用户名">
              <el-input v-model="searchForm.username" placeholder="搜索用户名" clearable />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="searchForm.status" placeholder="全部" clearable>
                <el-option label="正常" value="active" />
                <el-option label="禁用" value="disabled" />
                <el-option label="锁定" value="locked" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="fetchUsers">查询</el-button>
              <el-button @click="resetSearch">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never">
          <div v-if="selectedOrgId" class="um-org-filter-hint">
            按组织「{{ selectedOrgName }}」过滤（含下级）
            <el-button link size="small" @click="selectOrg('')">清除</el-button>
          </div>
          <el-table :data="filteredUsers" border stripe v-loading="loading" style="width: 100%">
            <el-table-column prop="username" label="用户名" min-width="110" />
            <el-table-column prop="displayName" label="显示名称" min-width="110" />
            <el-table-column label="所属组织" min-width="120">
              <template #default="{ row }">
                <template v-if="orgNameOf((row as any).orgId)">
                  {{ orgNameOf((row as any).orgId) }}
                </template>
                <!-- [UI-5 2026-09-10] 员工必须挂载组织: 未挂载黄色警示 -->
                <el-tooltip v-else-if="!isUserAdmin(row)" content="员工未挂载组织, 请编辑用户选择所属组织" placement="top">
                  <span class="org-missing">未挂载!</span>
                </el-tooltip>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <!-- [UI-5 2026-09-10] 人员分类: 管理员(全平台权限) / 员工(挂载组织) -->
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag :type="isUserAdmin(row) ? 'danger' : 'info'" size="small">
                  {{ isUserAdmin(row) ? '管理员' : '员工' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" min-width="120">
              <template #default="{ row }">
                <span v-if="row.phone">{{ row.phone }}</span>
                <span v-else class="face-none">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="email" label="邮箱" min-width="150">
              <template #default="{ row }">
                <span v-if="row.email">{{ row.email }}</span>
                <span v-else class="face-none">—</span>
              </template>
            </el-table-column>
            <el-table-column label="角色" min-width="150">
              <template #default="{ row }">
                <el-tag
                  v-for="roleId in row.roleIds"
                  :key="roleId"
                  :type="roleTagType(roleId)"
                  size="small"
                  style="margin-right: 4px"
                >
                  {{ getRoleName(roleId) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="关联人脸" width="140">
              <template #default="{ row }">
                <!-- [UI-5 2026-09-10] 员工↔人脸底库打通 (metadata.rbac_user_id 绑定);
                     [UI-7] 多脸显示主脸 + +N -->
                <div v-if="faceOfUser(row)" class="face-cell">
                  <el-avatar :size="26" :src="faceImgUrl(faceOfUser(row)!)" shape="square" />
                  <span class="face-name">{{ faceOfUser(row)!.name }}</span>
                  <el-tooltip v-if="extraFaceCount(row) > 0"
                              :content="`另有 ${extraFaceCount(row)} 张关联人脸, 解绑时一并解除`" placement="top">
                    <el-tag size="small" type="info" effect="plain" class="face-extra">+{{ extraFaceCount(row) }}</el-tag>
                  </el-tooltip>
                </div>
                <span v-else class="face-none">未关联</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" size="small">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="360" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openDetail(row)">
                  详情
                </el-button>
                <el-button link type="primary" size="small" @click="openEditDialog(row)" v-permission="['users:write']">
                  编辑
                </el-button>
                <el-button link type="success" size="small" @click="openFaceDialog(row)" v-permission="['users:write']">
                  关联人脸
                </el-button>
                <el-button
                  v-if="faceOfUser(row)"
                  link
                  type="danger"
                  size="small"
                  @click="unbindUserFaces(row)"
                  v-permission="['users:write']"
                >
                  解绑
                </el-button>
                <el-button
                  link
                  type="warning"
                  size="small"
                  @click="toggleUserStatus(row)"
                  v-permission="['users:manage']"
                >
                  {{ row.status === 'active' ? '禁用' : '启用' }}
                </el-button>
                <el-popconfirm
                  title="确认删除该用户？"
                  @confirm="handleDelete(row.id)"
                  v-permission="['users:delete']"
                >
                  <template #reference>
                    <el-button link type="danger" size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>

    <!-- 创建/编辑用户对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑用户' : '新增用户'"
      width="680px"
      @close="resetForm"
    >
      <!-- [UI-9 2026-09-10] 对标安防平台五组字段: 必填优先/视觉分组/适配控件 -->
      <el-form :model="userForm" :rules="userRules" ref="formRef" label-width="110px">
        <div class="uf-group-title">账户信息</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="userForm.username" :disabled="isEditing" placeholder="请输入用户名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="显示名称" prop="displayName">
              <el-input v-model="userForm.displayName" placeholder="请输入显示名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item v-if="!isEditing" label="密码" prop="password">
              <el-input v-model="userForm.password" type="password" placeholder="留空则默认 用户名@123" show-password />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-radio-group v-model="userForm.status">
                <el-radio value="active">正常</el-radio>
                <el-radio value="disabled">禁用</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="角色" prop="roleIds">
          <el-select v-model="userForm.roleIds" multiple placeholder="可选, 员工可不分配角色" style="width: 100%">
            <el-option
              v-for="role in allRoles"
              :key="role.id"
              :label="role.name"
              :value="String(role.id)"
            />
          </el-select>
        </el-form-item>

        <div class="uf-group-title">组织与岗位</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="所属组织" prop="orgId">
              <el-select v-model="userForm.orgId" placeholder="不选 = 未挂载组织" clearable style="width: 100%">
                <el-option
                  v-for="o in orgFlatOptions"
                  :key="o.id"
                  :label="o.label"
                  :value="o.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工号" prop="employeeId">
              <el-input v-model="userForm.employeeId" placeholder="如 EMP-0001" maxlength="32" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="职位" prop="jobTitle">
              <el-input v-model="userForm.jobTitle" placeholder="如：安保队长" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期" prop="hireDate">
              <el-date-picker v-model="userForm.hireDate" type="date" value-format="YYYY-MM-DD"
                              placeholder="选择日期" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="离职日期" prop="leaveDate">
              <el-date-picker v-model="userForm.leaveDate" type="date" value-format="YYYY-MM-DD"
                              placeholder="在职则留空" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="uf-group-title">联系方式</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="userForm.phone" placeholder="如 13800138000" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="办公电话" prop="officePhone">
              <el-input v-model="userForm.officePhone" placeholder="如 0571-88888888" maxlength="24" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="选填" />
        </el-form-item>

        <div class="uf-group-title">身份信息</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="性别" prop="gender">
              <el-select v-model="userForm.gender" placeholder="未知" clearable style="width: 100%">
                <el-option label="男" value="male" />
                <el-option label="女" value="female" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生日" prop="birthday">
              <el-date-picker v-model="userForm.birthday" type="date" value-format="YYYY-MM-DD"
                              placeholder="选择日期" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="证件类型" prop="idType">
              <el-select v-model="userForm.idType" placeholder="选填" clearable style="width: 100%">
                <el-option v-for="(label, val) in ID_TYPE_LABELS" :key="val" :label="label" :value="val" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="证件号码" prop="idNumber">
              <el-input v-model="userForm.idNumber" placeholder="与证件类型配套填写" maxlength="32" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="地址" prop="address">
          <el-input v-model="userForm.address" placeholder="选填，现居住/户籍地址" maxlength="120" />
        </el-form-item>

        <div class="uf-group-title">其他</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="紧急联系人" prop="emergencyContact">
              <el-input v-model="userForm.emergencyContact" placeholder="选填" maxlength="32" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="紧急联系电话" prop="emergencyPhone">
              <el-input v-model="userForm.emergencyPhone" placeholder="填联系人后必填" maxlength="20" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="标签" prop="tagsArr">
          <el-select v-model="userForm.tagsArr" multiple filterable allow-create default-first-option
                     placeholder="输入后回车创建标签" style="width: 100%">
            <el-option v-for="t in TAG_PRESETS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="userForm.remark" type="textarea" :rows="2" maxlength="200" show-word-limit
                    placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑组织对话框 -->
    <el-dialog v-model="orgDlgVisible" :title="orgEditing ? '编辑组织' : '新增组织'" width="440px">
      <el-form label-position="top">
        <el-form-item label="组织名称" required>
          <el-input v-model="orgForm.name" placeholder="如：华东区 / 安保部 / 东门班组" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="上级组织（可选，多级管理）">
          <el-select v-model="orgForm.parent_id" placeholder="不选 = 顶级组织" clearable style="width: 100%">
            <el-option
              v-for="o in orgParentCandidates"
              :key="o.id"
              :label="o.label"
              :value="o.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="orgForm.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="排序值（越小越靠前）">
          <el-input-number v-model="orgForm.sort_order" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orgDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="orgSaving" @click="submitOrg">保存</el-button>
      </template>
    </el-dialog>
    <!-- [UI-8 2026-09-10] 人脸库人员批量建档 (创建平台用户 + 写入 metadata 绑定) -->
    <el-dialog v-model="faceImportVisible" title="人脸建档 — 批量导入平台用户" width="720px">
      <div class="fi-hint">
        将人脸库中的人员批量创建为平台用户，并自动建立人脸↔用户关联。
        人脸底库记录保留（识别功能不受影响）。登录名默认取姓名，可逐行修改；同名用户已存在或已绑定的人脸默认不勾选。
      </div>
      <div class="fi-pwd-bar">
        <span class="fi-pwd-label">统一初始密码</span>
        <el-input v-model="faceImportPwd" size="small" style="width: 200px" show-password />
      </div>
      <el-table :data="faceImportRows" border size="small" max-height="380" v-loading="faceImportLoading"
                @selection-change="(sel: any[]) => faceImportSel = sel">
        <el-table-column type="selection" width="42" :selectable="(row: any) => !row.note" />
        <el-table-column label="人脸" width="64">
          <template #default="{ row }">
            <el-avatar :size="34" :src="faceImgUrl(row.face)" shape="square" />
          </template>
        </el-table-column>
        <el-table-column label="姓名" min-width="100">
          <template #default="{ row }">{{ row.face.name }}</template>
        </el-table-column>
        <el-table-column label="分组" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.face.group_type_cn || row.face.group_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="登录名" min-width="130">
          <template #default="{ row }">
            <el-input v-model="row.username" size="small" :disabled="!!row.note" />
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="150">
          <template #default="{ row }">
            <span v-if="row.note" class="fi-note">{{ row.note }}</span>
            <span v-else class="fi-ready">待建档</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <span class="fi-progress">{{ faceImportProgress }}</span>
        <el-button @click="faceImportVisible = false">关闭</el-button>
        <el-button type="primary" :loading="faceImporting" @click="runFaceImport" v-permission="['users:write']">
          导入 {{ faceImportSel.length }} 人
        </el-button>
      </template>
    </el-dialog>
    <!-- [UI-5 2026-09-10] 人脸底库选择器 (员工↔人脸打通; 绑定写 face_record.metadata) -->
    <el-dialog v-model="faceDlgVisible" :title="`关联人脸 — ${faceTargetUser?.username || ''}`" width="640px">
      <div class="face-picker-bar">
        <el-radio-group v-model="faceGroupFilter" size="small" @change="fetchFaceRecords">
          <el-radio-button label="staff">员工</el-radio-button>
          <el-radio-button label="whitelist">白名单</el-radio-button>
          <el-radio-button label="visitor">访客</el-radio-button>
          <el-radio-button label="vip">VIP</el-radio-button>
          <el-radio-button label="">全部</el-radio-button>
        </el-radio-group>
        <el-input v-model="faceSearchKw" placeholder="搜索姓名" size="small" clearable style="width:160px" @input="fetchFaceRecords" />
      </div>
      <div v-loading="faceLoading" class="face-grid">
        <div v-for="rec in faceRecords" :key="rec.person_id"
             class="face-item"
             :class="{ 'is-bound-other': isBoundToOther(rec), 'is-bound-current': isBoundToCurrent(rec) }"
             @click="bindFace(rec)">
          <el-avatar :size="56" :src="faceImgUrl(rec)" shape="square" />
          <span class="face-item-name">{{ rec.name }}</span>
          <span class="face-item-group">{{ rec.group_type_cn || rec.group_type }}</span>
          <span v-if="isBoundToCurrent(rec)" class="face-item-tag">当前关联</span>
          <span v-else-if="isBoundToOther(rec)" class="face-item-tag face-item-tag--other">已被 {{ rec.metadata?.rbac_username }} 关联</span>
        </div>
        <el-empty v-if="!faceLoading && faceRecords.length === 0" description="该分组暂无人脸记录" :image-size="60" />
      </div>
      <template #footer>
        <span class="face-footer-hint">点击人脸卡片即完成关联 (写入门禁人脸 metadata, 组织变更不影响绑定)</span>
        <el-button @click="faceDlgVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- [UI-9 2026-09-10] 人员档案详情抽屉 (全字段只读展示) -->
    <el-drawer v-model="detailVisible" :title="`人员档案 — ${detailUser?.displayName || detailUser?.username || ''}`" size="500px">
      <div v-if="detailUser" class="ud-body">
        <div class="ud-head">
          <el-avatar :size="52" :src="faceOfUser(detailUser) ? faceImgUrl(faceOfUser(detailUser)!) : ''" shape="square">
            {{ (detailUser.displayName || detailUser.username || '?').slice(0, 1) }}
          </el-avatar>
          <div class="ud-head-main">
            <div class="ud-head-name">
              {{ detailUser.displayName || detailUser.username }}
              <el-tag :type="statusTagType(detailUser.status)" size="small">{{ statusLabel(detailUser.status) }}</el-tag>
              <el-tag :type="isUserAdmin(detailUser) ? 'danger' : 'info'" size="small" effect="plain">
                {{ isUserAdmin(detailUser) ? '管理员' : '员工' }}
              </el-tag>
            </div>
            <div class="ud-head-sub">@{{ detailUser.username }}
              <template v-if="detailUser.employeeId"> · 工号 {{ detailUser.employeeId }}</template>
            </div>
          </div>
        </div>

        <div class="ud-group-title">组织与岗位</div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="所属组织" :span="2">{{ orgNameOf(detailUser.orgId) || '未挂载' }}</el-descriptions-item>
          <el-descriptions-item label="职位">{{ detailUser.jobTitle || '—' }}</el-descriptions-item>
          <el-descriptions-item label="工号">{{ detailUser.employeeId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="入职日期">{{ detailUser.hireDate || '—' }}</el-descriptions-item>
          <el-descriptions-item label="离职日期">{{ detailUser.leaveDate || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="ud-group-title">联系方式</div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="手机号">{{ detailUser.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="办公电话">{{ detailUser.officePhone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱" :span="2">{{ detailUser.email || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="ud-group-title">身份信息</div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="性别">{{ genderLabel(detailUser.gender) }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ detailUser.birthday || '—' }}</el-descriptions-item>
          <el-descriptions-item label="证件">{{ idDesc(detailUser) }}</el-descriptions-item>
          <el-descriptions-item label="地址">{{ detailUser.address || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="ud-group-title">其他</div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="紧急联系人">
            {{ detailUser.emergencyContact ? `${detailUser.emergencyContact} ${detailUser.emergencyPhone || ''}` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="标签">
            <template v-if="detailTags(detailUser).length">
              <el-tag v-for="t in detailTags(detailUser)" :key="t" size="small" effect="plain" style="margin-right: 4px">{{ t }}</el-tag>
            </template>
            <template v-else>—</template>
          </el-descriptions-item>
          <el-descriptions-item label="备注">{{ detailUser.remark || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="ud-group-title">关联与审计</div>
        <el-descriptions :column="2" border size="small">
          <!-- [UI-9 FIX 2026-09-10] 详情抽屉补角色展示: 之前五段均无角色, 编辑加角色后详情看不到变更 -->
          <el-descriptions-item label="角色" :span="2">
            <template v-if="(detailUser.roleIds || []).length">
              <el-tag
                v-for="rid in detailUser.roleIds"
                :key="rid"
                :type="roleTagType(String(rid))"
                size="small"
                style="margin-right: 4px"
              >{{ getRoleName(String(rid)) }}</el-tag>
            </template>
            <template v-else>未分配</template>
          </el-descriptions-item>
          <el-descriptions-item label="关联人脸" :span="2">
            <template v-if="faceOfUser(detailUser)">
              <div class="face-cell">
                <el-avatar :size="26" :src="faceImgUrl(faceOfUser(detailUser)!)" shape="square" />
                <span class="face-name">{{ faceOfUser(detailUser)!.name }}</span>
                <el-tag v-if="extraFaceCount(detailUser) > 0" size="small" type="info" effect="plain">+{{ extraFaceCount(detailUser) }}</el-tag>
              </div>
            </template>
            <template v-else>未关联</template>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(String(detailUser.createdAt ?? '')) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(String(detailUser.updatedAt ?? '')) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, OfficeBuilding, Avatar } from '@element-plus/icons-vue'
import type { User, Role } from '@/types/rbac'
import { rbacApi } from '@/api/rbac'
import { orgUnitApi, type OrgUnit } from '@/api/org'
import faceApi, { type FaceRecord } from '@/api/face'   // [UI-5] 员工↔人脸底库打通
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'

const auth = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingUserId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const users = ref<User[]>([])
const allRoles = ref<Role[]>([])

const searchForm = ref({
  username: '',
  status: ''
})

// ---- 组织机构 [P1.4 2026-09-10] ----
const orgUnits = ref<OrgUnit[]>([])
const selectedOrgId = ref('')
const orgExpandAll = ref(true)

// 组织树对话框
const orgDlgVisible = ref(false)
const orgEditing = ref<OrgUnit | null>(null)
const orgSaving = ref(false)
const orgForm = ref({ name: '', parent_id: '', sort_order: 0, description: '' })

interface OrgNode { id: string; name: string; org: OrgUnit; children: OrgNode[] }

/** 平表→树 (悬垂/环引用容错提升为顶级, 与 areaTree.buildAreaTree 同款范式) */
function buildOrgTree(units: OrgUnit[]): OrgNode[] {
  const byId = new Map<string, OrgNode>()
  for (const u of units) byId.set(u.id, { id: u.id, name: u.name, org: u, children: [] })
  const roots: OrgNode[] = []
  for (const node of byId.values()) {
    const parent = node.org.parent_id ? byId.get(node.org.parent_id) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (nodes: OrgNode[]) => {
    nodes.sort((x, y) =>
      (x.org.sort_order ?? 0) - (y.org.sort_order ?? 0)
      || (x.org.created_at ?? 0) - (y.org.created_at ?? 0)
      || x.id.localeCompare(y.id))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

const orgTreeData = computed(() => buildOrgTree(orgUnits.value))

/** 节点→子树全量组织 id 集 (含自身) — 选中组织 = 其全子树人员 */
function orgSubtreeIds(id: string): string[] {
  const out: string[] = []
  const walk = (nodes: OrgNode[]) => {
    for (const n of nodes) {
      if (n.id === id) {
        const collect = (x: OrgNode) => { out.push(x.id); for (const c of x.children) collect(c) }
        collect(n)
        return true
      }
      if (walk(n.children)) return true
    }
    return false
  }
  walk(orgTreeData.value)
  return out
}

/** 组织平表下拉选项 (层级缩进展示) */
function orgFlatOptionsWith(units: OrgUnit[]) {
  const opts: Array<{ id: string; label: string }> = []
  const walk = (nodes: OrgNode[], depth: number) => {
    for (const n of nodes) {
      opts.push({ id: n.id, label: `${depth > 0 ? '├ '.repeat(depth) : ''}${n.name}` })
      walk(n.children, depth + 1)
    }
  }
  walk(buildOrgTree(units), 0)
  return opts
}
const orgFlatOptions = computed(() => orgFlatOptionsWith(orgUnits.value))

/** 可作上级的候选: 编辑时排除自身与全部后代 (防环) */
const orgParentCandidates = computed(() => {
  if (!orgEditing.value) return orgFlatOptions.value
  const banned = new Set<string>([orgEditing.value.id])
  const collect = (pid: string) => {
    for (const u of orgUnits.value) {
      if (u.parent_id === pid && !banned.has(u.id)) { banned.add(u.id); collect(u.id) }
    }
  }
  collect(orgEditing.value.id)
  return orgFlatOptions.value.filter(o => !banned.has(o.id))
})

function orgNameOf(id?: string): string {
  if (!id) return ''
  return orgUnits.value.find(u => u.id === id)?.name || ''
}

function selectOrg(id: string) {
  selectedOrgId.value = id
}

function orgUserCount(id: string): number {
  const ids = new Set(orgSubtreeIds(id))
  return users.value.filter(u => ids.has((u as any).orgId || '')).length
}

async function fetchOrgUnits() {
  try {
    const res = await orgUnitApi.list()
    const data = (res.data as any)?.data ?? (res.data as any)
    orgUnits.value = data?.items || []
  } catch { orgUnits.value = [] }   // 组织服务不可用静默 (树隐藏, 表格不受影响)
}

function openOrgCreate(parentId: string) {
  orgEditing.value = null
  orgForm.value = { name: '', parent_id: parentId, sort_order: 0, description: '' }
  orgDlgVisible.value = true
}

function openOrgEdit(u: OrgUnit) {
  orgEditing.value = u
  orgForm.value = {
    name: u.name, parent_id: u.parent_id || '',
    sort_order: u.sort_order ?? 0, description: u.description || '',
  }
  orgDlgVisible.value = true
}

async function submitOrg() {
  if (!orgForm.value.name.trim()) { ElMessage.warning('请填写组织名称'); return }
  orgSaving.value = true
  try {
    if (orgEditing.value) {
      await orgUnitApi.update(orgEditing.value.id, { ...orgForm.value })
      ElMessage.success('组织已更新')
    } else {
      await orgUnitApi.create({ ...orgForm.value })
      ElMessage.success('组织已创建')
    }
    orgDlgVisible.value = false
    await fetchOrgUnits()
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || e))
  } finally {
    orgSaving.value = false
  }
}

async function removeOrg(u: OrgUnit) {
  try {
    await ElMessageBox.confirm(
      `确定删除组织「${u.name}」？下级组织将提升为顶级，已挂载人员将变为未分配。`,
      '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    await orgUnitApi.remove(u.id)
    ElMessage.success('已删除')
    if (selectedOrgId.value === u.id) selectedOrgId.value = ''
    await Promise.all([fetchOrgUnits(), fetchUsers()])
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e?.message || e))
  }
}

// ---- [UI-5 2026-09-10] 员工↔人脸底库打通 ----
const faceDlgVisible = ref(false)
const faceTargetUser = ref<any>(null)
const faceRecords = ref<FaceRecord[]>([])
const faceLoading = ref(false)
const faceGroupFilter = ref<'staff' | 'whitelist' | 'visitor' | 'vip' | ''>('staff')
const faceSearchKw = ref('')
/** 全量人脸 (页面加载拉一次) → userId→FaceRecord 映射 (表格列渲染) */
const allFaces = ref<FaceRecord[]>([])

const faceMapByUserId = computed(() => {
  const m = new Map<string, FaceRecord[]>()
  for (const rec of allFaces.value) {
    const uid = rec.metadata?.rbac_user_id
    if (!uid) continue
    const list = m.get(uid)
    if (list) list.push(rec)
    else m.set(uid, [rec])   // [UI-7 2026-09-10] 支持一人多脸 (首张作主脸, 列内 +N 提示)
  }
  return m
})

function faceOfUser(row: any): FaceRecord | undefined {
  return faceMapByUserId.value.get(String(row.id))?.[0]
}

function extraFaceCount(row: any): number {
  const list = faceMapByUserId.value.get(String(row.id))
  return list ? list.length - 1 : 0
}

function faceImgUrl(rec: FaceRecord): string {
  return rec.image_data || (rec.image_path ? '/api/v1' + rec.image_path : '')
}

async function fetchAllFaces() {
  try {
    const res = await faceApi.getRecords({ page: 1, page_size: 500 })
    allFaces.value = ((res.data as any)?.data?.records || []) as FaceRecord[]
  } catch { allFaces.value = [] }   // 人脸服务不可用静默 (列显示未关联)
}

async function fetchFaceRecords() {
  faceLoading.value = true
  try {
    const res = await faceApi.getRecords({
      group_type: faceGroupFilter.value || undefined,
      search: faceSearchKw.value || undefined,
      page: 1,
      page_size: 100,
    })
    faceRecords.value = ((res.data as any)?.data?.records || []) as FaceRecord[]
  } catch { faceRecords.value = [] } finally { faceLoading.value = false }
}

function openFaceDialog(row: any) {
  faceTargetUser.value = row
  faceDlgVisible.value = true
  fetchFaceRecords()
}

function isBoundToCurrent(rec: FaceRecord) {
  return rec.metadata?.rbac_user_id === String(faceTargetUser.value?.id ?? '')
}

function isBoundToOther(rec: FaceRecord) {
  const uid = rec.metadata?.rbac_user_id
  return !!uid && !isBoundToCurrent(rec)
}

async function bindFace(rec: FaceRecord) {
  if (!faceTargetUser.value) return
  // [UI-7 2026-09-10] 换绑确认: 该脸已绑其他用户时先确认
  const otherUid = rec.metadata?.rbac_user_id
  if (otherUid && otherUid !== String(faceTargetUser.value.id)) {
    try {
      await ElMessageBox.confirm(
        `该人脸已关联用户「${rec.metadata?.rbac_username || otherUid}」，确认换绑到当前用户？原关联将被清除。`,
        '换绑确认', { type: 'warning', confirmButtonText: '换绑', cancelButtonText: '取消' })
    } catch { return }
  }
  try {
    await faceApi.updateRecord(rec.person_id, {
      metadata: {
        ...(rec.metadata || {}),
        rbac_user_id: String(faceTargetUser.value.id),
        rbac_username: faceTargetUser.value.username,
      },
    })
    ElMessage.success(`已关联人脸「${rec.name}」`)
    faceDlgVisible.value = false
    await fetchAllFaces()
  } catch (e: any) {
    ElMessage.error('关联失败: ' + (e?.message || e))
  }
}

/** [UI-7 2026-09-10] 解绑: 清除该用户名下全部人脸绑定 (遍历写空 metadata) */
async function unbindUserFaces(row: any) {
  const list = faceMapByUserId.value.get(String(row.id))
  if (!list?.length) return
  const names = list.map(f => f.name).join('、')
  try {
    await ElMessageBox.confirm(
      `解除用户「${row.username}」与 ${list.length} 张人脸 (${names}) 的关联？`,
      '解除确认', { type: 'warning', confirmButtonText: '解除', cancelButtonText: '取消' })
  } catch { return }
  try {
    for (const f of list) {
      await faceApi.updateRecord(f.person_id, {
        metadata: { ...(f.metadata || {}), rbac_user_id: '', rbac_username: '' },
      })
    }
    ElMessage.success(`已解除 ${list.length} 张人脸的关联`)
    await fetchAllFaces()
  } catch (e: any) {
    ElMessage.error('解除失败: ' + (e?.message || e))
    await fetchAllFaces()   // 部分成功也对齐显示
  }
}

/** [UI-8 2026-09-10] 人脸库人员批量建档 (创建平台用户 + 自动绑定) */
const faceImportVisible = ref(false)
const faceImportLoading = ref(false)
const faceImporting = ref(false)
const faceImportPwd = ref('Abc@12345')
const faceImportProgress = ref('')
interface FaceImportRow { face: FaceRecord; username: string; note: string }
const faceImportRows = ref<FaceImportRow[]>([])
const faceImportSel = ref<FaceImportRow[]>([])

function openFaceImport() {
  faceImportVisible.value = true
  faceImportLoading.value = true
  faceImportProgress.value = ''
  // 全量人脸 → 导入行: 登录名预填姓名; 同名用户已存在/已绑定的行标注且不可选
  fetchAllFaces().then(() => {
    faceImportRows.value = allFaces.value.map(face => {
      const uid = face.metadata?.rbac_user_id
      const exists = users.value.some(u => u.username === face.name)
      const note = exists
        ? '同名用户已存在'
        : (uid ? `已绑定用户 ${face.metadata?.rbac_username || uid}` : '')
      return { face, username: face.name, note }
    })
    faceImportLoading.value = false
  })
}

async function runFaceImport() {
  const rows = faceImportSel.value.filter(r => !r.note)
  if (!rows.length) { ElMessage.warning('请先勾选待建档人员'); return }
  if (!faceImportPwd.value) { ElMessage.warning('请设置统一初始密码'); return }
  faceImporting.value = true
  let okCount = 0
  const failed: string[] = []
  for (const r of rows) {
    faceImportProgress.value = `导入中 ${okCount + failed.length + 1}/${rows.length}: ${r.face.name}`
    try {
      const res = await rbacApi.createUser({
        username: r.username,
        password: faceImportPwd.value,
        displayName: r.face.name,
      })
      const newId = (res.data as any)?.data?.id
      if (!newId) throw new Error('未返回用户 id')
      // 绑定: 写入人脸 metadata (与其他入口同一 SSOT)
      await faceApi.updateRecord(r.face.person_id, {
        metadata: {
          ...(r.face.metadata || {}),
          rbac_user_id: String(newId),
          rbac_username: r.username,
        },
      })
      r.note = '已建档'
      okCount++
    } catch (e: any) {
      r.note = '失败: ' + (e?.message || e)
      failed.push(r.face.name)
    }
  }
  faceImporting.value = false
  faceImportProgress.value = `完成: 成功 ${okCount}${failed.length ? `, 失败 ${failed.length} (${failed.join('、')})` : ''}`
  ElMessage.success(`已建档 ${okCount} 人并关联人脸${failed.length ? `，失败 ${failed.length}` : ''}`)
  await Promise.all([fetchUsers(), fetchAllFaces()])
}

/** 人员分类: 管理员 (admin/super_admin, 全平台权限) / 员工 (须挂载组织) */
function isUserAdmin(row: any): boolean {
  const roles: string[] = row.roleIds || row.roles || []
  return roles.includes('admin') || roles.includes('super_admin')
}

// ---- 表单 ----
// [UI-9 2026-09-10] 对标字段全集 (tagsArr 为标签数组视图, 提交时 join(','))
const ID_TYPE_LABELS: Record<string, string> = {
  id_card: '居民身份证', passport: '护照', officer: '军官证', driver: '驾驶证', other: '其他'
}
const TAG_PRESETS = ['VIP', '外包', '访客', '实习生', '夜班']

function emptyUserForm() {
  return {
    username: '',
    displayName: '',
    email: '',
    orgId: '',
    password: '',
    roleIds: [] as string[],
    status: 'active' as 'active' | 'disabled',
    phone: '', officePhone: '', employeeId: '', jobTitle: '',
    hireDate: '', leaveDate: '', birthday: '',
    gender: '' as 'male' | 'female' | '',
    idType: '', idNumber: '', address: '',
    emergencyContact: '', emergencyPhone: '',
    tagsArr: [] as string[], remark: '',
  }
}
const userForm = ref(emptyUserForm())

// 条件必填 (海康证件组范式 / 大华紧急联系人范式)
const validateIdType = (_r: any, v: string, cb: (e?: Error) => void) =>
  !v && userForm.value.idNumber ? cb(new Error('已填证件号码，请选择证件类型')) : cb()
const validateIdNumber = (_r: any, v: string, cb: (e?: Error) => void) => {
  const t = userForm.value.idType
  if (t && !v) return cb(new Error('已选证件类型，请填写证件号码'))
  if (t === 'id_card' && v && !/(^\d{15}$)|(^\d{17}[\dXx]$)/.test(v))
    return cb(new Error('身份证号格式不正确 (15/18 位)'))
  cb()
}
const validateEmergencyPhone = (_r: any, v: string, cb: (e?: Error) => void) =>
  userForm.value.emergencyContact && !v ? cb(new Error('已填紧急联系人，请填写联系电话')) : cb()

// [UI-9 FIX 2026-09-10] username 校验两处纠偏:
//   ① 后端 RbacService 对用户名无长度约束, 原 3-32 为前端自设过严 →
//      放宽 2-32 (人脸建档用户名即中文姓名, 2 字名是主流)
//   ② 编辑态 username disabled 不可改, 值来自库中存量 (可能 2 字) →
//      整段跳过校验, 否则编辑保存被红字卡死 (本次用户报障根因)
const userRules = computed<FormRules>(() => ({
  ...(isEditing.value ? {} : {
    username: [
      { required: true, message: '请输入用户名', trigger: 'blur' },
      { min: 2, max: 32, message: '用户名长度 2-32 个字符 (支持中文)', trigger: 'blur' }
    ]
  }),
  displayName: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  // [UI-9] 邮箱对标放宽为可选 (四厂均非必填), 仅保留格式校验
  email: [{ type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }],
  officePhone: [{ pattern: /^[\d\-+ ]{3,24}$/, message: '电话格式不正确', trigger: 'blur' }],
  idType: [{ validator: validateIdType, trigger: 'change' }],
  idNumber: [{ validator: validateIdNumber, trigger: 'blur' }],
  emergencyPhone: [{ validator: validateEmergencyPhone, trigger: 'blur' }],
  // [UI-9 FIX] 角色不强制: 人脸建档导入的员工无角色, 必填卡死编辑保存
  roleIds: []
}))

// ---- 过滤 (组织含子树 → orgId 集合过滤) ----
const selectedOrgName = computed(() => orgNameOf(selectedOrgId.value))

const filteredUsers = computed(() => {
  let list = users.value
  if (selectedOrgId.value) {
    const ids = new Set(orgSubtreeIds(selectedOrgId.value))
    list = list.filter((u: any) => ids.has(u.orgId || ''))
  }
  if (searchForm.value.username) {
    const kw = searchForm.value.username.toLowerCase()
    list = list.filter((u: any) => u.username.toLowerCase().includes(kw) || (u.displayName || u.name || '').includes(kw))
  }
  if (searchForm.value.status) {
    list = list.filter(u => u.status === searchForm.value.status)
  }
  return list
})

// ---- 生命周期 ----
onMounted(async () => {
  await Promise.all([fetchUsers(), fetchRoles(), fetchOrgUnits()])
  fetchAllFaces()   // [UI-5] 人脸映射 (不阻塞主数据)
})

async function fetchUsers() {
  loading.value = true
  try {
    const res = await rbacApi.getUsers()
    const items = ((res.data as any)?.data?.items || (res.data as any)?.data || []) as any[]
    // 后端 listAllUsers DTO (isActive/roles 名字数组/orgId) → 页面行模型 (status/roleIds)
    users.value = items.map((it: any) => ({
      ...it,
      roleIds: it.roleIds || it.roles || [],
      status: it.status || (it.isActive === false ? 'disabled' : 'active'),
    })) as any[]
  } catch (e: any) {
    ElMessage.error('获取用户列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function fetchRoles() {
  try {
    const res = await rbacApi.getRoles()
    allRoles.value = (res.data as any)?.data?.items || (res.data as any)?.data || []
  } catch (e: any) {
    ElMessage.error('获取角色列表失败: ' + e.message)
  }
}

function resetSearch() {
  searchForm.value = { username: '', status: '' }
}

// ---- CRUD ----
function openCreateDialog() {
  isEditing.value = false
  editingUserId.value = null
  dialogVisible.value = true
}

// [UI-9 FIX] 编辑时角色回显/同步链路:
//   listAllUsers 返回的 roles 是角色名, 而 select option value 是角色 id →
//   回显需名字→id 映射; PUT 白名单不含角色, 变更需 diff 后走 assign/remove 接口
const editingRoleIds = ref<string[]>([])
function roleNameToId(x: string): string {
  const hit = allRoles.value.find(r => r.name === x || String(r.id) === x)
  return hit ? String(hit.id) : ''
}

// [UI-9] 后端行模型 → 表单 (tags 逗号串 → 数组; 角色名 → id)
function openEditDialog(row: User) {
  isEditing.value = true
  editingUserId.value = String(row.id)
  const r = row as any
  const roleIds = [...new Set((r.roleIds || r.roles || []).map(roleNameToId).filter(Boolean))] as string[]
  editingRoleIds.value = [...roleIds]
  userForm.value = {
    ...emptyUserForm(),
    username: r.username,
    displayName: r.displayName || r.name || '',
    email: r.email || '',
    orgId: r.orgId || '',
    password: '',
    roleIds,
    status: row.status === 'locked' ? 'disabled' : row.status,
    phone: r.phone || '', officePhone: r.officePhone || '',
    employeeId: r.employeeId || '', jobTitle: r.jobTitle || '',
    hireDate: r.hireDate || '', leaveDate: r.leaveDate || '', birthday: r.birthday || '',
    gender: (r.gender || '') as 'male' | 'female' | '',
    idType: r.idType || '', idNumber: r.idNumber || '', address: r.address || '',
    emergencyContact: r.emergencyContact || '', emergencyPhone: r.emergencyPhone || '',
    tagsArr: (r.tags || '').split(',').map((s: string) => s.trim()).filter(Boolean),
    remark: r.remark || '',
  }
  dialogVisible.value = true
}

function resetForm() {
  userForm.value = emptyUserForm()
  formRef.value?.resetFields()
}

/** [UI-9] 表单 → API 载荷 (tagsArr → 逗号串; 空串也传以支持清空) */
function profilePayload() {
  const f = userForm.value
  return {
    phone: f.phone, officePhone: f.officePhone,
    employeeId: f.employeeId, jobTitle: f.jobTitle,
    hireDate: f.hireDate, leaveDate: f.leaveDate, birthday: f.birthday,
    gender: f.gender,
    idType: f.idType, idNumber: f.idNumber, address: f.address,
    emergencyContact: f.emergencyContact, emergencyPhone: f.emergencyPhone,
    tags: f.tagsArr.join(','), remark: f.remark,
  }
}

async function submitForm() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEditing.value && editingUserId.value) {
      // [UI-9 FIX] 角色同步: PUT /users/:id 白名单不含角色;
      //   diff 后增 (POST /rbac/users/:id/roles 只增) / 删 (DELETE .../roles/:roleId)
      const targetIds = [...new Set(userForm.value.roleIds)]
      const added = targetIds.filter(id => !editingRoleIds.value.includes(id))
      const removed = editingRoleIds.value.filter(id => !targetIds.includes(id))
      for (const rid of added) await rbacApi.assignRoles(editingUserId.value, [rid])
      for (const rid of removed) await rbacApi.removeUserRole(editingUserId.value, rid)
      // 更新走 PUT /users/:id 白名单 (displayName/email/orgId/isActive + UI-9 档案字段);
      // 密码非空另走 reset-password (rbacApi.updateUser 内部分派)
      await rbacApi.updateUser(editingUserId.value, {
        displayName: userForm.value.displayName,
        email: userForm.value.email,
        orgId: userForm.value.orgId,
        isActive: userForm.value.status === 'active',
        ...profilePayload(),
        ...(userForm.value.password ? { password: userForm.value.password } : {}),
      })
      ElMessage.success('用户更新成功')
    } else {
      await rbacApi.createUser({
        username: userForm.value.username,
        password: userForm.value.password || undefined,
        displayName: userForm.value.displayName,
        email: userForm.value.email,
        orgId: userForm.value.orgId || undefined,
        roleIds: userForm.value.roleIds,
        ...profilePayload(),
      })
      ElMessage.success('用户创建成功')
    }
    dialogVisible.value = false
    await fetchUsers()
  } catch (e: any) {
    ElMessage.error('操作失败: ' + (e?.message || e))
  } finally {
    submitting.value = false
  }
}

async function toggleUserStatus(row: User) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active'
  try {
    await rbacApi.updateUser(String(row.id), { isActive: newStatus === 'active' })
    ;(row as any).status = newStatus
    ElMessage.success(`用户已${newStatus === 'active' ? '启用' : '禁用'}`)
  } catch (e: any) {
    ElMessage.error('操作失败: ' + (e?.message || e))
  }
}

async function handleDelete(userId: string) {
  try {
    await rbacApi.deleteUser(userId)
    ElMessage.success('用户已删除')
    await fetchUsers()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e?.message || e))
  }
}

// ---- [UI-9] 详情抽屉 ----
const detailVisible = ref(false)
const detailUser = ref<any>(null)
function openDetail(row: any) {
  detailUser.value = row
  detailVisible.value = true
}
function genderLabel(g?: string): string {
  return g === 'male' ? '男' : g === 'female' ? '女' : '未知'
}
function idDesc(u: any): string {
  if (!u.idType && !u.idNumber) return '—'
  const t = ID_TYPE_LABELS[u.idType] || u.idType || '证件'
  return `${t} ${u.idNumber || ''}`.trim()
}
function detailTags(u: any): string[] {
  return (u.tags || '').split(',').map((s: string) => s.trim()).filter(Boolean)
}

// ---- 工具函数 ----
function getRoleName(roleId: string): string {
  // [UI-9 FIX] 兼容 id (number/string) 与角色名三种形态 (listAllUsers 角色列返回名字)
  const role = allRoles.value.find(r => String(r.id) === roleId || r.name === roleId)
  return role?.name || roleId
}

function roleTagType(roleId: string): 'danger' | 'warning' | 'success' | 'info' {
  const map: Record<string, string> = {
    super_admin: 'danger',
    admin: 'warning',
    operator: 'success',
    viewer: 'info'
  }
  return (map[getRoleName(roleId)] || 'info') as any
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: '正常',
    disabled: '禁用',
    locked: '锁定'
  }
  return map[status] || status
}

function statusTagType(status: string): 'success' | 'danger' | 'warning' {
  const map: Record<string, string> = {
    active: 'success',
    disabled: 'danger',
    locked: 'warning'
  }
  return (map[status] || 'info') as any
}

function formatTime(time: string): string {
  if (!time) return '—'
  // 后端 createdAt/updatedAt 为秒级 Unix 时间戳, dayjs 需毫秒
  const n = Number(time)
  return dayjs(Number.isFinite(n) && n > 0 && n < 1e12 ? n * 1000 : time).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.user-management { height: 100%; display: flex; flex-direction: column; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
/* ── 左右布局: 左组织树 / 右人员 ── */
.um-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
.um-org-panel { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; }
.um-org-panel :deep(.el-card__body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.um-org-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.um-org-title { font-size: 14px; font-weight: 600; }
.um-org-tree { flex: 1; min-height: 0; overflow: auto; }
.um-org-node { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; padding: 2px 4px; border-radius: 6px; }
.um-org-node.is-active { background: var(--el-color-primary-light-9); }
.um-org-icon { font-size: 14px; color: var(--el-color-primary); flex-shrink: 0; }
.um-org-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-org-node.is-active .um-org-name { font-weight: 600; }
.um-org-count { font-size: 11px; color: var(--el-text-color-secondary); margin-left: auto; }
.um-org-actions { display: none; align-items: center; margin-left: auto; flex-shrink: 0; }
.um-org-node:hover .um-org-actions { display: inline-flex; }
.um-org-node:hover .um-org-count { display: none; }
.um-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }
.um-main .search-bar { margin-bottom: 16px; }
.um-main .search-bar :deep(.el-form-item) { margin-bottom: 0; }
.um-org-filter-hint {
  display: inline-flex; align-items: center; gap: 8px;
  margin-bottom: 10px; padding: 4px 12px;
  background: var(--el-color-primary-light-9); border-radius: 6px;
  font-size: 12px; color: var(--el-color-primary);
}
/* [UI-5] 人员类型/关联人脸 */
.org-missing { color: var(--el-color-warning); font-size: 12px; cursor: help; }
.face-cell { display: flex; align-items: center; gap: 6px; }
.face-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.face-extra { flex-shrink: 0; }
.face-cell .el-avatar { flex-shrink: 0; }
/* [UI-9] 表单分组标题 / 详情抽屉 */
.uf-group-title {
  font-size: 13px; font-weight: 600; color: var(--el-text-color-primary);
  margin: 4px 0 14px; padding-left: 8px;
  border-left: 3px solid var(--el-color-primary); line-height: 1.2;
}
.uf-group-title:not(:first-child) { margin-top: 20px; }
.ud-body { padding: 0 4px; }
.ud-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.ud-head-name { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.ud-head-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.ud-group-title {
  font-size: 13px; font-weight: 600; color: var(--el-text-color-primary);
  margin: 18px 0 8px; padding-left: 8px;
  border-left: 3px solid var(--el-color-primary); line-height: 1.2;
}
/* [UI-8] 人脸建档对话框 */
.fi-pwd-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.fi-pwd-label { font-size: 12px; color: var(--el-text-color-regular); flex-shrink: 0; }
.fi-note { font-size: 12px; color: var(--el-color-warning); }
.fi-ready { font-size: 12px; color: var(--el-text-color-placeholder); }
.fi-progress { font-size: 12px; color: var(--el-text-color-secondary); margin-right: auto; }
.face-none { color: var(--el-text-color-placeholder); font-size: 12px; }
.face-picker-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.face-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px; min-height: 200px; max-height: 420px; overflow: auto;
}
.face-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 6px; border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px; cursor: pointer; position: relative;
}
.face-item:hover { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.face-item.is-bound-current { border-color: var(--el-color-success); }
.face-item.is-bound-other { opacity: 0.55; }
.face-item-name { font-size: 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.face-item-group { font-size: 11px; color: var(--el-text-color-secondary); }
.face-item-tag { position: absolute; top: 4px; right: 4px; font-size: 10px; color: var(--el-color-success); }
.face-item-tag--other { color: var(--el-color-info); }
.face-footer-hint { float: left; font-size: 12px; color: var(--el-text-color-secondary); line-height: 32px; }
/* 平板 1024 适配 */
@media (max-width: 1024px) {
  .um-body { flex-direction: column; }
  .um-org-panel { width: 100%; }
  .um-org-tree { max-height: 220px; }
}
</style>
