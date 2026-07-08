# community-tools 接入 Glacier BaaS + 发布上线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「大玩家社区工具台」的 AI 排查从明文硬编码 key 改为走 Glacier BaaS SDK（懒登录 SSO + `app.ai.chat`），并将页面改名为 `index.html` 以便发布到 `https://chat.q1.com/apps/clubtools/`。

**Architecture:** 单个静态 HTML，无框架。改动集中在 `<head>` 引入 SDK 与页面 `<script>` 顶部初始化，重写 `callAI()` 内部实现（签名不变，`diagnose()` 调用点不动），删除 `AI_CONFIG` 明文 key。UI/表单/样式/文案零改动。发布用 Glacier BaaS 静态托管：zip 上传 + 审批，脚本交用户本地执行（部署 token 不进仓库）。

**Tech Stack:** Vanilla JS、Glacier BaaS SDK（`https://chat.q1.com/baas/glacier-baas-sdk.js`）、curl 部署。

**已知值：** appKey=`pk_e784f4a682534f7493ad4a767f8ce2b1`，appname=`clubtools`，AI 模型=`claude-sonnet-4-5-20251001`。部署 token 待托管开通后下发（`<token>` 占位）。

---

## File Structure

- `operations/communityTools/community-tools.html` → **git 改名** `operations/communityTools/index.html`（唯一产物文件，源码=发布产物）
- `operations/communityTools/deploy.sh` → **新建**，一键打包+上传脚本（占位 token，用户本地执行）
- `.claude/docs/2026-07/2026-07-08/v001_changelog.md` → **新建**，变更文档（项目规范，简洁一行）

> 无自动化测试框架（vanilla HTML）。验证方式：抽取 `<script>` 内容用 `node --check` 校验 JS 语法 + 浏览器人工回归。

---

### Task 1: 重命名文件为 index.html

**Files:**
- Rename: `operations/communityTools/community-tools.html` → `operations/communityTools/index.html`

- [ ] **Step 1: git 改名**

```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage"
git mv operations/communityTools/community-tools.html operations/communityTools/index.html
```

- [ ] **Step 2: 确认改名成功**

Run: `ls operations/communityTools/`
Expected: 出现 `index.html`，不再有 `community-tools.html`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: community-tools.html 改名为 index.html（发布产物需 index.html）"
```

---

### Task 2: 引入 SDK 并初始化 app

**Files:**
- Modify: `operations/communityTools/index.html`（`<head>` 内 `<title>` 之后加 script 标签；页面 `<script>` 顶部 `const pages=...` 之前加 init）

- [ ] **Step 1: 在 `<head>` 引入 SDK**

在 `<title>大玩家社区工具台</title>` 之后、`<link rel="icon"...>` 之前插入一行：

```html
<script src="https://chat.q1.com/baas/glacier-baas-sdk.js"></script>
```

- [ ] **Step 2: 在页面脚本顶部初始化 app**

找到页面末尾 `<script>` 块第一行 `const pages = ['home','link','diagnose'];`，在它**之前**插入：

```js
// ── Glacier BaaS 初始化（AI 能力走 SDK，计费走登录用户）──────────────
const app = GlacierBaaS.init({
  appKey: 'pk_e784f4a682534f7493ad4a767f8ce2b1',
  baseUrl: 'https://chat.q1.com/baas',
  aiModel: 'claude-sonnet-4-5-20251001',   // 保持原模型
});
```

- [ ] **Step 3: 验证 JS 语法**

Run:
```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage/operations/communityTools"
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(require('os').tmpdir()+'/ct-check.js',m);" && node --check "$TMPDIR/ct-check.js" && echo "JS OK"
```
Expected: `JS OK`（`GlacierBaaS` 是外部全局，`node --check` 只查语法不查引用，通过）

- [ ] **Step 4: Commit**

```bash
git add operations/communityTools/index.html
git commit -m "feat: 引入 Glacier BaaS SDK 并初始化 app（appKey/baseUrl/aiModel）"
```

---

### Task 3: 删除明文 AI_CONFIG，重写 callAI 走 app.ai.chat

**Files:**
- Modify: `operations/communityTools/index.html`（约第 451-477 行：`AI_CONFIG` + 旧 `callAI`）

- [ ] **Step 1: 删除 AI_CONFIG 与旧 callAI，替换为新实现**

将这一整段（从注释 `// ── AI 配置...` 到旧 `callAI` 函数结束的 `}`）：

```js
// ── AI 配置（填入你的 API Key 和接口地址）──────────────────────
const AI_CONFIG = {
  apiKey: 'sk-c3e4d8f1680e0ca386c1ca0ef1ea45643bcaa33d',
  baseUrl: 'https://chat-test.q1.com/v1',
  model: 'claude-sonnet-4-5-20251001',
};

async function callAI(systemPrompt, userPrompt) {
  const res = await fetch(AI_CONFIG.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AI_CONFIG.apiKey,
    },
    body: JSON.stringify({
      model: AI_CONFIG.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error('API 请求失败：' + res.status + ' ' + res.statusText);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}
```

替换为：

```js
// ── AI 调用：走 Glacier BaaS SDK（懒登录 SSO，计费走当前用户）──────────
async function ensureLogin() {
  if (app.auth.currentUser()) return;
  await app.auth.sso();   // 复用冰川登录；未登录/异域会抛错，由 diagnose 的 catch 处理
}

async function callAI(systemPrompt, userPrompt) {
  await ensureLogin();
  const reply = await app.ai.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    { max_tokens: 1024 }   // 模型已在 init 的 aiModel 指定
  );
  return String(reply).trim();
}
```

- [ ] **Step 2: 确认明文 key 已彻底消失**

Run:
```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage/operations/communityTools"
grep -c "sk-c3e4d8f1680e0ca386c1ca0ef1ea45643bcaa33d\|AI_CONFIG\|chat-test.q1.com/v1" index.html
```
Expected: `0`

- [ ] **Step 3: 验证 JS 语法**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(require('os').tmpdir()+'/ct-check.js',m);" && node --check "$TMPDIR/ct-check.js" && echo "JS OK"
```
Expected: `JS OK`

- [ ] **Step 4: Commit**

```bash
git add operations/communityTools/index.html
git commit -m "feat: callAI 改走 app.ai.chat + 懒登录 SSO，删除明文 apiKey"
```

---

### Task 4: 增强 diagnose 的登录/同域失败提示

**Files:**
- Modify: `operations/communityTools/index.html`（`diagnose()` 函数末尾的 `catch (err)` 块，约第 1065-1073 行）

- [ ] **Step 1: 在 catch 块内区分登录类错误**

找到 `diagnose()` 里的 catch 块：

```js
  } catch (err) {
    clearInterval(timer);
    progress.classList.remove('visible');
    progressBar.style.width = '0%';
    document.getElementById('diagnose-output').innerHTML =
      '<div class="ai-result-item" style="border-color:#fca5a5;background:#fff5f5">'
      + '<div class="ai-result-title"><div class="dot red"></div>AI 调用失败</div>'
      + '<div class="ai-result-body">' + err.message + '<br><small>请检查 AI_CONFIG 中的 apiKey / baseUrl / model 是否正确。</small></div>'
      + '</div>';
  } finally {
```

替换为（区分 need_login / SSO 失败，并去掉过时的 AI_CONFIG 提示）：

```js
  } catch (err) {
    clearInterval(timer);
    progress.classList.remove('visible');
    progressBar.style.width = '0%';
    var isLoginErr = (err && (err.code === 'need_login')) || /login|sso|登录|401|403/i.test(err && err.message || '');
    var hint = isLoginErr
      ? '需先登录冰川账号才能使用 AI 排查。若在本地 file:// 打开则 AI 不可用，请通过 <b>https://chat.q1.com/apps/clubtools/</b> 访问后再试。'
      : 'AI 调用异常，请稍后重试；若持续失败请联系平台产品。';
    document.getElementById('diagnose-output').innerHTML =
      '<div class="ai-result-item" style="border-color:#fca5a5;background:#fff5f5">'
      + '<div class="ai-result-title"><div class="dot red"></div>' + (isLoginErr ? '需要登录' : 'AI 调用失败') + '</div>'
      + '<div class="ai-result-body">' + (err && err.message ? err.message + '<br>' : '') + '<small>' + hint + '</small></div>'
      + '</div>';
  } finally {
```

- [ ] **Step 2: 验证 JS 语法**

Run:
```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage/operations/communityTools"
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');fs.writeFileSync(require('os').tmpdir()+'/ct-check.js',m);" && node --check "$TMPDIR/ct-check.js" && echo "JS OK"
```
Expected: `JS OK`

- [ ] **Step 3: 确认无残留 AI_CONFIG 文案**

Run: `grep -c "AI_CONFIG" operations/communityTools/index.html`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add operations/communityTools/index.html
git commit -m "feat: diagnose 失败提示区分登录/同域场景，移除过时 AI_CONFIG 文案"
```

---

### Task 5: 新建发布脚本 deploy.sh

**Files:**
- Create: `operations/communityTools/deploy.sh`

- [ ] **Step 1: 写发布脚本**

```bash
#!/usr/bin/env bash
# 大玩家社区工具台 —— 发布到 https://chat.q1.com/apps/clubtools/
# 用法：DEPLOY_TOKEN=你的部署token bash deploy.sh
# 说明：zip 根目录须含 index.html；上传后经主管/管理员钉钉或签审批后 live。
set -euo pipefail

APPNAME="clubtools"
BAAS="https://chat.q1.com/baas"
cd "$(dirname "$0")"

if [ -z "${DEPLOY_TOKEN:-}" ]; then
  echo "错误：请先设置部署 token —— DEPLOY_TOKEN=xxx bash deploy.sh" >&2
  exit 1
fi

rm -f app.zip
zip -j app.zip index.html
echo "已打包 app.zip，开始上传到 $APPNAME ..."
curl -fsS -H "X-Deploy-Token: $DEPLOY_TOKEN" -F file=@app.zip \
  "$BAAS/v1/hosting/$APPNAME/versions"
echo
echo "上传完成。等待审批通过后访问：https://chat.q1.com/apps/$APPNAME/"
rm -f app.zip
```

> `zip -j`（junk paths）确保 index.html 在 zip 根目录。token 只从环境变量读，不写进脚本/仓库。

- [ ] **Step 2: 确认脚本语法正确**

Run: `bash -n operations/communityTools/deploy.sh && echo "SH OK"`
Expected: `SH OK`

- [ ] **Step 3: Commit**

```bash
git add operations/communityTools/deploy.sh
git commit -m "chore: 新增 clubtools 发布脚本 deploy.sh（token 走环境变量）"
```

---

### Task 6: 写变更文档

**Files:**
- Create: `.claude/docs/2026-07/2026-07-08/v001_changelog.md`

- [ ] **Step 1: 建目录并写 changelog（简洁一行风格）**

```bash
mkdir -p ".claude/docs/2026-07/2026-07-08"
```

写入 `.claude/docs/2026-07/2026-07-08/v001_changelog.md`：

```markdown
# v001 变更文档（2026-07-08）

- community-tools 接入 Glacier BaaS：AI 排查改走 `app.ai.chat` + 懒登录 SSO，删除明文 apiKey；页面改名 `index.html`，新增 `deploy.sh` 发布到 `chat.q1.com/apps/clubtools/`。
```

- [ ] **Step 2: Commit**

```bash
git add ".claude/docs/2026-07/2026-07-08/v001_changelog.md"
git commit -m "docs: v001 changelog —— community-tools 接入 Glacier BaaS"
```

---

## 人工验证清单（改完后在浏览器执行，非自动化）

发布到 `chat.q1.com/apps/clubtools/` 后（同域，AI 可用）：
- [ ] 链接生成器：不登录直接生成链接正常（回归，未受影响）
- [ ] 点「开始排查」：触发冰川 SSO 登录，登录后 AI 正常返回四模块结果
- [ ] 排查结果解析正常（总结论/必填参数核查/Token与环境/建议 四卡片）

本地 `file://` 打开：
- [ ] 链接生成器仍可用
- [ ] 「开始排查」给出「需要登录 / 请通过 chat.q1.com/apps/clubtools/ 访问」提示，不报错崩溃

发布：
- [ ] `DEPLOY_TOKEN=xxx bash operations/communityTools/deploy.sh` 上传成功，审批后 live

---

## Self-Review

- **Spec coverage**：Part 1（引入 SDK=Task2 / 删明文+重写 callAI=Task3 / 懒登录=Task3 ensureLogin / 失败提示=Task4）；Part 2（改名 index.html=Task1 / 发布脚本=Task5）；变更文档=Task6。全覆盖。
- **Placeholder scan**：无 TODO/TBD；`<token>` 是刻意占位（token 不进仓库）。
- **Type consistency**：`app.auth.currentUser()` / `app.auth.sso()` / `app.ai.chat(messages,{max_tokens})` 均与 SDK d.ts 一致；`callAI(systemPrompt,userPrompt)` 签名保持不变，`diagnose()` 调用点无需改。
