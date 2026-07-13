// embedding 云 API 封装：默认 fetch 调用；测试可替换 impl 为假实现（确定性伪向量）。
const cfg = require('../config/kb');

// 默认实现：调云 API（OpenAI 兼容格式：请求 input 为字符串数组，响应 data[].embedding）。
// 兼容通义 DashScope 原生响应（output.embeddings）作为回退，换厂商一般只需改 .env。
async function realEmbedBatch(texts) {
  const { apiUrl, apiKey, model, dim, retries, retryBaseMs } = cfg.embedding;
  if (!apiKey) throw new Error('EMBEDDING_API_KEY 未配置');

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`embedding API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      // OpenAI 兼容：data.data = [{embedding:[...], index:0}, ...]
      if (data && Array.isArray(data.data)) {
        return data.data
          .slice()
          .sort((a, b) => a.index - b.index)
          .map(e => e.embedding);
      }
      // 回退：通义 DashScope 原生结构 output.embeddings = [{embedding:[...], text_index:0}, ...]
      const arr = ((data && data.output && data.output.embeddings) || []).sort((a, b) => a.text_index - b.text_index);
      return arr.map(e => e.embedding);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, retryBaseMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// 当前生效的实现（可替换）
let impl = realEmbedBatch;

async function embedBatch(texts) { return impl(texts); }

// 测试注入：传 null 恢复真实实现
function _setImpl(fn) { impl = fn || realEmbedBatch; }

module.exports = { embedBatch, _setImpl };
