const assert = require('assert');
const chatService = require('../src/services/chatService');

const WEATHER_LOCATION_PROMPT = '你想查哪个城市的天气？直接发“上海天气”或“北京明天会不会下雨”这种就行。';

function main() {
  const locationPromptHistory = [
    { role: 'user', content: '明天会下雨吗' },
    { role: 'assistant', content: WEATHER_LOCATION_PROMPT },
  ];

  assert.strictEqual(
    chatService.getPendingWeatherQuery('北京', locationPromptHistory),
    '北京明天会下雨吗'
  );
  assert.strictEqual(chatService.getPendingWeatherQuery('北京呢', locationPromptHistory), '北京明天会下雨吗');
  assert.strictEqual(chatService.getPendingWeatherQuery('姚明是谁', locationPromptHistory), '');
  assert.strictEqual(chatService.getPendingWeatherQuery('OpenAI最新新闻', locationPromptHistory), '');
  assert.strictEqual(chatService.getPendingWeatherQuery('yao', locationPromptHistory), '');

  const weatherHistory = [
    { role: 'user', content: '深圳光明区周六会下雨吗' },
    { role: 'assistant', content: '深圳光明区周六预计有雨，当前实时多云。' },
  ];

  assert.strictEqual(
    chatService.getPendingWeatherQuery('周日呢', weatherHistory),
    '深圳光明区周日天气怎么样'
  );
  assert.strictEqual(
    chatService.getPendingWeatherQuery('那后天会下雨吗', weatherHistory),
    '深圳光明区后天会下雨'
  );
  assert.strictEqual(chatService.getPendingWeatherQuery('后天会下雨吗', weatherHistory), '');
  assert.strictEqual(chatService.getPendingWeatherQuery('今天天气呢', weatherHistory), '');
  assert.strictEqual(chatService.getPendingWeatherQuery('姚明是谁', weatherHistory), '');

  assert.strictEqual(chatService.shouldCarryWeatherFollowup('周六呢'), true);
  assert.strictEqual(chatService.shouldCarryWeatherFollowup('那后天会下雨吗'), true);
  assert.strictEqual(chatService.shouldCarryWeatherFollowup('后天会下雨吗'), false);
  assert.strictEqual(chatService.shouldCarryWeatherFollowup('今天天气呢'), false);

  assert.strictEqual(
    chatService.shouldSuppressRefsForReply('你在玩哪款游戏呢？说一下游戏名，或者直接告诉我卡在哪了，我来帮你看看 😄'),
    true
  );
  assert.strictEqual(
    chatService.shouldSuppressRefsForReply('卡西迪的技能重点是神射和午时已到，可以优先练习命中率。'),
    false
  );

  assert.strictEqual(
    chatService.shouldReturnSearchUnavailableFallback('\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019'),
    true
  );
  assert.strictEqual(chatService.shouldReturnSearchUnavailableFallback('\u59da\u660e\u662f\u8c01'), false);
  assert.strictEqual(
    chatService.buildSearchUnavailableReply('\u4e16\u754c\u676f\u51b3\u8d5b\u4ec0\u4e48\u65f6\u5019'),
    '\u8fd9\u4e2a\u95ee\u9898\u9700\u8981\u67e5\u5b9e\u65f6\u6216\u6700\u65b0\u4fe1\u606f\uff0c\u6211\u8fd9\u8fb9\u6682\u65f6\u6ca1\u62ff\u5230\u53ef\u9760\u641c\u7d22\u7ed3\u679c\uff0c\u4e0d\u80fd\u4e71\u62a5\u3002\u4f60\u53ef\u4ee5\u7a0d\u540e\u518d\u8bd5\u4e00\u6b21\uff0c\u6216\u76f4\u63a5\u67e5\u5b98\u65b9\u6e20\u9053\u786e\u8ba4\u3002'
  );
  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('\u7279\u65af\u62c9', [], [], ''), true);
  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('\u4e16\u754c\u676f\u51b3\u8d5b', [], [], ''), false);
  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('\u7279\u65af\u62c9', [{ matchText: 'x' }], [], ''), false);
  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('\u7279\u65af\u62c9', [], [{ value: 'x' }], ''), false);
  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('\u7279\u65af\u62c9', [], [], 'LIVE_RESULTS'), false);

  const directKnowledgeRefs = [{
    matchText: [
      'sheet: \u6280\u80fd',
      '\u6781\u901f\u5947\u88ad',
      '\u57fa\u7840\u6548\u679c\uff1a\u5bf9\u524d\u6392\u9020\u6210\u4f24\u5bb3',
      '\u4e8c\u661f\u6548\u679c\uff1a\u8ffd\u52a0\u7834\u7532',
      '\u4e09\u661f\u6548\u679c\uff1a\u8ffd\u52a0\u7729\u6655',
      'asset path: /kb-images/skill-1.png',
    ].join('\n'),
  }];
  assert.strictEqual(
    chatService.getDirectKnowledgeReply('\u6781\u901f\u5947\u88ad', directKnowledgeRefs),
    [
      '\u6781\u901f\u5947\u88ad',
      '\u57fa\u7840\u6548\u679c\uff1a\u5bf9\u524d\u6392\u9020\u6210\u4f24\u5bb3',
      '\u4e8c\u661f\u6548\u679c\uff1a\u8ffd\u52a0\u7834\u7532',
      '\u4e09\u661f\u6548\u679c\uff1a\u8ffd\u52a0\u7729\u6655',
    ].join('\n')
  );
  assert.strictEqual(
    chatService.getDirectKnowledgeReply('\u6781\u901f\u5947\u88ad', [{
      matchText: [
        'sheet: \u6280\u80fd',
        'reference: \u6280\u80fd\u914d\u7f6e',
        'asset path: /kb-images/skill-1.png',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getDirectKnowledgeReply('\u8587\u73c0', [{
      matchText: [
        '\u82f1\u96c4\u53c2\u8003',
        '\u57fa\u7840\u6548\u679c\uff1a\u5bf9\u5355\u4f53\u9020\u6210\u4f24\u5bb3',
        '\u53f0\u8bcd\uff1a\u4e3a\u4e86\u80dc\u5229',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getDirectKnowledgeReply('\u841d\u65af\u9002\u5408\u4ec0\u4e48\u9635\u5bb9', [{
      matchText: [
        '\u9879\u76ee: \u63a8\u8350\u9635\u5bb9',
        '\u4e2d\u6587: \u63a8\u8350\u9635\u5bb9',
        '\u82f1\u6587: Recommended Team',
        '\u65e5\u8bed: \u304a\u3059\u3059\u3081\u7de8\u6210',
        '\ud55c\u8bed: \ucd94\ucc9c \ud3b8\uc131',
        '\u7e41\u4e2d: \u63a8\u85a6\u9663\u5bb9',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getDirectKnowledgeReply('\u7279\u65af\u62c9', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
        '\u706f\u5854\u540d: \u7d22\u5c3c\u514b',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getLiteralKnowledgeReply('\u841d\u65af\u9002\u5408\u4ec0\u4e48\u9635\u5bb9', [{
      matchText: [
        '\u9879\u76ee: \u63a8\u8350\u9635\u5bb9',
        '\u4e2d\u6587: \u63a8\u8350\u9635\u5bb9',
        '\u82f1\u6587: Recommended Team',
        '\u65e5\u8bed: \u304a\u3059\u3059\u3081\u7de8\u6210',
        '\ud55c\u8bed: \ucd94\ucc9c \ud3b8\uc131',
        '\u7e41\u4e2d: \u63a8\u85a6\u9663\u5bb9',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getLiteralKnowledgeReply('\u7279\u65af\u62c9', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        '\uff08\u7b2c\u4e8c\u6279\uff09',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
        '\u706f\u5854\u540d: \u7d22\u5c3c\u514b',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.hasOnlyHeroAliasMappingRefs('\u7279\u65af\u62c9', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
        '\u706f\u5854\u540d: \u7d22\u5c3c\u514b',
      ].join('\n'),
    }]),
    true
  );
  assert.strictEqual(
    chatService.getLiteralKnowledgeReply('\u7279\u65af\u62c9', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        '\uff08\u7b2c\u4e8c\u6279\uff09',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getHeroAliasReply('\u7279\u65af\u62c9', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        '\uff08\u7b2c\u4e8c\u6279\uff09: \u7279\u65af\u62c9 | \u9edb\u82ac\u59ae | \u7d22\u5c3c\u514b',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
        '\u706f\u5854\u540d: \u7d22\u5c3c\u514b',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getHeroAliasReply('\u7279\u65af\u62c9', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
        '\u706f\u5854\u540d: \u7d22\u5c3c\u514b',
      ].join('\n'),
    }]),
    ''
  );
  assert.strictEqual(
    chatService.getHeroAliasReply('\u7279\u65af\u62c9\u5bf9\u5e94\u7684\u706f\u5854\u540d\u662f\u4ec0\u4e48', [{
      matchText: [
        'Sheet: \u706f\u5854\u82f1\u96c4\u5bf9\u7167\u8868',
        'Row: 32',
        '\u7a00\u6709\u7b49\u7ea7: S+',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
        '\u706f\u5854\u540d: \u7d22\u5c3c\u514b',
      ].join('\n'),
    }]),
    [
      '\u53ea\u547d\u4e2d\u5230\u540d\u79f0\u5bf9\u7167\uff1a',
      '\u7a00\u6709\u7b49\u7ea7\uff1aS+',
      'LastWar\uff1a\u7279\u65af\u62c9',
      '\u4f4d\u97622\u540d\uff1a\u9edb\u82ac\u59ae',
      '\u706f\u5854\u540d\uff1a\u7d22\u5c3c\u514b',
    ].join('\n')
  );
  assert.strictEqual(
    chatService.getHeroAliasReply('\u4e16\u754c\u676f', [{
      matchText: [
        '\u7a00\u6709\u7b49\u7ea7: S+',
        'LastWar: \u7279\u65af\u62c9',
        '\u4f4d\u97622\u540d: \u9edb\u82ac\u59ae',
      ].join('\n'),
    }]),
    ''
  );

  const messages = chatService.buildMessages(
    { display_name: 'Tester', persona: 'Persona block' },
    [],
    '\u6781\u901f\u5947\u88ad',
    'KB_CONTEXT',
    'KG_FACTS',
    'LIVE_RESULTS'
  );
  const systemPrompt = messages[0].content;
  assert.ok(systemPrompt.indexOf('LIVE_RESULTS') < systemPrompt.indexOf('Tester'));
  assert.ok(systemPrompt.indexOf('KB_CONTEXT') < systemPrompt.indexOf('Tester'));
  assert.ok(systemPrompt.indexOf('KG_FACTS') < systemPrompt.indexOf('Tester'));

  console.log('chatService tests passed');
}

main();
