// RAG 上下文:用户查询 → embedding → vectorStore 余弦检索 → 拿条目详情 → 返回 refs 列表
const db = require('../config/db');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');

const SNIPPET_MAX = 200;   // C 端展示的 snippet 截取字数

// 检索。失败(embedding 报错等)则返回 [],由上层决定是否退化为无 RAG 对话。
async function retrieve(versionId, query, topK = 5) {
  try {
    const [qvec] = await embedding.embedBatch([query]);
    if (!qvec) return [];
    const hits = vectorStore.search(versionId, qvec, topK);
    if (hits.length === 0) return [];
    const ids = hits.map(h => h.entryId);
    const [rows] = await db.query(
      `SELECT id, content FROM knowledge_entries WHERE version_id=? AND id IN (${ids.map(() => '?').join(',')})`,
      [versionId, ...ids]
    );
    const byId = new Map(rows.map(r => [r.id, r.content]));
    return hits
      .filter(h => byId.has(h.entryId))
      .map(h => ({
        entryId: h.entryId,
        score: h.score,
        snippet: String(byId.get(h.entryId)).slice(0, SNIPPET_MAX),
      }));
  } catch (err) {
    console.error('[ragContext] retrieve failed:', err.message);
    return [];
  }
}

// 把 refs 拼成 prompt 里的「参考知识」文本块
function toContextBlock(refs) {
  if (!refs || refs.length === 0) return '';
  const items = refs.map((r, i) => `[${i + 1}] ${r.snippet}`).join('\n');
  return `\n\n以下是从知识库检索到的相关资料，若有相关内容请优先参考回答:\n${items}`;
}

module.exports = { retrieve, toContextBlock, SNIPPET_MAX };
