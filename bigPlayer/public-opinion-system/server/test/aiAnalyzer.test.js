const test = require('node:test');
const assert = require('node:assert/strict');
const { AiAnalyzer, truncate, fingerprintOf } = require('../src/integrations/aiAnalyzer');

const ENV = { AI_ANALYSIS_ENABLED: 'true', AI_ANALYSIS_URL: 'https://ai.example.com/v1/chat/completions', AI_ANALYSIS_TOKEN: 'k', AI_ANALYSIS_MODEL: 'test-model' };

// 用一个可编排的假 fetch 替换全局，记录调用并按序返回。
function withFetch(handler, fn) {
  const original = global.fetch; const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts, body: JSON.parse(opts.body) }); return handler(calls.length - 1, calls); };
  return Promise.resolve(fn(calls)).finally(() => { global.fetch = original; });
}
function aiReply(items, usage) { // 必填字段缺省值仅用于简化测试数据
  const completed = items.map(item => ({ c: 0.8, d: false, r: '内容仅表达事实确认，没有明显正面或负面情绪。', ...item }));
  return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(completed) } }], ...(usage ? { usage } : {}) }; } };
}

function anthropicReply(items) {
  const completed = items.map(item => ({ c: 0.8, d: false, r: '内容仅表达事实确认，没有明显正面或负面情绪。', ...item }));
  return { ok: true, status: 200, async json() { return { content: [{ type: 'text', text: JSON.stringify(completed) }] }; } };
}

test('Anthropic Messages 协议使用专用路径、请求头和响应解析', async () => {
  const ai = new AiAnalyzer({ ...ENV, AI_ANALYSIS_URL: 'https://ai.example.com/v1', AI_ANALYSIS_API: 'anthropic-messages' });
  await withFetch(() => anthropicReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]), async calls => {
    const [out] = await ai.analyzeBatch([{ title: 'a', body: 'b' }]);
    assert.equal(calls[0].url, 'https://ai.example.com/v1/messages');
    assert.equal(calls[0].opts.headers['x-api-key'], 'k');
    assert.equal(calls[0].opts.headers.authorization, undefined);
    assert.equal(calls[0].body.system.includes('严格 JSON 数组'), true);
    assert.equal(calls[0].body.messages[0].role, 'user');
    assert.equal(out.sentiment, 'neutral');
  });
});

test('未配置时 fail-closed 抛错', async () => {
  const ai = new AiAnalyzer({});
  await assert.rejects(() => ai.analyzeBatch([{ title: 'x', body: 'y' }]), e => e.code === 'AI_ANALYSIS_NOT_CONFIGURED');
});

test('批量分析返回等长同序结果', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([{ i: 0, s: 'negative', v: 'urgent', n: 0.9, t: ['闪退'], m: '崩溃严重' }, { i: 1, s: 'positive', v: 'normal', n: 0.1, t: [], m: '好评' }]),
    async () => {
      const out = await ai.analyzeBatch([{ title: 'a', body: '崩溃' }, { title: 'b', body: '好玩' }]);
      assert.equal(out.length, 2);
      assert.equal(out[0].sentiment, 'negative');
      assert.equal(out[0].severity, 'urgent');
      assert.equal(out[0].negativeScore, 0.9);
      assert.equal(out[0].modelName, 'test-model');
      assert.equal(out[1].sentiment, 'positive');
    }
  );
});

test('质量推荐字段按新版 schema 解析', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([{ i: 0, s: 'positive', v: 'normal', n: 0, t: ['攻略'], m: '高质量攻略', q: 0.92, h: true, p: false, f: true, qr: '内容完整且有长期参考价值，适合首页推荐和加精。' }]),
    async calls => {
      const [out] = await ai.analyzeBatch([{ title: '攻略', body: '完整攻略正文' }], 'deep');
      assert.match(calls[0].body.messages[0].content, /q\(quality_score 0~1\)/);
      assert.match(calls[0].body.messages[0].content, /h\(recommend_home/);
      assert.deepEqual({
        qualityScore: out.qualityScore,
        recommendHome: out.recommendHome,
        recommendPin: out.recommendPin,
        recommendFeature: out.recommendFeature,
        qualityReason: out.qualityReason
      }, {
        qualityScore: 0.92,
        recommendHome: true,
        recommendPin: false,
        recommendFeature: true,
        qualityReason: '内容完整且有长期参考价值，适合首页推荐和加精。'
      });
    }
  );
});

test('旧响应缺少质量字段时默认不推荐且不影响风险解析', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([{ i: 0, s: 'negative', v: 'urgent', n: 0.95, t: ['崩溃'], m: '严重崩溃' }]),
    async () => {
      const [out] = await ai.analyzeBatch([{ title: '崩溃', body: '无法启动' }], 'deep');
      assert.equal(out.severity, 'urgent');
      assert.equal(out.qualityScore, 0);
      assert.equal(out.recommendHome, false);
      assert.equal(out.recommendPin, false);
      assert.equal(out.recommendFeature, false);
      assert.equal(out.qualityReason, '');
    }
  );
});

test('相同内容命中缓存不重复调用', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([{ i: 0, s: 'negative', v: 'attention', n: 0.5, t: [], m: 'x' }]),
    async (calls) => {
      const item = { title: 'dup', body: '重复内容' };
      await ai.analyzeBatch([item]);
      await ai.analyzeBatch([{ ...item }]); // 同指纹
      assert.equal(calls.length, 1); // 第二次走缓存
    }
  );
});

test('超过 batchSize 拆多次请求', async () => {
  const ai = new AiAnalyzer({ ...ENV, AI_ANALYSIS_BATCH_SIZE: '2' });
  await withFetch(
    (n, calls) => {
      const count = JSON.parse(calls[n].body.messages[1].content.split('\n')[1]).length;
      return aiReply(Array.from({ length: count }, (_, i) => ({ i, s: 'neutral', v: 'normal', n: 0, t: [], m: '' })));
    },
    async (calls) => {
      const items = [1, 2, 3].map(i => ({ title: `t${i}`, body: `b${i}` }));
      await ai.analyzeBatch(items);
      assert.equal(calls.length, 2); // 2 + 1
    }
  );
});

test('正文按 maxChars 截断后进入 prompt', async () => {
  const ai = new AiAnalyzer({ ...ENV, AI_ANALYSIS_MAX_CHARS: '10' });
  await withFetch(
    () => aiReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]),
    async (calls) => {
      await ai.analyzeBatch([{ title: '短', body: '这是一段非常非常非常非常长的正文内容需要被截断处理掉' }]);
      const userMsg = calls[0].body.messages[1].content;
      assert.ok(!userMsg.includes('被截断处理掉'));
    }
  );
});

test('非法响应 fail-closed', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => ({ ok: true, status: 200, async json() { return { choices: [{ message: { content: '抱歉我无法分析' } }] }; } }),
    async () => { await assert.rejects(() => ai.analyzeBatch([{ title: 'a', body: 'b' }]), /AI_ANALYSIS_INVALID_RESPONSE/); }
  );
});

test('模型返回 fenced JSON 时仍能解析', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => ({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: `\`\`\`json
[{"i":0,"s":"neutral","v":"normal","n":0,"c":0.8,"d":false,"r":"判断明确","t":[],"m":"普通内容"}]
\`\`\`` } }] };
      }
    }),
    async () => {
      const [out] = await ai.analyzeBatch([{ title: 'a', body: 'b' }]);
      assert.equal(out.sentiment, 'neutral');
    }
  );
});

test('4xx 不重试直接失败', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => ({ ok: false, status: 401, async json() { return {}; } }),
    async (calls) => {
      await assert.rejects(() => ai.analyzeBatch([{ title: 'a', body: 'b' }]), /AI_ANALYSIS_HTTP_401/);
      assert.equal(calls.length, 1); // 无重试
    }
  );
});


test('单日调用上限闸门', async () => {
  const ai = new AiAnalyzer({ ...ENV, AI_ANALYSIS_DAILY_CALL_LIMIT: '1' });
  await withFetch(
    () => aiReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]),
    async () => {
      await ai.analyzeBatch([{ title: 'a', body: '内容一' }]);
      await assert.rejects(() => ai.analyzeBatch([{ title: 'b', body: '内容二' }]), e => e.code === 'AI_ANALYSIS_DAILY_LIMIT_REACHED');
    }
  );
});

test('profile 配置覆盖旧环境变量且请求使用选中模型与限制', async () => {
  const ai = new AiAnalyzer({
    ...ENV,
    AI_ANALYSIS_BATCH_SIZE: '9',
    AI_ANALYSIS_MAX_CHARS: '99',
    AI_ANALYSIS_MAX_OUTPUT_TOKENS: '999',
    AI_ANALYSIS_DEEP_MODEL: 'deep-model',
    AI_ANALYSIS_DEEP_VERSION: 'deep-v2',
    AI_ANALYSIS_DEEP_BATCH_SIZE: '1',
    AI_ANALYSIS_DEEP_MAX_CHARS: '5',
    AI_ANALYSIS_DEEP_MAX_OUTPUT_TOKENS: '123'
  });
  await withFetch(
    () => aiReply([{ i: 0, s: 'negative', v: 'attention', n: 0.7, c: 0.6, d: false, r: '上下文充分', t: [], m: '风险' }]),
    async (calls) => {
      const out = await ai.analyzeBatch([{ title: '标题', body: '1234567890' }], 'deep');
      assert.equal(calls[0].body.model, 'deep-model');
      assert.equal(calls[0].body.max_tokens, 123);
      assert.ok(!calls[0].body.messages[1].content.includes('67890'));
      assert.equal(out[0].profile, 'deep');
      assert.equal(out[0].analysisVersion, 'deep-v2');
      assert.equal(out[0].modelName, 'deep-model');
    }
  );
});

test('旧环境变量兼容且 analyzeBatch 默认 light', async () => {
  const ai = new AiAnalyzer({ ...ENV, AI_ANALYSIS_VERSION: 'legacy-v2', AI_ANALYSIS_MAX_OUTPUT_TOKENS: '77' });
  await withFetch(
    () => aiReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]),
    async (calls) => {
      const [out] = await ai.analyzeBatch([{ title: 'a', body: 'b' }]);
      assert.equal(calls[0].body.model, 'test-model');
      assert.equal(calls[0].body.max_tokens, 77);
      assert.equal(out.profile, 'light');
      assert.equal(out.analysisVersion, 'legacy-v2');
    }
  );
});

test('缓存按 profile、model、version 隔离并在同批去重', async () => {
  const ai = new AiAnalyzer({ ...ENV, AI_ANALYSIS_DEEP_MODEL: 'deep-model', AI_ANALYSIS_DEEP_VERSION: 'deep-v1' });
  await withFetch(
    () => aiReply([{ i: 0, s: 'negative', v: 'attention', n: 0.5, t: [], m: 'x' }]),
    async (calls) => {
      const item = { title: 'dup', body: '重复内容' };
      const light = await ai.analyzeBatch([item, { ...item }]);
      assert.equal(calls.length, 1);
      assert.strictEqual(light[0], light[1]);
      await ai.analyzeBatch([item], 'deep');
      assert.equal(calls.length, 2);
      ai.profiles.deep.version = 'deep-v2';
      await ai.analyzeBatch([item], 'deep');
      assert.equal(calls.length, 3);
      ai.profiles.deep.model = 'deep-model-v2';
      await ai.analyzeBatch([item], 'deep');
      assert.equal(calls.length, 4);
    }
  );
});

test('缓存按区域、游戏、社区和平台上下文隔离', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]),
    async (calls) => {
      const base = { title: '相同标题', body: '相同正文', fingerprint: 'same-content', regionCode: 'domestic', gameId: 'g1', platform: 'q1' };
      await ai.analyzeBatch([{ ...base, communityId: 'c1' }]);
      await ai.analyzeBatch([{ ...base, communityId: 'c2' }]);
      await ai.analyzeBatch([{ ...base, communityId: 'c1' }]);
      assert.equal(calls.length, 2);
    }
  );
});

test('分析提示词包含区域、游戏、社区和平台上下文', () => {
  const ai = new AiAnalyzer(ENV);
  const messages = ai.buildMessages([{
    title: '标题', body: '正文', regionCode: 'overseas', gameName: 'Last Night', communityName: '欧美服', platform: 'reddit'
  }], ai.profiles.light);
  const payload = messages[1].content;
  assert.match(payload, /overseas/);
  assert.match(payload, /Last Night/);
  assert.match(payload, /欧美服/);
  assert.match(payload, /reddit/);
});
test('light and deep prompts request a concise observable plain-language reason', () => {
  const ai = new AiAnalyzer(ENV);
  for (const profile of [ai.profiles.light, ai.profiles.deep]) {
    const system = ai.buildMessages([{ title: '标题', body: '正文' }], profile)[0].content;
    assert.match(system, /20-60/);
    assert.match(system, /通俗中文/);
    assert.match(system, /可观察到的表达、语气或信息/);
    assert.match(system, /不输出内部推理步骤/);
    assert.match(system, /根据系统提示/);
    assert.match(system, /模型认为/);
  }
});

test('严格响应要求 confidence/needsDeep/reason', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => ({ ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]) } }] }; } }),
    async () => assert.rejects(() => ai.analyzeBatch([{ title: 'a', body: 'b' }]), /AI_ANALYSIS_INVALID_RESPONSE/)
  );
});

test('返回真实 usage 元数据并按结果分摊', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([
      { i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' },
      { i: 1, s: 'negative', v: 'attention', n: 0.5, t: [], m: 'x' }
    ], { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }),
    async () => {
      const out = await ai.analyzeBatch([{ title: 'a' }, { title: 'b' }]);
      assert.deepEqual(out.map(x => x.inputTokens), [3, 2]);
      assert.deepEqual(out.map(x => x.outputTokens), [2, 1]);
      assert.deepEqual(out.map(x => x.totalTokens), [4, 4]);
      assert.equal(out[0].usageEstimated, false);
    }
  );
});

test('缺少 provider usage 时返回估算元数据', async () => {
  const ai = new AiAnalyzer(ENV);
  await withFetch(
    () => aiReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]),
    async () => {
      const [out] = await ai.analyzeBatch([{ title: 'a', body: 'b' }]);
      assert.equal(out.usageEstimated, true);
      assert.ok(out.inputTokens > 0);
      assert.ok(out.outputTokens > 0);
      assert.equal(out.totalTokens, out.inputTokens + out.outputTokens);
    }
  );
});

test('selected profile/model 校验', async () => {
  const ai = new AiAnalyzer(ENV);
  await assert.rejects(() => ai.analyzeBatch([{ title: 'a' }], 'invalid'), e => e.code === 'AI_ANALYSIS_INVALID_PROFILE');
  const missingDeep = new AiAnalyzer({ ...ENV, AI_ANALYSIS_MODEL: '', AI_ANALYSIS_LIGHT_MODEL: 'light-model' });
  await assert.rejects(() => missingDeep.analyzeBatch([{ title: 'a' }], 'deep'), e => e.code === 'AI_ANALYSIS_MODEL_NOT_CONFIGURED');
});

test('profile 调用上限独立', async () => {
  const ai = new AiAnalyzer({
    ...ENV,
    AI_ANALYSIS_LIGHT_DAILY_CALL_LIMIT: '1',
    AI_ANALYSIS_DEEP_DAILY_CALL_LIMIT: '1',
    AI_ANALYSIS_DEEP_MODEL: 'deep-model'
  });
  await withFetch(
    () => aiReply([{ i: 0, s: 'neutral', v: 'normal', n: 0, t: [], m: '' }]),
    async (calls) => {
      await ai.analyzeBatch([{ title: 'a' }], 'light');
      await ai.analyzeBatch([{ title: 'b' }], 'deep');
      assert.equal(calls.length, 2);
      await assert.rejects(() => ai.analyzeBatch([{ title: 'c' }], 'light'), e => e.code === 'AI_ANALYSIS_DAILY_LIMIT_REACHED');
    }
  );
});

test('truncate/fingerprint 工具', () => {
  assert.equal(truncate('a  b\nc', 10), 'a b c');
  assert.equal(truncate('abcdef', 3), 'abc');
  assert.equal(fingerprintOf({ title: 't', body: 'b' }), fingerprintOf({ title: 't', body: 'b' }));
  assert.equal(fingerprintOf({ fingerprint: 'FIXED' }), 'FIXED');
});
