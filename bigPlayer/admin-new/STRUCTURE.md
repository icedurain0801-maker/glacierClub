# admin-new / club 后台结构说明

源：`C:\Users\Administrator\Downloads\club`（152 个文件，约 2.0 MB），原样复制到本目录下的 `club/`。**未修改任何源代码**。

---

## 一、技术栈

| 项 | 内容 |
|---|---|
| 框架 | React（hooks） |
| 语言 | TypeScript |
| 状态管理 | MobX + mobx-react（`inject` / `observer` / `useObserver`） |
| UI 库 | Ant Design 5.x + 自定义 `q1-antd`（`FilterBox`、`Q1Table`） |
| 样式 | Less |
| HTTP | Axios，封装于 `@/api/club*` |
| 构建 | Vite（推断） |
| 路由 | React Router（路由配置不在 club 目录内，需在 bigPlayer 项目层接入） |

---

## 二、15 个模块的页面清单

> 路径均相对于 `admin-new/club/`。Modal 指弹层组件，TableList 指列表组件。

### 1. appearance（装扮）
- 页面：`appearance/index.tsx`（List + Audit 双 Tab）
- Modals：`components/Create.tsx`、`components/Audit.tsx`
- 组件：`components/AppearanceInfoComp.tsx`

### 2. badge（徽章）
- 页面：
  - `badge/category/index.tsx`（分类页）
  - `badge/list/index.tsx`（徽章列表，含 Record / Audit 双 Tab）
- Modals：`category/Create.tsx`、`list/components/Create.tsx`、`list/components/Audit.tsx`
- 组件：`list/components/TableList.tsx`

### 3. banner（横幅）
- 页面：`banner/list/index.tsx`
- Modals：`components/Create.tsx`、`components/Audit.tsx`
- 组件：`components/TableList.tsx`

### 4. board（版块，最复杂）
- 页面：`board/list/index.tsx`
- 常量：`board/list/defaultVal.ts`（CATEGORY、RULE_ACTION 等）
- Create 弹层组：`list/components/Create/index.tsx` + `LanguageTabWrapper.tsx`（多语言 Tab）
- 5 种表单变体：
  - `BaseForm/`（公共字段 + `Sections.tsx`）
  - `AccountForm/`
  - `ImageForm/`
  - `RobotForm/`
  - `SystemForm/`
- Context：`board/context/boardCreateProvider.tsx`
- Hooks（被跨模块大量使用）：
  - `board/hooks/useClubBoardOptions.tsx`
  - `board/hooks/useClubUploadOption.tsx`
  - `board/hooks/usePostSelect.tsx`
  - `board/hooks/useUserSelect.tsx`

### 5. components（全局共享）
- `components/ClubLoaded.tsx`（MobX 加载态包装器，**唯一全局共享组件**）

### 6. content（内容管理，最庞大）
- 子模块页面：
  - `content/post/list.tsx`（帖子列表）
  - `content/post/vote.tsx`（投票/打分）
  - `content/comment/list.tsx`（评论）
  - `content/coordinator/list.tsx`（版主）
  - `content/recycleBin/list.tsx`（回收站）
- 各子模块下 `components/`：`TableList.tsx`、`Audit.tsx`、`ToTop.tsx` 等
- 模块内共享组件 `content/components/`：
  - `PostContent.tsx`、`PostDetail.tsx`、`PostEdit.tsx`
  - `PostLike.tsx`、`PostMark.tsx`、`PostRating.tsx`
  - `PostToTop.tsx`
  - `PostSectionMigrateForm.tsx`（移动帖子至版块）

### 7. creator（创作者）
- 页面：`creator/list.tsx`、`creator/task.tsx`
- Modals：`components/Create.tsx`、`components/Audit.tsx`
- 组件：`components/Sections.tsx`

### 8. emotions（表情）
- 页面：`emotions/index.tsx`
- Modals：`components/Create.tsx`、`components/Audit.tsx`
- 组件：`components/TableList.tsx`

### 9. encyclopedia（百科）
- 页面：`encyclopedia/list.tsx`
- Modals：`components/Create.tsx`、`components/Detail.tsx`、`components/Audit.tsx`
- 子页面：`components/ManageCyclopedia/index.tsx`
- 子模块：`components/CopyStrategy/index.tsx`（复制策略）
- 组件：`components/Sections.tsx`、`components/TableList.tsx`

### 10. log（日志）
- 页面：`log/report/index.tsx`
- Modals：`log/report/Audit.tsx`

### 11. lottery（抽奖）
- 页面：
  - `lottery/create.tsx`
  - `lottery/log.tsx`
  - `lottery/list/index.tsx`
- 子组件：`list/components/ActivityPrize.tsx`、`Audit.tsx`、`Provide.tsx`、`TableList.tsx`
- 工具：`lottery/utils/fixedPrizeI18n.ts`

### 12. push（推送）
- 页面：`push/message/index.tsx`、`push/message/create.tsx`
- Modals：`components/Audit.tsx`
- 组件：`components/TableList.tsx`、`CheckRoleTable.tsx`、`UserCheckForm.tsx`

### 13. statistics（统计）
- 页面：`statistics/index.tsx`

### 14. topic（话题）
- 页面：`topic/index.tsx`
- Modals：`components/Create.tsx`、`components/Audit.tsx`、`components/BatchImport.tsx`

### 15. user（用户，子模块最多）
- `user/list/`：用户列表 + `UserDetail` / `UserEdit` / `UserForbid` / `UserMuted` / `UserTag`；含批量操作模板 `template.xlsx`
- `user/aiMessage/`：AI 消息管理（`index.tsx` + `userMessage.tsx`）
- `user/aiQuality/`：内容质量审核（最复杂）
  - 入口 `index.tsx` + 共享 `context.ts`
  - 组件：`analysis.tsx`、`verifyList.tsx`
  - 三个 Modal：`ChatAuditDetailModal`、`ContentAuditBatchModal`、`ContentAuditDetailModal`
- `user/avatar/`：`AvatarAudit.tsx`、`AvatarList.tsx`
- `user/nickName/`：`Audit.tsx`、`TableList.tsx`
- `user/tag/`：标签统计 + `PieChart.tsx`
- `user/tagSetting/`：标签配置 + `create.tsx`
- `user/largeModelParameter/`：大模型参数

---

## 三、5 种架构模式

**Pattern A：简单 CRUD** — `index.tsx`（列表）+ `components/Create.tsx` + `Audit.tsx` + `TableList.tsx`
适用：banner、emotions、creator、topic、log、appearance

**Pattern B：多表单创建** — 一个 Create 容器下挂多种表单变体
适用：board（BaseForm / AccountForm / ImageForm / RobotForm / SystemForm）

**Pattern C：多 Tab 审核** — Record Tab + Audit Tab 共用同一页
适用：appearance、content/post、badge/list

**Pattern D：嵌套子模块** — 一个一级模块下有多个独立子页面
适用：content（post/comment/coordinator/recycleBin）、user（list/aiMessage/aiQuality/avatar/nickName/tag/tagSetting/largeModelParameter）

**Pattern E：模块级 hooks 库** — 把 hooks 集中到一个模块内被跨模块复用
适用：`board/hooks/*` 被 appearance、badge、content 等 8+ 模块引用

---

## 四、跨模块共享资源

| 类型 | 路径 | 备注 |
|---|---|---|
| 全局组件 | `components/ClubLoaded.tsx` | 唯一一个真正放在顶层 `components/` 的共享组件 |
| 共享 Hook | `board/hooks/useClubBoardOptions.tsx` | 被最多模块引用 |
| 共享 Hook | `board/hooks/useClubUploadOption.tsx` | 上传配置 |
| 共享 Hook | `board/hooks/usePostSelect.tsx` | 帖子选择器 |
| 共享 Hook | `board/hooks/useUserSelect.tsx` | 用户选择器 |
| 模块内共享 | `content/components/Post*.tsx` | 帖子相关展示/操作组件 |

---

## 五、外部依赖（import 路径别名）

源代码使用以下别名，**在 bigPlayer 项目层需配置 tsconfig + vite 才能解析**：

| 别名前缀 | 用途 | 示例 |
|---|---|---|
| `@/api/club` | club 主接口 | `getDressUpList`、`getBoardList`、`changeStatus` |
| `@/api/clubBadge` | 徽章接口 | `getBadgeList`、`removeBadge` |
| `@/api/configCenter` | 配置中心 | `getAppConfigCenterList` |
| `@/context` | 全局 MobX store | `useStore()` → `UIState` / `User` / `Club` |
| `@ts/club` | 类型定义 | 业务实体类型 |
| `@ts/clubBadge` | 徽章类型 | |
| `@ts/appearance` | 装扮类型（含 i18n） | |
| `@ts/enum/*` | 枚举集合 | |

---

## 六、后续接入清单

复制到 `admin-new/club/` 只完成了**搬运**，要让代码跑起来还需要：

1. **路由配置**：源目录里没有路由文件，需要在 bigPlayer 应用层添加路由表，把每个模块的入口页面挂到 URL 上
2. **路径别名解析**：`@/`、`@ts/` 需在 bigPlayer 的 `tsconfig.json` + Vite 配置中映射到正确目录
3. **API 实现**：`@/api/club*` 三个 API 模块需在 bigPlayer 内存在或新建
4. **MobX store**：`useStore()` 返回的 `UIState` / `User` / `Club` 需在 bigPlayer 全局 store 中已存在
5. **类型定义**：`@ts/*` 的类型文件需同步存在
6. **q1-antd**：自定义 UI 库需引入
7. **新旧 admin 关系**：决定 `admin/`（旧，按业务域拆分）与 `admin-new/club/`（新，按模块拆分）是共存还是逐步替换

---

## 七、文件统计

```
源（Downloads/club）: 152 个文件
目标（admin-new/club）: 152 个文件
关键文件抽样校验：
  ✓ board/list/components/Create/index.tsx
  ✓ user/aiQuality/index.tsx
  ✓ components/ClubLoaded.tsx
  ✓ user/list/template.xlsx
```
