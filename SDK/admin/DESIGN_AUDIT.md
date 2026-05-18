# SDK 管理后台设计规范检查报告

完成日期：2026-05-14  
检查版本：v1.0  
参考样本：`sdkSchemeManagement.html`（工作台页面）

---

## 检查范围

schemeManagement 目录下的所有页面：
- ✅ `sdkSchemeManagement.html` - 工作台（规范样本）
- ✅ `schemeList.html` - 方案列表
- ✅ `configList.html` - 配置列表
- ✅ `configCreate.html` - 配置新增
- ✅ `specialScheme.html` - 特殊方案

---

## 检查项目与修复结果

### 1. 基准字体大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 16px | 14px | ✅ 已修复 |
| 其他页面 | 14px | 14px | ✅ 已符合 |

**说明**：统一所有页面基准字体为 14px

---

### 2. 主标题（H1）字体大小

| 页面 | 修改前 | 修改后 | 用途 |
|------|--------|--------|------|
| configCreate.html | 20px | 16px | 页面顶栏标题 |
| 其他页面 | 16px | 16px | ✅ 已符合 |

**说明**：H1 标题统一为 16px, 700 weight

---

### 3. 卡片/面板标题（H2）

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 14px | 15px | ✅ 已修复 |
| 其他页面 | 15px | 15px | ✅ 已符合 |

**说明**：卡片标题统一为 15px, 700 weight

---

### 4. 表单标签字体大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 14px | 13px | ✅ 已修复 |
| 其他页面 | 13px | 13px | ✅ 已符合 |

**说明**：表单标签统一为 13px, 600 weight

---

### 5. 标签与徽章

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 12px | 13px | ✅ 已修复（卡片小标题） |
| 其他页面 | 11-12px | 11-12px | ✅ 已符合 |

**说明**：保持原有标签和徽章大小（11px-12px）

---

### 6. 按钮字体大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 14px | 13px | ✅ 已修复 |
| 其他页面 | 13px | 13px | ✅ 已符合 |

**说明**：按钮文字统一为 13px, 600 weight

---

### 7. 卡片圆角（Border Radius）

| 页面 | 主要组件 | 修改前 | 修改后 | 状态 |
|------|----------|--------|--------|------|
| configCreate.html | 卡片 | 8px | 14px | ✅ 已修复 |
| configList.html | 过滤面板 | 8px | 14px | ✅ 已修复 |
| configList.html | 表格容器 | 8px | 14px | ✅ 已修复 |
| schemeList.html | 统计栏 | 12px | 14px | ✅ 已修复 |
| schemeList.html | 分类标签 | 12px | 14px | ✅ 已修复 |
| schemeList.html | 过滤器 | 8px | 14px | ✅ 已修复 |
| schemeList.html | 分组 | 12px | 14px | ✅ 已修复 |
| schemeList.html | 可折叠栏 | 12px | 14px | ✅ 已修复 |
| specialScheme.html | 方案卡片 | 8px | 14px | ✅ 已修复 |
| specialScheme.html | 可折叠分组 | 8px | 14px | ✅ 已修复 |

**说明**：所有主要容器组件统一为 14px 圆角

---

### 8. 内容区内边距（Content Padding）

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 24px（各向） | 32px 36px 36px | ✅ 已修复 |
| configList.html | 18px 20px | 32px 36px 36px | ✅ 已修复 |
| schemeList.html | 24px 36px 36px | 32px 36px 36px | ✅ 已修复 |
| specialScheme.html | 18px 20px | 32px 36px 36px | ✅ 已修复 |
| sdkSchemeManagement.html | 32px 36px 36px | 32px 36px 36px | ✅ 已符合 |

**说明**：内容区内边距统一为 `32px 36px 36px`（竖 横 底）

---

### 9. 模块间距（Gap）

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | — | 24px | ✅ 已符合 |
| configList.html | 14px | 24px | ✅ 已修复 |
| schemeList.html | 18px | 24px | ✅ 已修复 |
| specialScheme.html | 14px | 24px | ✅ 已修复 |
| sdkSchemeManagement.html | 24px | 24px | ✅ 已符合 |

**说明**：主要模块间距统一为 24px

---

### 10. 卡片内边距

| 页面 | 组件 | 修改前 | 修改后 | 状态 |
|------|------|--------|--------|------|
| configCreate.html | 卡片 | 18px | 24px | ✅ 已修复 |
| configCreate.html | 完整卡片 | 18px | 24px | ✅ 已修复 |
| configList.html | 过滤面板 | 14px 16px | 20px 24px | ✅ 已修复 |
| schemeList.html | 统计栏 | 18px 24px | 24px | ✅ 已修复 |
| schemeList.html | 过滤器 | 14px 16px | 20px 24px | ✅ 已修复 |
| schemeList.html | 可折叠栏 | 14px 24px | 16px 24px | ✅ 已修复 |
| specialScheme.html | 方案卡片 | 18px | 24px | ✅ 已修复 |

**说明**：主要卡片内边距统一为 24px

---

### 11. 侧边栏导航项字体大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 15px | 13.5px | ✅ 已修复 |
| 其他页面 | 13.5px | 13.5px | ✅ 已符合 |

**说明**：侧边栏导航项统一为 13.5px

---

### 12. 选项卡（Tab）字体大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 14px | 12.5px | ✅ 已修复 |
| configList.html | 12.5px | 12.5px | ✅ 已符合 |
| 其他页面 | 12.5px | 12.5px | ✅ 已符合 |

**说明**：标签栏选项卡统一为 12.5px

---

### 13. 警告框文字大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 14px | 12.5px | ✅ 已修复 |
| 其他页面 | 12px | 12.5px | ✅ 已符合 |

**说明**：警告框文字统一为 12.5px

---

### 14. 操作按钮（+添加）文字大小

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 14px | 12.5px | ✅ 已修复 |

**说明**：操作按钮文字统一为 12.5px, 600 weight

---

### 15. CSS 变量完整性

| 页面 | 修改前 | 修改后 | 状态 |
|------|--------|--------|------|
| configCreate.html | 缺少功能色 | 补全所有变量 | ✅ 已修复 |
| 其他页面 | 完整 | 完整 | ✅ 已符合 |

**添加的变量**：
- `--green: #059669`
- `--green-bg: #ecfdf5`
- `--amber: #d97706`
- `--amber-bg: #fffbeb`
- `--red: #dc2626`
- `--red-bg: #fef2f2`
- `--topbar-h: 60px`
- `--shadow-sm: 0 1px 2px rgba(15,23,42,.04)`

---

## 规范检查清单

所有页面已通过以下检查：

- [x] 基准字体大小：14px
- [x] H1 标题（页面标题）：16px, 700
- [x] H2 标题（卡片标题）：15px, 700
- [x] 正文文字：14px, 400
- [x] 说明文字：12.5px, 400
- [x] 标签与徽章：11px-12px, 700
- [x] 主卡片圆角：14px
- [x] 按钮圆角：6px
- [x] 内容区内边距：32px 36px 36px
- [x] 模块间距：24px
- [x] 卡片内边距：24px
- [x] 色彩系统完整
- [x] 侧边栏一致性
- [x] 响应式结构

---

## 后续维护建议

1. **新增页面规范**：所有新增页面必须参考 `sdkSchemeManagement.html` 和本规范文档
2. **设计系统维护**：更新 DESIGN_SYSTEM.md 中的规范
3. **共享组件**：使用 `sidebar.js` 确保侧边栏一致
4. **样式审查**：定期审查是否有偏离规范的样式

---

## 文件清单

已修改的文件：
1. ✅ `/SDK/admin/DESIGN_SYSTEM.md` - 新增（设计规范文档）
2. ✅ `/SDK/admin/DESIGN_AUDIT.md` - 新增（本审查报告）
3. ✅ `/SDK/admin/sidebar.js` - 新增（通用侧边栏组件）
4. ✅ `/SDK/admin/schemeManagement/configCreate.html` - 已修复
5. ✅ `/SDK/admin/schemeManagement/configList.html` - 已修复
6. ✅ `/SDK/admin/schemeManagement/schemeList.html` - 已修复
7. ✅ `/SDK/admin/schemeManagement/specialScheme.html` - 已修复
8. ✅ `/SDK/admin/schemeManagement/sdkSchemeManagement.html` - 无需修改（样本）

---

## 总结

所有 schemeManagement 目录下的页面已完全符合 DESIGN_SYSTEM.md 规范。字体大小、圆角、内边距、色彩系统等设计要素已统一，确保了整个管理后台的视觉一致性。

