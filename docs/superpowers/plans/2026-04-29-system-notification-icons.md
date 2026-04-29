# 系统通知图标区分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替换 `#screen-system` 中所有通知行的图标容器，用统一的浅蓝（正面）/ 浅橙（负面）背景色 + 语义 emoji，让用户扫一眼即可区分好消息与警告。

**Architecture:** 纯 HTML 修改，只动 `notifications.html` 的 `#screen-system` 区块，不改任何布局、JS、或其他 screen。每条通知行的图标 `div` 从各自独立的彩色渐变替换为两种标准容器色，emoji 替换为语义图标。

**Tech Stack:** 原生 HTML/CSS，Tailwind CDN（已有），无新依赖。

---

## 文件范围

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `bigPlayer/client/home/notifications.html` 第 619–692 行 | 仅 `#screen-system` 内各通知行图标 div |

---

### Task 1: 替换「恭喜升级」图标（第 622 行）

**Files:**
- Modify: `bigPlayer/client/home/notifications.html:622`

当前代码（第 622 行）：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#ffd54f,#ffa000)">🎉</div>
```

- [ ] **Step 1: 替换图标 div**

将第 622 行改为：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb)">⬆️</div>
```

- [ ] **Step 2: 浏览器验证**

用浏览器打开 `bigPlayer/client/home/notifications.html`，点击「系统通知」入口，确认第一条「恭喜升级」显示浅蓝背景 + ⬆️，视觉正确。

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/home/notifications.html
git commit -m "fix(notifications): 升级通知换浅蓝容器+⬆️图标"
```

---

### Task 2: 替换「账号安全提醒」图标（第 637 行）

**Files:**
- Modify: `bigPlayer/client/home/notifications.html:637`

当前代码（第 637 行）：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#4dd0e1,#00897b)">🛡️</div>
```

账号安全提醒属于需要用户注意的警示，归为负面容器。

- [ ] **Step 1: 替换图标 div**

将第 637 行改为：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#fff3e0,#ffe0b2)">⚠️</div>
```

- [ ] **Step 2: 浏览器验证**

确认「账号安全提醒」显示浅橙背景 + ⚠️，与升级通知的浅蓝形成明显对比。

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/home/notifications.html
git commit -m "fix(notifications): 账号安全提醒换浅橙容器+⚠️图标"
```

---

### Task 3: 替换「帖子审核通过」图标（第 652 行）

**Files:**
- Modify: `bigPlayer/client/home/notifications.html:652`

当前代码（第 652 行）：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#7986cb,#3949ab)">📋</div>
```

- [ ] **Step 1: 替换图标 div**

将第 652 行改为：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb)">📋</div>
```

（emoji 不变，仅换容器色为浅蓝）

- [ ] **Step 2: 浏览器验证**

确认「帖子审核通过」显示浅蓝背景 + 📋。

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/home/notifications.html
git commit -m "fix(notifications): 帖子审核通过换浅蓝容器"
```

---

### Task 4: 替换「获得奖励」图标（第 666 行）

**Files:**
- Modify: `bigPlayer/client/home/notifications.html:666`

当前代码（第 666 行）：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#81c784,#388e3c)">💰</div>
```

- [ ] **Step 1: 替换图标 div**

将第 666 行改为：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb)">💰</div>
```

（emoji 不变，仅换容器色为浅蓝）

- [ ] **Step 2: 浏览器验证**

确认「获得奖励：积分 +50」显示浅蓝背景 + 💰。

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/home/notifications.html
git commit -m "fix(notifications): 获得奖励通知换浅蓝容器"
```

---

### Task 5: 替换「功能更新通知」图标（第 680 行）

**Files:**
- Modify: `bigPlayer/client/home/notifications.html:680`

当前代码（第 680 行）：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#ff8a80,#f44336)">📣</div>
```

- [ ] **Step 1: 替换图标 div**

将第 680 行改为：
```html
<div class="w-11 h-11 rounded-[13px] flex items-center justify-center text-xl flex-shrink-0" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb)">📣</div>
```

（emoji 不变，仅换容器色为浅蓝）

- [ ] **Step 2: 浏览器验证**

打开系统通知，完整浏览全部 5 条通知，确认：
- 升级⬆️、审核通过📋、获得奖励💰、功能更新📣 均为**浅蓝**背景
- 账号安全提醒⚠️ 为**浅橙**背景
- 整体视觉层级清晰，正负一目了然

- [ ] **Step 3: 写 changelog**

在 `.claude/docs/2026-04/2026-04-29/` 下创建：
```
v001_changelog.md
```
内容：
```markdown
系统通知图标统一：正面浅蓝容器，负面浅橙容器，语义 emoji 替换彩色渐变图标
```

- [ ] **Step 4: Commit**

```bash
git add bigPlayer/client/home/notifications.html .claude/docs/2026-04/2026-04-29/v001_changelog.md
git commit -m "fix(notifications): 功能更新通知换浅蓝容器，完成系统通知图标统一"
```
