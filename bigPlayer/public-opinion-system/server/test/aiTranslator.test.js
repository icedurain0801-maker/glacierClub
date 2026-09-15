const test = require('node:test');
const assert = require('node:assert/strict');
const { AiTranslator } = require('../src/integrations/aiTranslator');

const env = { AI_TRANSLATION_ENABLED: 'true', AI_TRANSLATION_URL: 'https://ai.example.com/v1/chat/completions', AI_TRANSLATION_TOKEN: 'key', AI_TRANSLATION_MODEL: 'translation-model' };

test('OpenAI 兼容翻译服务返回译文及用量', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, async json() { return { choices: [{ message: { content: '{"title":"你好","body":"世界","sourceLanguage":"en"}' } }], usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 } }; } });
  try {
    const out = await new AiTranslator(env).translate({ title: 'Hello', body: 'World' });
    assert.deepEqual(out, { translatedTitle: '你好', translatedBody: '世界', sourceLanguage: 'en', modelName: 'translation-model', usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 } });
  } finally { global.fetch = original; }
});

test('无配置时拒绝翻译', async () => {
  await assert.rejects(() => new AiTranslator({}).translate({ body: 'Hello' }), error => error.code === 'AI_TRANSLATION_NOT_CONFIGURED');
});

test('空白输入直接失败且不调用翻译服务', async () => {
  const original = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; throw new Error('fetch must not be called'); };
  try {
    await assert.rejects(
      () => new AiTranslator({ ...env, AI_TRANSLATION_MAX_RETRIES: '0' }).translate({ title: '  ', body: '\n\t' }),
      error => error.code === 'AI_TRANSLATION_EMPTY_INPUT'
    );
    assert.equal(fetchCalls, 0);
  } finally { global.fetch = original; }
});

test('HTTP 429 按可恢复错误重试后成功', async () => {
  const original = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) return { ok: false, status: 429 };
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: '{"title":"你好","body":"世界","sourceLanguage":"en"}' } }] }; } };
  };
  try {
    const out = await new AiTranslator({ ...env, AI_TRANSLATION_MAX_RETRIES: '1' }).translate({ title: 'Hello', body: 'World' });
    assert.equal(out.translatedBody, '世界');
    assert.equal(fetchCalls, 2);
  } finally { global.fetch = original; }
});

test('HTTP 400 一次失败并标记为不可重试', async () => {
  const original = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return { ok: false, status: 400 }; };
  try {
    await assert.rejects(
      () => new AiTranslator({ ...env, AI_TRANSLATION_MAX_RETRIES: '3' }).translate({ body: 'Hello' }),
      error => error.code === 'AI_TRANSLATION_HTTP_400' && error.noRetry === true
    );
    assert.equal(fetchCalls, 1);
  } finally { global.fetch = original; }
});

test('HTTP 5xx 按可恢复错误重试后成功', async () => {
  const original = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) return { ok: false, status: 503 };
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: '{"title":"","body":"已恢复","sourceLanguage":"en"}' } }] }; } };
  };
  try {
    const out = await new AiTranslator({ ...env, AI_TRANSLATION_MAX_RETRIES: '1' }).translate({ body: 'Service unavailable' });
    assert.equal(out.translatedBody, '已恢复');
    assert.equal(fetchCalls, 2);
  } finally { global.fetch = original; }
});

test('请求超时使用稳定错误码并可重试恢复', async () => {
  const original = global.fetch;
  let fetchCalls = 0;
  const timeoutError = Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) throw timeoutError;
    return { ok: true, status: 200, async json() { return { choices: [{ message: { content: '{"title":"","body":"超时后恢复","sourceLanguage":"en"}' } }] }; } };
  };
  try {
    const out = await new AiTranslator({ ...env, AI_TRANSLATION_MAX_RETRIES: '1' }).translate({ body: 'Retry timeout' });
    assert.equal(out.translatedBody, '超时后恢复');
    assert.equal(fetchCalls, 2);
    assert.equal(timeoutError.code, 'AI_TRANSLATION_TIMEOUT');
  } finally { global.fetch = original; }
});

test('内部重试的每次 HTTP 请求均受每日调用上限约束', async () => {
  const original = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return { ok: false, status: 429 }; };
  try {
    await assert.rejects(
      () => new AiTranslator({ ...env, AI_TRANSLATION_MAX_RETRIES: '3', AI_TRANSLATION_DAILY_CALL_LIMIT: '1' }).translate({ body: 'Rate limited' }),
      error => error.code === 'AI_TRANSLATION_DAILY_LIMIT_REACHED' && error.noRetry !== true
    );
    assert.equal(fetchCalls, 1);
  } finally { global.fetch = original; }
});
