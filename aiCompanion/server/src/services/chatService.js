// 编排:查/建 session → 存 user → RAG → 拼 prompt → LLM → 存 assistant。
// LLM 失败时回滚 user message,避免留孤儿。
const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');
const ragContext = require('./ragContext');
const kgContext = require('./kgContext');

// 拿或建 bot 配置(不存在返回默认值,让 C 端 chat 能跑起来即使 B 端未配置)
async function getBot(versionId) {
  const [rows] = await db.query('SELECT * FROM bots WHERE version_id=?', [versionId]);
  if (rows.length > 0) return rows[0];
  return {
    persona: '你是一个热情耐心的游戏陪玩助手。',
    welcome: '你好,我是你的游戏陪玩助手,有什么想聊的?',
    rag_enabled: 1,
    rag_top_k: 5,
    kg_enabled: 1,
    history_turns: 10,
    model: null,
  };
}

// 拿或建 session,返回 {id, isNew}
async function findOrCreateSession(versionId, sessionKey, firstMessage) {
  const [rows] = await db.query(
    'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
    [versionId, sessionKey]
  );
  if (rows.length > 0) return { id: rows[0].id, isNew: false };
  const title = String(firstMessage || '').slice(0, 30);
  try {
    const [ins] = await db.query(
      'INSERT INTO chat_sessions (version_id, session_key, title) VALUES (?,?,?)',
      [versionId, sessionKey, title]
    );
    return { id: ins.insertId, isNew: true };
  } catch (err) {
    // 并发插入导致 UNIQUE 冲突,重查一次
    if (err.code === 'ER_DUP_ENTRY') {
      const [again] = await db.query(
        'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
        [versionId, sessionKey]
      );
      return { id: again[0].id, isNew: false };
    }
    throw err;
  }
}

// 拿最近 N 条消息(按 id 升序返回)
async function loadHistory(sessionId, limit) {
  const [rows] = await db.query(
    'SELECT role, content FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT ?',
    [sessionId, limit]
  );
  return rows.reverse();
}

// 拼 prompt:system + 历史 + 本次 user。超过 maxPromptBytes 就先砍历史，
// 若 system 本身超预算，按优先级截断：persona 完整保留 > 图谱事实(factBlock) > 参考知识(contextBlock)。
// 理由：图谱事实是结构化高置信短文本，性价比高于 snippet；参考知识 topK 有冗余，先裁损失最小。
function buildMessages(bot, history, userMessage, contextBlock, factBlock = '') {
  const budget = cfg.llm.maxPromptBytes;
  const userBytes = Buffer.byteLength(userMessage, 'utf8');
  // 给 system 留的最大空间 = 总预算 - user消息 - 一点余量(200 字节给结构开销)
  const systemBudget = Math.max(200, budget - userBytes - 200);

  // 按优先级逐段装配 system：persona → factBlock → contextBlock，超出部分截尾
  const fitTail = (text, remaining) =>
    remaining <= 0 ? '' : Buffer.from(text, 'utf8').slice(0, remaining).toString('utf8');
  let systemContent = bot.persona;
  let used = Buffer.byteLength(systemContent, 'utf8');
  for (const block of [factBlock, contextBlock]) {
    if (!block) continue;
    const blockBytes = Buffer.byteLength(block, 'utf8');
    if (used + blockBytes <= systemBudget) {
      systemContent += block;
      used += blockBytes;
    } else {
      systemContent += fitTail(block, systemBudget - used);
      used = systemBudget;
      break;
    }
  }

  const messages = [{ role: 'system', content: systemContent }];
  for (const m of history) messages.push({ role: m.role, content: m.content });
  messages.push({ role: 'user', content: userMessage });

  const totalBytes = () => messages.reduce((s, m) => s + Buffer.byteLength(m.content, 'utf8'), 0);
  while (totalBytes() > budget && messages.length > 2) {
    // 保留 system(index 0)和最后一条 user,砍中间最老的
    messages.splice(1, 1);
  }
  return messages;
}

// 存消息,并把 session 的 message_count / updated_at 更新
async function saveMessage(versionId, sessionId, role, content, refs) {
  const [ins] = await db.query(
    'INSERT INTO chat_messages (version_id, session_id, role, content, refs_json) VALUES (?,?,?,?,?)',
    [versionId, sessionId, role, content, refs ? JSON.stringify(refs) : null]
  );
  await db.query(
    'UPDATE chat_sessions SET message_count = message_count + 1, updated_at = NOW() WHERE id=?',
    [sessionId]
  );
  return ins.insertId;
}

async function deleteMessage(messageId, sessionId) {
  await db.query('DELETE FROM chat_messages WHERE id=?', [messageId]);
  await db.query(
    'UPDATE chat_sessions SET message_count = GREATEST(message_count - 1, 0) WHERE id=?',
    [sessionId]
  );
}

// KG 检索:实体识别 → 一跳事实。失败退化为 [],不影响对话主流程。
async function retrieveFacts(versionId, message) {
  try {
    const linked = await kgContext.linkEntities(versionId, message);
    if (linked.length === 0) return [];
    return await kgContext.getFacts(versionId, linked.map(l => l.entityId));
  } catch (err) {
    console.error('[chatService] retrieveFacts failed:', err.message);
    return [];
  }
}

// 主流程:一次对话
async function handleChat({ versionId, sessionKey, message }) {
  const bot = await getBot(versionId);
  const { id: sessionId } = await findOrCreateSession(versionId, sessionKey, message);

  // 先加载历史,再存本次 user message。这样避免"从历史里排除刚存的自己"的脆弱逻辑。
  // 取 N 轮 = 2N 条消息（user+assistant 交替）
  const history = await loadHistory(sessionId, bot.history_turns * 2);

  // 现在再存 user message
  const userMsgId = await saveMessage(versionId, sessionId, 'user', message, null);

  try {
    // RAG 与 KG 并行(各自内部失败均退化为空,不影响对话)
    let refs = [];
    let contextBlock = '';
    let factBlock = '';
    const [ragRefs, facts] = await Promise.all([
      bot.rag_enabled ? ragContext.retrieve(versionId, message, bot.rag_top_k) : Promise.resolve([]),
      bot.kg_enabled ? retrieveFacts(versionId, message) : Promise.resolve([]),
    ]);
    if (ragRefs.length > 0) {
      refs = ragRefs;
      contextBlock = ragContext.toContextBlock(ragRefs);
    }
    if (facts.length > 0) {
      factBlock = kgContext.toFactBlock(facts);
      // refs 向后兼容扩展:旧元素 {entryId,score,snippet} 缺省视为 type:'entry',图谱事实带 type:'fact'
      refs = [...refs, ...facts];
    }

    const messages = buildMessages(bot, history, message, contextBlock, factBlock);

    // 调 LLM
    const { content: reply } = await llm.chat(messages, { model: bot.model || undefined });

    // 存 assistant
    await saveMessage(versionId, sessionId, 'assistant', reply, refs);

    return { reply, refs };
  } catch (err) {
    // LLM/其它失败 → 回滚 user message
    try { await deleteMessage(userMsgId, sessionId); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  handleChat, getBot, findOrCreateSession, loadHistory, saveMessage, deleteMessage, buildMessages,
};
