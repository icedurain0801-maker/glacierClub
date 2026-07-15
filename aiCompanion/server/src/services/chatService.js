// 编排:查/建 session → 存 user → RAG → 拼 prompt → LLM → 存 assistant。
// LLM 失败时回滚 user message,避免留孤儿。
const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');
const ragContext = require('./ragContext');

// 通用指令:与 bot persona 无关,任何人设遇到"介绍某个英雄"类问题都按此协议输出卡片数据。
// 前端(chat.js)按同样的 ```herocard``` 代码块协议解析渲染,解析失败时原样展示文本兜底。
const HERO_CARD_INSTRUCTION = `

如果玩家询问某个具体英雄的详细介绍(如"介绍一下XX""XX是谁""XX技能是什么"),请在你的自然语言回答之后,额外附加一个 herocard 代码块,格式如下(字段必须是合法 JSON,不要加多余说明文字):
\`\`\`herocard
{"name":"英雄名称","faction":"阵营名称","rarity":5,"skills":[{"name":"技能中文名","enName":"技能英文名"}],"quote":"英雄台词","avatarUrl":""}
\`\`\`
其中 rarity 为 1-5 的整数星级,avatarUrl 若不知道具体图片地址就留空字符串。如果问题不是询问某个具体英雄,则不要输出这个代码块。`;

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

// 拼 prompt:system + 历史 + 本次 user。超过 maxPromptBytes 就先砍历史，
// 若 system(persona+contextBlock) 本身就超预算，截断 contextBlock。
function buildMessages(bot, history, userMessage, contextBlock) {
  const budget = cfg.llm.maxPromptBytes;
  const persona = bot.persona + HERO_CARD_INSTRUCTION;
  const personaBytes = Buffer.byteLength(persona, 'utf8');
  const userBytes = Buffer.byteLength(userMessage, 'utf8');
  // 给 system 留的最大空间 = 总预算 - user消息 - 一点余量(200 字节给结构开销)
  const systemBudget = Math.max(200, budget - userBytes - 200);
  let systemContent = persona + contextBlock;
  if (Buffer.byteLength(systemContent, 'utf8') > systemBudget) {
    // 保留 persona 完整，截断 contextBlock 尾部
    const remaining = Math.max(0, systemBudget - personaBytes);
    systemContent = persona + Buffer.from(contextBlock, 'utf8').slice(0, remaining).toString('utf8');
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
    // RAG(ragContext.retrieve 内部已 try/catch，失败返回 [])
    let refs = [];
    let contextBlock = '';
    if (bot.rag_enabled) {
      refs = await ragContext.retrieve(versionId, message, bot.rag_top_k);
      contextBlock = ragContext.toContextBlock(refs);
    }

    const messages = buildMessages(bot, history, message, contextBlock);

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
