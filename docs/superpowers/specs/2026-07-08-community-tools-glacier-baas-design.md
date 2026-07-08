# community-tools 接入 Glacier BaaS + 发布上线 设计文档

日期：2026-07-08
文件：`operations/communityTools/community-tools.html` → 改名 `operations/communityTools/index.html`

## 背景 / 现状

`community-tools.html` 是单个静态 HTML「大玩家社区工具台」，含两个工具：

- **链接生成器**（`generateLink()`）— 纯规则引擎拼接 URL，**不调 AI，无需登录**
- **错误排查**（`diagnose()` → `callAI()`）— 调 AI 分析链接

当前 AI 调用问题：
- `AI_CONFIG` 里**明文硬编码 API key** `sk-c3e4d8f1680e0ca386c1ca0ef1ea45643bcaa33d`（约第 453 行）
- 直接 `fetch('https://chat-test.q1.com/v1/chat/completions')`，key 随前端泄露

## 目标

1. 去掉明文 apiKey，AI 改走 Glacier BaaS SDK（`app.ai.chat`），计费走登录用户额度
2. 懒登录门禁：仅在点「开始排查」调 AI 时才 `app.auth.sso()`；链接生成器不受影响、无需登录
3. 发布到 `https://chat.q1.com/apps/<appname>/`

## 非目标（YAGNI）

- 不做历史记录持久化（`app.collection`）
- 不改动链接生成器逻辑、不改任何 UI/样式/文案
- 不做全局登录门禁（用户明确选「懒登录」）

## Part 1 — 代码改造

改动集中在 `<head>` 与页面 `<script>`，**UI/表单/样式/文案不动**。

### 1.1 引入并初始化 SDK

`<head>` 内加（绝对地址，正式站）：
```html
<script src="https://chat.q1.com/baas/glacier-baas-sdk.js"></script>
```

页面脚本顶部初始化（全局单例）：
```js
const app = GlacierBaaS.init({
  appKey: 'pk_e784f4a682534f7493ad4a767f8ce2b1',   // 正式 appKey（用户已提供）
  baseUrl: 'https://chat.q1.com/baas',
});
```
> appKey 明文进前端是文档允许的（“公开可嵌前端”）。

### 1.2 删除旧的明文 key 与 fetch 实现

- 删除整个 `AI_CONFIG` 对象（含明文 `apiKey` / `baseUrl` / `model`）
- 删除旧 `callAI()` 里基于 `fetch(AI_CONFIG.baseUrl + '/chat/completions')` 的实现

### 1.3 重写 `callAI`（签名不变）

保持 `async function callAI(systemPrompt, userPrompt)` 签名不变，`diagnose()` 内部调用点无需改动：

```js
async function ensureLogin() {
  const me = app.auth.currentUser && app.auth.currentUser();
  if (!me) await app.auth.sso();     // 懒登录：复用冰川登录
}

async function callAI(systemPrompt, userPrompt) {
  await ensureLogin();
  const reply = await app.ai.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ]);
  return (typeof reply === 'string' ? reply : String(reply)).trim();
}
```
> `app.ai.chat` 返回回复文本（见 SDK 文档）；`diagnose()` 后续解析逻辑（`aiText.match(...)`）保持不变。

### 1.4 懒登录门禁 + 失败提示

`diagnose()` 内已有 `try/catch`。登录相关失败通过 `callAI` 抛出后落入现有 `catch`，需增强错误文案：

- 捕获到 `err.code === 'need_login'` 或 SSO 失败时，输出：
  「需先登录冰川账号才能使用 AI 排查；若在本地 `file://` 打开则 AI 不可用，请通过 `https://chat.q1.com/apps/clubtools/` 访问。」
- 其余错误沿用现有失败卡片展示 `err.message`。

### 1.5 关键约束（文档明确）

- **AI 能力要求页面与冰川同域**：发布到 `chat.q1.com/apps/` 后满足同域，AI 正常；本地 `file://` 或异域打开时 AI 不可用（`need_login`），失败提示已覆盖此情况。
- 链接生成器为纯前端规则，**任何环境都可用**，不受同域/登录限制。

## Part 2 — 发布上线

### 2.1 仓库产物

- `community-tools.html` **改名为 `index.html`**（zip 根目录须含 `index.html`；源码=发布产物，免复制步骤）
- 面包屑、favicon 不依赖文件名，改名安全

### 2.2 发布机制（Glacier BaaS 静态托管）

前置（一次性，控制台/管理员，**非本次代码任务**）：
1. 开通托管：登记 `appname`（决定地址 `chat.q1.com/apps/<appname>/`）
2. 下发部署 Token（`X-Deploy-Token`）

发版命令（写成脚本占位，**用户本地执行**，token 不进仓库）：
```bash
cd operations/communityTools
zip -r app.zip index.html
curl -H "X-Deploy-Token: <token>" -F file=@app.zip \
  https://chat.q1.com/baas/v1/hosting/clubtools/versions
```
3. 审批：每个版本经主管/管理员钉钉或签审批后 live
4. 访问：`https://chat.q1.com/apps/clubtools/`

### 2.3 安全边界

- appKey：明文进前端（文档允许）
- 部署 Token：**只在用户本地命令行使用，绝不写入任何文件/仓库**
- 分工：本任务只负责改好代码 + 提供发布脚本/命令；实际上传由用户执行

## 已知值 / 待用户提供的值

| 值 | 用途 | 状态 |
|---|---|---|
| `appKey` = `pk_e784f4a682534f7493ad4a767f8ce2b1` | 写进 `GlacierBaaS.init` | ✅ 已提供 |
| `appname` = `clubtools` | 发布地址 `chat.q1.com/apps/clubtools/` / 上传路径 | ✅ 已提供 |
| 部署 Token | 上传鉴权（用户本地用） | ⏳ 待开通托管后下发；`<token>` 占位，不进仓库 |

失败提示文案里的 `<appname>` 统一替换为 `clubtools`：
「…请通过 `https://chat.q1.com/apps/clubtools/` 访问。」

## 验证

- `node --check` 无法直接校验 HTML；用浏览器打开确认：
  - 链接生成器无需登录可正常生成（回归）
  - 「开始排查」触发 SSO 登录，登录后 AI 返回结果
  - `file://` 打开时排查给出「需登录/同域」提示、链接生成器仍可用
- 页面 `<script>` 语法可用「提取 JS 后 `node --check`」辅助验证

## 变更文档

完成后按项目规范在 `.claude/docs/2026-07/2026-07-08/` 下写 `vXXX_changelog.md`（简洁一行风格）。
