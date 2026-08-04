# v002 变更文档：C 端机器人主对话真多模态（能直接看图）

> 日期：2026-07-27
> 范围：aiCompanion/server

## 背景

之前 C 端机器人虽然能接收图片附件，但主对话 LLM 实际上**看不到图片像素**：附件只被「另起一次分析调用」转成文字概括塞进 system prompt，主对话回复仍只是基于这段文字的二手转述。遇到「这张图里的英雄叫什么名字」「图里这个数值对不对」这类必须直接看图的提问时，模型只能答「没看到图」。

本次改造目标：让主对话 LLM **直接以 image_url 形式收到缩图后的图片像素**，真正多模态回答。

## 改动概览

### 1. 新增 sharp 缩图能力（server/package.json + chatMediaService.js）

- 新增依赖 `sharp@0.35.3`，用于把原图缩成 ≤512px 的小图再 base64 内联。
- `chatMediaService.js` 新增 `readImageAsInlineDataUrl(filePath)`：
  - 用 sharp resize 到 `inlineImageMaxEdge`（默认 512），mozjpeg 质量 `inlineImageQuality`（默认 80）。
  - 若一次缩出来仍超 `inlineImageMaxBytes`（默认 200KB），逐档降质量再压（每次 q-=15，下限 40）。
  - 仍超限或解码失败返回空串（走文字 summary 兜底）。
- `analyzeUploadedMedia` 返回值新增 `inlineDataUrl` 字段：图片走 sharp 缩图；视频沿用预览帧（已是小图）。

### 2. 主对话真多模态（chatService.js）

- `buildMessages`：当传入 `options.imageUrl` 时，把 user message 改造成 OpenAI 兼容的多模态数组：
  ```js
  content: [
    { type: 'text', text: userMessage },
    { type: 'image_url', image_url: { url: imageUrl } },
  ]
  ```
- `totalBytes` 兼容数组 content：文本项按 utf8 算，image_url 项按 dataUrl 字符串算。
- `buildMediaContextBlock` 改为 `hasInlineImage` 感知：
  - 有内联图：提示「你已直接收到原图（以 image_url 形式附在用户消息里），可以描述图中文字、数值、布局等细节，不需要局限于上面的概括」。
  - 无内联图：保留原约束「不要假装看到了识别结果之外的细节」。
- `handleChat` 主 `buildMessages` 调用透传 `imageUrl: mediaContext?.inlineDataUrl || ''`。

### 3. 关键守卫：hasInlineImage 时跳过所有「提前 return 的兜底分支」（chatService.js）

主对话里有多条「无可靠知识时提前 return 短答/兜底」的分支，它们各自另起 LLM 调用、且都没带 image_url，会拦截图片提问。统一加 `!hasInlineImage &&` 守卫：

- `isPlanningOrUiNoiseQuery` 兜底（2 处，game / 非 game 域各一）
- `shouldBlockUngroundedGameFreeAnswer` 兜底
- `genericFollowupContext.subject` 兜底
- `shouldUseNoHitEntityFallback` 兜底
- `getHeroCardGroundedReply`（`heroCardResult` 计算处）—— 这是最隐蔽的一条，问「图里的英雄」时会被命中并绕开主 buildMessages。
- `shouldPreferLiteralKnowledgeDraft` 兜底
- `webSearchIntent` —— 有图问图时不应走联网搜索。

有内联图时，这些分支全部跳过，让请求落到主 `buildMessages` → 真 image_url 调用。

### 4. 网关发现与 visionModel 路由（config/kb.js + chatService.js + chatMediaService.js）

> 这是本次最关键的一处「网关行为」发现。

孤立测试确认：本网关（`chat-test.q1.com`）对 `claude-sonnet-4-6` / `claude-sonnet-5` 这类 Claude 模型会**静默剽除 image_url**——请求体里确实带了图（data URL 数万字符），但 `prompt_tokens` 只有 ~938（纯文本量），模型回复「没看到图」。而对 `gemini-3.6-flash` 则能正常解析 image_url（`prompt_tokens` 1080，能读出图里所有文字）。

应对：
- `config/kb.js` 新增 `llm.visionModel`（默认 `gemini-3.6-flash`，可经 `LLM_VISION_MODEL` 覆盖）。
- `chatService.js` 主 LLM 调用：`hasInlineImage` 时用 `visionModel`，否则沿用 `bot.model`。
- `chatMediaService.js` 附件分析调用：优先用 `visionModel`，回退 `mediaAnalysisModel`。

### 5. 损坏图软失败（chatMediaService.js）

`analyzeUploadedMedia` 之前若 LLM 附件分析调用抛错（如 400「Provided image is not valid」），整个对话会 500。现在包 try/catch：
- 失败时返回通用概括「附件内容无法解析（图片可能已损坏或不被模型支持）」+ `tags: ['附件解析失败']` + 空 `inlineDataUrl`。
- 主对话随后走文字兜底回复「没收到图片，可能上传时出了问题……」，不再崩溃。

## 新增 / 可调环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `CHAT_MEDIA_INLINE_IMAGE_MAX_EDGE` | `512` | 内联图最长边像素 |
| `CHAT_MEDIA_INLINE_IMAGE_QUALITY` | `80` | 内联 JPEG 初始质量 |
| `CHAT_MEDIA_INLINE_IMAGE_MAX_BYTES` | `200 * 1024` | 内联 dataUrl 字符上限，超限继续降质或放弃 |
| `LLM_VISION_MODEL` | `gemini-3.6-flash` | 真多模态用模型，必须能在本网关真正解析 image_url |

## 测试

### 单元测试
- `npm run test:chat-media`：3/3 过（`buildMediaContextBlock` / `buildMediaAugmentedQuery` / `buildMessages` 注入顺序）。
- `npm run test:followup`：18/18 过。

### 手测三场景（均 HTTP 200）
1. **正常图**（47KB PNG，含「莫妮卡 / 幸存者联盟 / 辅助治疗 / 5 星」文字）
   - 回复：「她叫**莫妮卡**，职业是辅助 / 治疗。属于幸存者联盟阵营，技能主打群体治疗、净化和护盾，偏后排支援型。」✅ 准确读出图中全部细节。
2. **大图**（9.74MB 噪声 PNG）
   - sharp 缩图到 62KB JPEG dataUrl → gemini 读出「莫妮卡 / 5 星辅助治疗」。✅ sharp 缩图链路验证。
3. **损坏图**（纯文本字节伪装 PNG）
   - 附件分析 LLM 报 400 → 软失败捕获 → `inlineDataUrl=空` → 主对话走文字兜底：「没收到图片，可能上传时出了问题……」✅ 不再 500。

## 受影响文件

- `server/package.json`（新增 sharp 依赖）
- `server/src/config/kb.js`（chatMedia 三项内联图配置 + llm.visionModel）
- `server/src/services/chatMediaService.js`（readImageAsInlineDataUrl + analyzeUploadedMedia 返回 inlineDataUrl + 软失败 + visionModel）
- `server/src/services/chatService.js`（buildMessages 多模态 + totalBytes 兼容数组 + handleChat 透传 imageUrl + 7 处 hasInlineImage 守卫 + buildMediaContextBlock 感知 + 主调用用 visionModel）
- `server/src/services/llm.js`（无功能改动，仅临时调试探针已全部移除）

## 注意事项

- `LLM_VISION_MODEL` **必须选本网关上能真正解析 image_url 的模型**。经测试 `gemini-3.6-flash` 可用，Claude 系列（`claude-sonnet-4-6`、`claude-sonnet-5`）在本网关会剽除 image_url。换网关或模型时需重测。
- 上传体积上限仍由 `CHAT_MEDIA_IMAGE_MAX_BYTES`（默认 10MB）把守；本次 45MB 图被 400 拒收是预期行为。
- 内联图体积受 `CHAT_MEDIA_INLINE_IMAGE_MAX_BYTES`（默认 200KB）约束，超出会继续降质或放弃内联走文字兜底。
