# C 端机器人多语言回复 — 知识库按语种检索注入设计

- 日期:2026-07-28
- 状态:已通过设计评审,待写实现计划
- 范围:aiCompanion C 端机器人

## 1. 背景与目标

C 端机器人需要支持海外玩家:根据玩家当前消息的语种,回复对应语种;并让注入 LLM 的知识库内容按语种划分。

### 现状结论(探索得到)

项目已有相当完善的 locale 基础设施:

- 数据层:`kb_entry_locales` 表(migration 007)按 `(entry_id, locale)` 存多语种内容,支持 zh-CN/en-US/zh-TW/ja-JP/ko-KR。`kbEntryLocales.js` 服务齐全(load/pick/extract/merge),ingestWorker 写入、kb.js 管理后台读取都已接入。
- 语种检测:`chatService.js:526 detectUserLocale(message)` 按字符范围判定(日文假名→ja-JP、韩文→ko-KR、中文→zh-CN、拉丁→en-US、默认 zh-CN)。
- 回复约束:`localePolicy`(`chatService.js:3756`)注入 system prompt 顶部;`getLocaleAnswerInstruction`(`chatService.js:536`)给出"只回复某语种、不混入其他语言"的硬性指令。
- 回复裁剪:`postProcessAssistantReply` 调 `pruneReplyLocaleNoise`(`chatService.js:3025`)按 preferredLocale 裁掉其他语种片段。

### 最大缺口

RAG 检索链路不感知语种。`ragContext.retrieve`(`ragContext.js:1005`)只读 `knowledge_entries.content` 单一原文,内部完全没有调用 `kbEntryLocales.loadLocalesByEntryIds` / `pickEntryContentByLocale`。注入 prompt 的 `contextBlock` 是未按语种筛选的原文。

**结论**:语种处理在"回复裁剪/指令注入"层都跑通了,唯独"检索→注入"这一环没有按语种取内容。这是本次要补的缺口。

## 2. 关键决策(已与用户确认)

| 决策点 | 选择 |
|--------|------|
| 语种来源 | 自动识别(后端 `detectUserLocale` 分析消息字符),不引入前端显式选择 |
| 会话中途切换 | 每条独立跟随当前消息语种,不跨会话记忆 |
| 无翻译降级 | 任一原文 + LLM 翻译(优先取玩家语种翻译,无则取原文,由 `localePolicy` 让 LLM 翻译) |
| 目标语种范围 | 现有五种:zh-CN/en-US/zh-TW/ja-JP/ko-KR,不扩展欧洲语种 |
| 现状数据 | 知识库主要单语(中文为主),多语翻译内容后续补充,本次只建机制 |

## 3. 方案选择(已与用户确认)

采用**方案 A:最小侵入——仅改 RAG 注入层**。

在 `ragContext` 检索命中后、注入 prompt 前,按 `preferredLocale` 调 `pickEntryContentByLocale` 取对应语种 content;没有翻译则取原文,由现有 `localePolicy`/`getLocaleAnswerInstruction` 让 LLM 翻译。

**不选方案 B(检索阶段也语种化)**:现状知识库主要单语,用玩家语种 query 检索中文知识未必召回更准,产出比低。

**不选方案 C(全链路 + 前端透传 + 约束文档)**:用户明确拒绝前端显式选语种(YAGNI);约束文档多语言章节收尾单独走 robot-constraints-updater skill,不绑本次改动。

## 4. 设计

### 4.1 语种识别与传递

- **来源**:玩家当前消息,由现有 `detectUserLocale(message)` 判定。每条独立,不跨会话。
- **传递**:`handleChat`(`chatService.js:4687`)内 `preferredLocale = detectUserLocale(query)` 已在多处取值。本次新增一处传递:`handleChat` 调 `ragContext.retrieve` 处(`chatService.js:4868-4873`)把 `preferredLocale` 作为第四参传入。
- **签名变更**:
  ```js
  // ragContext.js:1005 改前
  async function retrieve(versionId, query, topK = 5) { ... }
  // 改后
  async function retrieve(versionId, query, topK = 5, preferredLocale = null) { ... }
  ```
  - `preferredLocale = null` 时保持旧行为(取 `knowledge_entries.content` 原文),向后兼容、回归面最小。
  - 现有所有 `retrieve` 调用点若不传第四参,行为不变。
- **不改**:`detectUserLocale` 判定逻辑;不引入会话记忆/前端字段。如将来要扩展(显式 locale、会话语种),从这个签名加参数即可,接口已留好。

### 4.2 核心改造:检索→注入链路

现状链路(`ragContext.js:1005-1088`):

```
retrieve(versionId, query, topK)
  → embedding.embedBatch([query])
  → vectorStore.search
  → lexicalSearch
  → titleAnchorSearch
  → loadEntryRecords            ← 只读 knowledge_entries.content 单一原文(缺口)
  → loadNeighborhoodRecords     ← 同上
  → loadImagesByEntry
  → buildRefsFromRecords
  → rerankRefsByIntent / filterRelevantRefs
  → sortRefsAroundTitleAnchor / slice(topK)
  → 返回 refs
// 调用方:toContextBlock(refs) 拼文本块注入 prompt
```

**改造原则**:不动检索召回阶段(向量/词法/标题锚点仍按原始 query 检索),只改"命中后取内容"这一步。

**改造点**:在 `retrieve` 内部、`loadEntryRecords` 拿到原始 records 之后、`buildRefsFromRecords` 之前,新增语种内容覆盖逻辑(抽成独立函数 `applyLocaleOverride`):

```js
// 伪代码
async function applyLocaleOverride(records, preferredLocale) {
  if (!preferredLocale) return records;
  try {
    const entryIds = records.map(r => r.entryId).filter(Boolean);
    if (entryIds.length === 0) return records;
    const localesMap = await kbEntryLocales.loadLocalesByEntryIds(entryIds);
    for (const r of records) {
      const picked = kbEntryLocales.pickEntryContentByLocale(
        localesMap.get(r.entryId) || [],
        preferredLocale,
        r.content
      );
      if (picked) {
        r.content = picked;
        r.localeUsed = preferredLocale;
      }
    }
  } catch (err) {
    // 覆盖失败回退原文,不阻断检索
    return records;
  }
  return records;
}
```

**关键依赖(均现成,不新写)**:

- `kbEntryLocales.loadLocalesByEntryIds(entryIds)`(`kbEntryLocales.js`)按 entryId 批量取多语种列表。
- `kbEntryLocales.pickEntryContentByLocale(list, locale, fallbackContent)` 按 locale 取对应 content;无翻译则返回 `fallbackContent`(即 `r.content` 原文)。实现"任一原文+LLM翻译"。

**邻域上下文 `loadNeighborhoodRecords`**:同样调一次 `applyLocaleOverride` 覆盖,否则邻域片段会注入原文语种,与命中片段语种不一致。

**`toContextBlock`(`ragContext.js:1058-1088`)不改**:它只拼 ref 的 `snippet`/`matchText`,改造后这些字段已是玩家语种内容(或原文),下游全透明。

**回复阶段(`chatService.js`)不改**:`getDirectKnowledgeReply`/`getExpandedKnowledgeReply` 等已接收 `preferredLocale` 并做语种过滤/润色;`postProcessAssistantReply` 调 `pruneReplyLocaleNoise` 裁掉其他语种片段。均已就绪。

### 4.3 失败兜底

- `preferredLocale` 为 null/空:走原逻辑,取 `knowledge_entries.content`。
- `kbEntryLocales.loadLocalesByEntryIds` 抛错或返回空:`applyLocaleOverride` 内 catch,回退 `r.content` 原文,不阻断检索(知识库内容注入比语种准确更重要)。
- 某 entry 在 `kb_entry_locales` 没有该语种:`pickEntryContentByLocale` 内置回退到 `fallbackContent`,无需特判。

## 5. 测试策略

### 层 1:语种覆盖单元测试(新增)

**文件**:`server/test/ragContext.localeOverride.test.js`

测 `applyLocaleOverride(records, preferredLocale)`(若抽成独立函数则直接 export 测;若耦合深则通过 retrieve 入口 mock 测)。断言:

- 传 `preferredLocale='ja-JP'` 且 entry 有日语翻译 → `r.content` 变日语内容,`r.localeUsed === 'ja-JP'`。
- 传 `preferredLocale='ja-JP'` 但 entry 无日语翻译 → `r.content` 保持原文(回退),`r.localeUsed` 标记回退(实现时定)。
- 不传 `preferredLocale`(null) → 行为等同改前,`r.content` 不变(向后兼容)。
- `loadLocalesByEntryIds` 抛错 → catch 回退原文,检索不中断。

倾向抽成独立函数——更好测、更符合"为隔离与清晰而设计"。

### 层 2:retrieve 集成测试(新增)

**文件**:`server/test/ragContext.localeE2E.test.js`

mock embedding/vectorStore,用轻量 fixture 的 `kb_entry_locales` 数据。断言:

- 日语 query + 有日语翻译的知识 → 返回 refs 的 snippet/matchText 是日语内容。
- 日语 query + 无日语翻译的知识 → 返回 refs 的 snippet/matchText 是原文(中文),交给下游 LLM 翻译。
- 同一 query 传不同 `preferredLocale` → refs 内容按语种变化(有翻译时)。

### 层 3:回归(不改,跑现有)

`ragContext.test.js`、`chatService.localeFilter.test.js`、`kbEntryLocales.test.js` 全绿即说明没破坏既有 locale 子系统和检索流程。

### 测试边界

- 不测 LLM 实际回复语种——那是 `getLocaleAnswerInstruction`/`pruneReplyLocaleNoise` 的职责,已由 `chatService.localeFilter.test.js` 覆盖,且依赖外部 LLM。
- 不测 `detectUserLocale` 判定准确性——逻辑不动,不在本次范围。
- 不测前端——前端不改。

## 6. 落地步骤与文件清单

### 改动文件

| 文件 | 类型 | 改动 |
|------|------|------|
| `server/src/services/ragContext.js` | 核心 | `require kbEntryLocales`;`retrieve` 签名加 `preferredLocale`;新增 `applyLocaleOverride` 在 `loadEntryRecords`/`loadNeighborhoodRecords` 之后调用 |
| `server/src/services/chatService.js` | 调用点 | `handleChat` 调 `ragContext.retrieve` 处把现有 `preferredLocale` 作为第四参传入 |
| `server/test/ragContext.localeOverride.test.js` | 新增 | 层 1 单元测试 |
| `server/test/ragContext.localeE2E.test.js` | 新增 | 层 2 集成测试 |

### 实施步骤

1. 抽函数:`ragContext.js` 把语种覆盖逻辑抽成 `applyLocaleOverride`,独立 `module.exports`,catch 异常回退原文。
2. 接链路:`retrieve` 签名加 `preferredLocale = null`;在 `loadEntryRecords` 和 `loadNeighborhoodRecords` 之后各调一次 `applyLocaleOverride`。null 时跳过。
3. 传参数:`chatService.js` 的 `handleChat` 在 `ragContext.retrieve(versionId, resolvedKnowledgeQuery, ...)` 处补传 `preferredLocale`(同一作用域已有)。
4. 写层 1 测试:`ragContext.localeOverride.test.js`,mock `loadLocalesByEntryIds` 测 4 场景。
5. 写层 2 测试:`ragContext.localeE2E.test.js`,mock embedding/vectorStore 端到端测。
6. 回归:跑 `ragContext.test.js`、`chatService.localeFilter.test.js`、`kbEntryLocales.test.js` 全绿。

## 7. 明确不在本次范围

- 前端加 locale 字段/语言选择器(用户选自动识别)。
- `detectUserLocale` 改造、会话语种记忆(用户选每条独立跟随)。
- 扩展欧洲/其它语种(用户选现有五种)。
- `c-end-robot-constraints.md` 多语言章节(收尾单独跑 robot-constraints-updater skill)。
- 知识库翻译内容补充(用户明确"主要单语,后续补",本次只建机制)。

## 8. 风险与验收

- **风险**:`retrieve` 是检索主链路,改它可能影响所有版本的所有对话。
- **缓解**:`preferredLocale=null` 保持旧行为;`applyLocaleOverride` 异常回退原文;覆盖失败不阻断检索;回归测试兜底。
- **验收**:日语消息 + 有日语翻译的知识 → 注入的是日语内容(测试断言);日语消息 + 无翻译 → 注入中文原文,LLM 回日语(实际回复观察)。
