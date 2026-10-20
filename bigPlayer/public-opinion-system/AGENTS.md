---
last_updated: 2026-10-10
status: confirmed
scope: project
owner: 待确认
---

# AGENTS.md

## 项目简介

Public Opinion System 是独立的社区舆情分析系统。使用 Node.js >=20、原生 JavaScript 和 MySQL/MariaDB，分离 HTTP API 与采集/分析 Worker。后台静态页面位于相邻的 bigPlayer/admin/PublicOpinion，现役本机前端由独立 3001 服务向 4320 API 代理。

## 快速导航

| 你想做什么 | 去哪里看 |
|---|---|
| 了解项目入口 | README.md、server/src/app.js、worker/src/worker.js |
| 了解架构 | docs/architecture.md |
| 了解配置 | .env.example（不读取或回显生产凭据） |
| 了解测试 | server/test、worker/test、.tests/ |
| 了解部署 | scripts/windows-services/README.md |
| 了解文档规范 | 继承仓库根 AGENTS.md；本项目 docs 结构见下文 |

## 硬性规则

### 安全红线

| 编号 | 规则 | 原因 |
|---|---|---|
| S1 | 不提交密钥、Token、连接串、证书等敏感信息 | 防止泄露 |
| S2 | 不在日志或测试产物打印敏感数据 | 防止泄露 |
| S3 | 不绕过鉴权、权限校验、审计或采集准入 | 保持安全边界 |
| S4 | 自测使用模拟接口或隔离数据；真实写库、认证、采集另行说明影响 | 避免业务副作用 |

### 架构规则

1. server 提供配置、查询和鉴权接口；worker 承担采集与分析；shared 承载共享契约。
2. 不依赖 aiCompanion/server 的代码、数据库或业务表，业务表使用 po_ 前缀。
3. 工作区代码与现役 ProgramData release 分开核对，不能把本地测试通过当作外网已修复。

### 编码规则

- 钉钉自动推送及故障修复后的补推，只允许按北京时间内容发布时间属于今天或昨天的内容；昨天的内容必须在卡片标题、正文明确标注“补推”和原发布日期。不得因修复重新扫描而补发前天及更早的历史积压；继续遵守既有发送回执去重。

1. 保持现有原生 JavaScript 和模块风格，不重构无关代码。
2. 草稿创建与已有来源编辑分开；无真实 sourceId 时禁止已有来源接口请求。
3. 修改后执行最小必要隔离测试、语法及空白检查；真实浏览器验证结果单独说明。

## 常用命令

| 场景 | 命令 |
|---|---|
| 安装依赖 | `npm install` |
| 构建 | 无统一构建命令；运行包由 scripts/windows-services/build-*-release.ps1 构建 |
| 测试 | `npm test` 是全量入口；本任务优先只运行隔离来源测试 |
| 本地运行 | `npm run start:server`、`npm run start:worker`；现役服务运行时不重复启动 |
| 格式化/检查 | `node --check <file>`、`git diff --check -- <paths>` |

## 项目目录结构

```text
server/                   HTTP API、连接器、数据访问与测试
worker/                   采集、分析和调度与测试
shared/                   共享契约
migrations/               数据库迁移
scripts/windows-services/ 版本化运行包和常驻服务工具
docs/                     架构、接口、生产检查、历史设计
.Codex/docs/              按日期归档变更文档
.tests/                   按日期归档自测脚本与结果
../admin/PublicOpinion/   舆情后台静态页面
```

## docs 目录规范

现有 docs/architecture.md、docs/api.md、docs/production-checklist.md 与 docs/superpowers/ 保持原位；变更文档继续采用 .Codex/docs/yyyy-MM/yyyy-MM-dd/，测试采用 .tests/yyyy-MM/yyyy-MM-dd/。临时工件放仓库根 .temp/。后续是否引入 architecture/conventions/design/plans/reference 五层结构待确认，本次不迁移已有文档。

## 待确认信息

| 问题 | 当前判断 | 需要你确认 |
|---|---|---|
| 项目名称、用途、技术栈 | 独立社区舆情系统，Node.js + MySQL/MariaDB | 是否正确 |
| 构建、测试、运行命令 | 以 package.json 与服务脚本为依据 | 是否补充 |
| 安全和架构边界 | 独立数据库、API/Worker 分离、隔离自测 | 是否补充 |
| 根目录配置 | 本文件仅为补充草案 | 是否允许写入项目 AGENTS.md |

本会话仅执行用户直接安排的任务，负责开发和自测；不接受其他会话派单。
