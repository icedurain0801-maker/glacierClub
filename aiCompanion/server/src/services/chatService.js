// 编排:查/建 session → 存 user → RAG → 拼 prompt → LLM → 存 assistant。
// LLM 失败时回滚 user message,避免留孤儿。
const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');
const ragContext = require('./ragContext');

// 拿或建 bot 配置(不存在返回默认值,让 C 端 chat 能跑起来即使 B 端未配置)
async function getBot(versionId) {
  const [rows] = await db.query('SELECT * FROM bots WHERE version_id=?', [versionId]);
  if (rows.length > 0) return rows[0];
  return {
    persona: '你是一个热情耐心的游戏陪玩助手。',
    welcome: '你好,我是你的游戏陪玩助手,有什么想聊的?',
    rag_enabled: 1,
    rag_top_k: 5,
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

// 拼 prompt:system + 历史 + 本次 user。超过 maxPromptBytes 就砍老历史。
function buildMessages(bot, history, userMessage, contextBlock) {
  const systemContent = bot.persona + contextBlock;
  const messages = [{ role: 'system', content: systemContent }];
  for (const m of history) messages.push({ role: m.role, content: m.content });
  messages.push({ role: 'user', content: userMessage });

  const totalBytes = () => messages.reduce((s, m) => s + Buffer.byteLength(m.content, 'utf8'), 0);
  while (totalBytes() > cfg.llm.maxPromptBytes && messages.length > 2) {
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

// 主流程:一次对话
async function handleChat({ versionId, sessionKey, message }) {
  const bot = await getBot(versionId);
  const { id: sessionId } = await findOrCreateSession(versionId, sessionKey, message);

  // 存 user message
  const userMsgId = await saveMessage(versionId, sessionId, 'user', message, null);

  try {
    // RAG(失败退化为空 refs,不抛)
    let refs = [];
    let contextBlock = '';
    if (bot.rag_enabled) {
      refs = await ragContext.retrieve(versionId, message, bot.rag_top_k);
      contextBlock = ragContext.toContextBlock(refs);
    }

    // 历史(N 轮 = 2N 条 user+assistant;我们直接按条数取,简单)
    const history = await loadHistory(sessionId, bot.history_turns * 2);
    // 历史最后一条就是我们刚存的 user message,要排除
    const historyExcludingCurrent = history.filter(m => !(m.role === 'user' && m.content === message)).slice(-bot.history_turns * 2 + 1);

    const messages = buildMessages(bot, historyExcludingCurrent, message, contextBlock);

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
