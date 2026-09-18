const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

function textFromParts(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  return value.map(part => {
    if (typeof part === 'string') return part;
    return part && ['text', 'output_text'].includes(part.type) && typeof part.text === 'string' ? part.text : '';
  }).join('') || null;
}
function responseText(response, api) {
  const choice = response?.choices?.[0];
  if (choice?.message?.refusal) return null;
  const candidates = api === 'anthropic-messages' ? [response?.content] : [choice?.message?.content, choice?.text, response?.output_text, ...(Array.isArray(response?.output) ? response.output.filter(item => item?.type === 'message').map(item => item.content) : [])];
  for (const value of candidates) { const text = textFromParts(value); if (text) return text; }
  return null;
}

class AiTranslator {
  constructor(env = process.env, { reserveCall } = {}) {
    this.reserveCall = reserveCall;
    this.enabled = env.AI_TRANSLATION_ENABLED === 'true' || env.AI_TRANSLATION_ENABLED === '1';
    this.url = env.AI_TRANSLATION_URL || env.AI_ANALYSIS_URL || '';
    this.token = env.AI_TRANSLATION_TOKEN || env.AI_ANALYSIS_TOKEN || '';
    this.api = env.AI_TRANSLATION_API || env.AI_ANALYSIS_API || 'openai-chat-completions';
    this.model = env.AI_TRANSLATION_MODEL || env.AI_ANALYSIS_MODEL || '';
    this.maxChars = Number(env.AI_TRANSLATION_MAX_CHARS || 6000);
    this.maxOutputTokens = Number(env.AI_TRANSLATION_MAX_OUTPUT_TOKENS || 6000);
    this.maxRetries = Number(env.AI_TRANSLATION_MAX_RETRIES || 3);
    this.timeoutMs = Number(env.AI_TRANSLATION_TIMEOUT_MS || 30000);
    this.dailyCallLimit = Number(env.AI_TRANSLATION_DAILY_CALL_LIMIT || 1000);
    this.callState = { day: null, calls: 0 };
  }

  configured() { return this.enabled && Boolean(this.url) && Boolean(this.token) && Boolean(this.model); }

  requireConfigured() {
    if (!this.configured()) {
      const error = new Error('AI_TRANSLATION_NOT_CONFIGURED');
      error.code = 'AI_TRANSLATION_NOT_CONFIGURED';
      error.noRetry = true;
      throw error;
    }
  }

  async tickCallGuard() {
    if (this.reserveCall) {
      if (await this.reserveCall(this.dailyCallLimit)) return;
      throw Object.assign(new Error('AI_TRANSLATION_DAILY_LIMIT_REACHED'), { code: 'AI_TRANSLATION_DAILY_LIMIT_REACHED', noImmediateRetry: true });
    }
    const day = new Date().toISOString().slice(0, 10);
    if (this.callState.day !== day) this.callState = { day, calls: 0 };
    if (this.callState.calls >= this.dailyCallLimit) {
      const error = new Error('AI_TRANSLATION_DAILY_LIMIT_REACHED');
      error.code = 'AI_TRANSLATION_DAILY_LIMIT_REACHED';
      error.noImmediateRetry = true;
      throw error;
    }
    this.callState.calls += 1;
  }

  buildMessages(content) {
    const title = clean(content.title, this.maxChars);
    const body = clean(content.body, this.maxChars);
    return [
      { role: 'system', content: '你是专业翻译。将输入内容忠实翻译为简体中文。仅输出 JSON 对象，不要 Markdown：{"title":"...","body":"...","sourceLanguage":"..."}。没有标题或正文时对应输出空字符串。' },
      { role: 'user', content: JSON.stringify({ title, body }) }
    ];
  }

  async callOnce(messages) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.tickCallGuard();
        const anthropic = this.api === 'anthropic-messages';
        const endpoint = anthropic ? (/\/messages\/?$/.test(this.url) ? this.url : `${this.url.replace(/\/$/, '')}/messages`) : this.url;
        const headers = anthropic
          ? { 'content-type': 'application/json', 'x-api-key': this.token, 'anthropic-version': '2023-06-01' }
          : { 'content-type': 'application/json', authorization: `Bearer ${this.token}` };
        const body = anthropic
          ? { model: this.model, max_tokens: this.maxOutputTokens, system: messages[0].content, messages: [messages[1]] }
          : { model: this.model, temperature: 0, max_tokens: this.maxOutputTokens, messages };
        const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
        if (!response.ok) {
          const code = `AI_TRANSLATION_HTTP_${response.status}`;
          const error = Object.assign(new Error(code), { code });
          if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) error.noRetry = true;
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (!error.code && ['AbortError', 'TimeoutError'].includes(error.name)) error.code = 'AI_TRANSLATION_TIMEOUT';
        lastError = error;
        if (error.noRetry || error.noImmediateRetry || attempt === this.maxRetries) break;
        await sleep(2 ** attempt * 500);
      }
    }
    throw lastError;
  }

  parseResponse(response, messages) {
    const text = responseText(response, this.api);
    if (!text || typeof text !== 'string') throw Object.assign(new Error('AI_TRANSLATION_INVALID_RESPONSE'), { code: 'AI_TRANSLATION_INVALID_RESPONSE' });
    let parsed;
    try { parsed = JSON.parse(text.trim().replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()); }
    catch { throw Object.assign(new Error('AI_TRANSLATION_INVALID_RESPONSE'), { code: 'AI_TRANSLATION_INVALID_RESPONSE' }); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('AI_TRANSLATION_INVALID_RESPONSE'), { code: 'AI_TRANSLATION_INVALID_RESPONSE' });
    const title = clean(parsed?.title, this.maxChars);
    const body = clean(parsed?.body, this.maxChars);
    if (!title && !body) throw Object.assign(new Error('AI_TRANSLATION_EMPTY_RESPONSE'), { code: 'AI_TRANSLATION_EMPTY_RESPONSE' });
    const usage = response?.usage || {};
    const input = usage.prompt_tokens ?? usage.input_tokens;
    const output = usage.completion_tokens ?? usage.output_tokens;
    const inputTokens = Number.isFinite(input) ? Math.max(0, Math.floor(input)) : Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = Number.isFinite(output) ? Math.max(0, Math.floor(output)) : Math.ceil(text.length / 4);
    return { translatedTitle: title || null, translatedBody: body || null, sourceLanguage: clean(parsed?.sourceLanguage, 40) || null, modelName: this.model, usage: { inputTokens, outputTokens, totalTokens: Number.isFinite(usage.total_tokens) ? usage.total_tokens : inputTokens + outputTokens } };
  }

  async translate(content) {
    this.requireConfigured();
    if (!clean(content?.title, this.maxChars) && !clean(content?.body, this.maxChars)) {
      const error = new Error('AI_TRANSLATION_EMPTY_INPUT');
      error.code = 'AI_TRANSLATION_EMPTY_INPUT';
      error.noRetry = true;
      throw error;
    }
    const messages = this.buildMessages(content);
    return this.parseResponse(await this.callOnce(messages), messages);
  }
}

module.exports = { AiTranslator, clean };
