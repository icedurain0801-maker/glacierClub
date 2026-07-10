// LLM chat completion 云 API 封装(默认走 OpenAI 兼容协议,如通义 dashscope 兼容模式)。
// 结构仿 embedding.js:默认实现 realChat + 可替换 impl + 重试。
const cfg = require('../config/kb');

// 默认实现:调云 API,消息数组格式 [{role, content}, ...]
async function realChat(messages, opts = {}) {
  const { apiUrl, apiKey, model, retries, retryBaseMs } = cfg.llm;
  if (!apiKey) throw new Error('LLM_API_KEY 未配置');

  const body = {
    model: opts.model || model,
    messages,
  };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      // OpenAI 兼容结构:choices[0].message.content
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('LLM 返回格式异常');
      return { content };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, retryBaseMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// 当前生效的实现（可替换）
let impl = realChat;

async function chat(messages, opts) { return impl(messages, opts); }

// 测试注入：传 null 恢复真实实现
function _setImpl(fn) { impl = fn || realChat; }

module.exports = { chat, _setImpl };
