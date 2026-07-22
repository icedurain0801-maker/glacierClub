const assert = require('assert');

const chatService = require('../src/services/chatService');
const llm = require('../src/services/llm');

const WEATHER_LOCATION_PROMPT = '你想查哪个城市的天气？直接发“上海天气”或“北京明天会不会下雨”这种就行。';

async function main() {
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
  assert.strictEqual(chatService.shouldCarryWeatherFollowup('周六呢'), true);
  assert.strictEqual(chatService.shouldCarryWeatherFollowup('那后天会下雨吗'), true);
  assert.strictEqual(chatService.shouldCarryWeatherFollowup('后天会下雨吗'), false);

  assert.strictEqual(
    chatService.shouldSuppressRefsForReply('你在玩哪款游戏呢？说一下游戏名，或者直接告诉我卡在哪了，我来帮你看看 😄'),
    true
  );
  assert.strictEqual(
    chatService.shouldSuppressRefsForReply('卡西迪的技能重点是神射和午时已到，可以优先练习命中率。'),
    false
  );

  assert.strictEqual(chatService.shouldReturnSearchUnavailableFallback('世界杯决赛什么时候'), true);
  assert.strictEqual(chatService.shouldReturnSearchUnavailableFallback('姚明是谁'), false);
  assert.strictEqual(
    chatService.buildSearchUnavailableReply('世界杯决赛什么时候'),
    '这个问题需要查实时或最新信息，我这边暂时没拿到可靠搜索结果，不能乱报。你可以稍后再试一次，或直接查官方渠道确认。'
  );
  assert.strictEqual(
    chatService.buildSearchUnavailableReply('When is the World Cup final?'),
    'This question needs current or latest information. I do not have reliable search results right now, so I should not guess. Please try again later or confirm through an official source.'
  );
  assert.strictEqual(
    chatService.getPendingSearchRetryQuery('这也不知道吗', [
      { role: 'user', content: '世界杯的季军赛是什么时候？' },
      { role: 'assistant', content: '这个问题需要查实时或最新信息，我这边暂时没拿到可靠搜索结果，不能乱报。你可以稍后再试一次，或直接查官方渠道确认。' },
    ]),
    '世界杯的季军赛是什么时候？'
  );

  assert.strictEqual(
    chatService.shouldCarryGenericFollowup('有没有6个人的，下雨天也能露营的地方'),
    true
  );
  const campingFollowup = chatService.buildGenericContextAugmentedQuery(
    '有没有6个人的，下雨天也能露营的地方',
    [
      { role: 'user', content: '给我推荐一下深圳的露营地' },
      { role: 'assistant', content: '可以看看深圳周边的几个露营地。' },
    ]
  );
  assert.strictEqual(campingFollowup.subject, '深圳的露营地');
  assert.strictEqual(
    campingFollowup.retrievalQuery,
    '深圳的露营地 有没有6个人的，下雨天也能露营的地方'
  );
  assert.ok(campingFollowup.followupContextBlock.length > 0);

  assert.strictEqual(chatService.detectUserLocale('新手入门怎么玩'), 'zh-CN');
  assert.strictEqual(chatService.detectUserLocale('How do beginners start?'), 'en-US');
  assert.strictEqual(chatService.detectUserLocale('このゲームの始め方は？'), 'ja-JP');
  assert.strictEqual(chatService.detectUserLocale('입문자는 어떻게 시작해?'), 'ko-KR');

  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('特斯拉', [], [], ''), true);
  assert.strictEqual(chatService.shouldUseNoHitEntityFallback('世界杯决赛', [], [], ''), false);
  assert.strictEqual(chatService.getKnowledgeQueryIntent('索尼克这个英雄咋样'), 'hero_overview');
  assert.strictEqual(chatService.getKnowledgeQueryIntent('索尼克的英雄台词是什么'), 'quote');

  assert.strictEqual(
    chatService.getKnowledgeQueryIntent('\u4ecb\u7ecd\u4e00\u4e0b\u65b0\u624b\u7ade\u6280\u573a'),
    'general'
  );

  const arenaRefs = [
    {
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 61',
        '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: 1.\u65b0\u624b\u7ade\u6280\u573a\u4f1a\u5728\u5f00\u670d\u7684\u7b2c\u4e00\u5929\u5f00\u542f',
      ].join('\n'),
      lexicalScore: 30,
      semanticScore: 0,
      score: 0.3,
    },
    {
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 73',
        '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: 1.\u65b0\u624b\u7ade\u6280\u573a\u62e5\u6709\u6bcf\u65e5\u5956\u52b1',
      ].join('\n'),
      lexicalScore: 30,
      semanticScore: 0,
      score: 0.3,
    },
  ];
  assert.strictEqual(
    chatService.filterRefsForAnswer('\u4ecb\u7ecd\u4e00\u4e0b\u65b0\u624b\u7ade\u6280\u573a', arenaRefs).length > 0,
    true,
    'system-intro questions should keep gameplay refs instead of filtering them out as profile-only queries'
  );

  const arenaGuideRefs = [
    {
      entryId: 10493,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 59',
        '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: \u65b0\u624b\u7ade\u6280\u573a\u653b\u7565',
        '\u5c0f\u8de8\u670d: Novice Arena Guide',
      ].join('\n'),
      lexicalScore: 39,
      semanticScore: 0,
      score: 0.39,
    },
    {
      entryId: 10555,
      matchText: [
        'Sheet: \u672b\u65e5\u5371\u57ce',
        'Row: 6',
        '*\u5982\u679c\u4f7f\u7528\u7684\u662f\u6e38\u620f\u7684\u9053\u5177icon\uff0c\u5219\u8fd9\u91cc\u53ea\u5217 icon\u7684\u56fe\u6807ID: \u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565',
        'ID\u67e5\u8be2\u7f51\u76d8\uff1a\\\\172.16.0.180\\share\\icons',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0,
      score: 0.16,
    },
    {
      entryId: 10495,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 61',
        '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: 1.\u65b0\u624b\u7ade\u6280\u573a\u4f1a\u5728\u5f00\u670d\u7684\u7b2c\u4e00\u5929\u5f00\u542f',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0,
      score: 0.16,
    },
  ];
  assert.deepStrictEqual(
    chatService.filterRefsForAnswer('\u65b0\u624b\u7ade\u6280\u573a\u653b\u7565', arenaGuideRefs).map(ref => ref.entryId),
    [10493, 10495],
    'title-matched KB rows should be preserved while icon/material noise rows are filtered out'
  );
  assert.strictEqual(
    chatService.getLiteralKnowledgeReply('\u65b0\u624b\u7ade\u6280\u573a\u653b\u7565', chatService.filterRefsForAnswer('\u65b0\u624b\u7ade\u6280\u573a\u653b\u7565', arenaGuideRefs)).includes('Sheet:'),
    false,
    'literal KB replies should not leak sheet metadata headings'
  );

  const pvpDefenseRefs = [
    {
      entryId: 10442,
      documentId: 76,
      rowIndex: 157,
      matchText: [
        'Sheet: PVP\u653b\u7565',
        'Rows: 4-22',
        'PVP\u57fa\u5730\u9632\u5b88\u8981\u70b9',
        '\u5f53\u5176\u4ed6\u6307\u6325\u5b98\u8fdb\u653b\u4f60\u7684\u57fa\u5730\u65f6,\u4f5c\u4e3a\u9632\u5b88\u65b9,\u4f60\u7684\u90e8\u5206\u58eb\u5175\u4e0d\u4f1a\u7acb\u523b\u9635\u4ea1,\u800c\u662f\u4f1a\u4ee5\u300c\u91cd\u4f24\u300d\u72b6\u6001\u8fdb\u5165\u533b\u9662\u3002',
        '\u533b\u9662\u80fd\u5bb9\u7eb3\u7684\u4f24\u5175\u6570\u91cf\u6709\u9650,\u4e00\u65e6\u8d85\u51fa,\u591a\u4f59\u7684\u58eb\u5175\u5c31\u4f1a\u76f4\u63a5\u9635\u4ea1\u3002',
      ].join('\n'),
      lexicalScore: 47,
      semanticScore: 0.57,
      score: 0.57,
    },
    {
      entryId: 10886,
      documentId: 76,
      rowIndex: 601,
      matchText: [
        'Sheet: \u767e\u79d1UI\u9700\u6c42',
        'Row: 9',
        'Context: \u57fa\u7840\u653b\u7565\u767e\u79d1UI\u9700\u6c42',
        '\u767e\u79d1\u5206\u7c7b: PVP\u57fa\u5730\u9632\u5b88\u8981\u70b9',
        '\u8d34\u6587\u5185\u5bb9\u53c2\u8003: https://club-en.q1.com/pages/post/detail/index?id=1166788',
      ].join('\n'),
      lexicalScore: 47,
      semanticScore: 0.64,
      score: 0.64,
    },
  ];
  assert.deepStrictEqual(
    chatService.filterRefsForAnswer('PVP\u57fa\u5730\u9632\u5b88\u8981\u70b9', pvpDefenseRefs).map(ref => ref.entryId),
    [10442],
    'UI planning rows should be dropped when real gameplay KB rows are present'
  );

  const peakArenaRefs = [
    {
      entryId: 10447,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 162',
        '\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565 / Peak Arena Guide',
      ].join('\n'),
      lexicalScore: 42,
      semanticScore: 0,
      score: 0.42,
    },
    {
      entryId: 10448,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 163',
        '\u3010\u5f00\u542f\u65f6\u95f4\u3011',
      ].join('\n'),
      lexicalScore: 12,
      semanticScore: 0,
      score: 0.12,
    },
    {
      entryId: 10449,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 164',
        '1.\u5dc5\u5cf0\u7ade\u6280\u573a\u4f1a\u5728\u6bcf\u5468\u4e8c\u5f00\u542f',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0,
      score: 0.16,
    },
    {
      entryId: 10648,
      matchText: [
        'Sheet: \u5feb\u901f\u4e0a\u624b',
        'Row: 88',
        '\u9879\u76ee: \u5dc5\u5cf0\u7ade\u6280\u573a - Peak Arena',
        '\u4e2d\u6587: \u5dc5\u5cf0\u7ade\u6280\u573a',
        '\u82f1\u6587: Peak Arena',
        '\u65e5\u8bed: \u9802\u4e0a\u6c7a\u6226',
      ].join('\n'),
      lexicalScore: 33,
      semanticScore: 0,
      score: 0.33,
    },
    {
      entryId: 10649,
      matchText: [
        'Sheet: \u5feb\u901f\u4e0a\u624b',
        'Row: 89',
        '\u6bcf\u65e5\u5fc5\u505a',
        '\u5dc5\u5cf0\u7ade\u6280\u573a\u6bcf\u5929\u628a\u6311\u6218\u6b21\u6570\u6253\u6ee1',
      ].join('\n'),
      lexicalScore: 22,
      semanticScore: 0,
      score: 0.22,
    },
  ];
  assert.deepStrictEqual(
    chatService.filterRefsForAnswer('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', peakArenaRefs).map(ref => ref.entryId),
    [10447, 10449, 10448],
    'article-title queries should keep same-article rows and drop glossary or quick-start distractions'
  );
  const peakArenaLiteral = chatService.getLiteralKnowledgeReply(
    '\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565',
    chatService.filterRefsForAnswer('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', peakArenaRefs)
  );
  assert.strictEqual(
    peakArenaLiteral.includes('\u9802\u4e0a\u6c7a\u6226'),
    false,
    'literal KB replies should not drift into translation glossary content when the guide article is present'
  );
  assert.strictEqual(
    peakArenaLiteral.includes('Peak Arena Guide'),
    false,
    'literal KB replies for Chinese queries should not mix English title duplicates'
  );
  assert.strictEqual(
    chatService.shouldPreferLiteralKnowledgeDraft(
      '\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565',
      chatService.filterRefsForAnswer('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', peakArenaRefs),
      peakArenaLiteral
    ),
    false,
    'article-style guide queries should not bypass AI with literal KB output'
  );

  const peakArenaArticleWithAssetPathRefs = [
    {
      entryId: 10447,
      documentId: 76,
      rowIndex: 162,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 7',
        '\u7ade\u6280\u573a\u76ee\u524d\u5305\u62ec\uff1a: \\\\172.16.0.180\\share\\screenshots\\peak-arena',
        '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: \u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565',
      ].join('\n'),
      lexicalScore: 39,
      semanticScore: 0,
      score: 0.39,
    },
    {
      entryId: 10450,
      documentId: 76,
      rowIndex: 165,
      matchText: [
        'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
        'Row: 10',
        '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: 2.\u5f00\u542f\u540e\u4f1a\u6301\u7eed 3 \u5929\uff0c\u5468\u4e94\u5173\u95ed',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0,
      score: 0.16,
    },
    {
      entryId: 10649,
      documentId: 76,
      rowIndex: 364,
      matchText: [
        'Sheet: \u5feb\u901f\u4e0a\u624b',
        'Rows: 167-184',
        '\u6bcf\u65e5\u5fc5\u505a',
        '\u5dc5\u5cf0\u7ade\u6280\u573a\u6bcf\u5929\u70b9\u8d5e 3 \u6b21',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0,
      score: 0.16,
    },
  ];
  assert.deepStrictEqual(
    chatService.filterRefsForAnswer('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', peakArenaArticleWithAssetPathRefs).map(ref => ref.entryId),
    [10447, 10450],
    'title rows with screenshot paths should still anchor the same article instead of being dropped as planning noise'
  );

  const directKnowledgeRefs = [{
    matchText: [
      'sheet: 技能',
      '极速奇袭',
      '基础效果：对前排造成伤害',
      '二星效果：追加破甲',
      '三星效果：追加眩晕',
      'asset path: /kb-images/skill-1.png',
    ].join('\n'),
  }];
  assert.strictEqual(
    chatService.getDirectKnowledgeReply('极速奇袭', directKnowledgeRefs),
    [
      '极速奇袭',
      '基础效果：对前排造成伤害',
      '二星效果：追加破甲',
      '三星效果：追加眩晕',
    ].join('\n')
  );

  const localizedGuideRefs = [{
    matchText: [
      'Sheet: \u7ade\u6280\u573a\u96c6\u5408',
      'Row: 162',
      '\u5dc5\u5cf0\u7ade\u6280\u573a Peak Arena: \u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565',
      '\u5c0f\u8de8\u670d: Peak Arena Guide',
      'E: \u5dc5\u5cf0\u7ade\u7af6\u6280\u5834\u653b\u7565',
      'F: \u9802\u4e0a\u6c7a\u6226\u653b\u7565',
      'G: \uc815\uc0c1 \uc544\ub808\ub098 \uacf5\ub7b5',
    ].join('\n'),
    lexicalScore: 39,
    semanticScore: 0,
    score: 0.39,
  }];
  assert.strictEqual(
    chatService.getLiteralKnowledgeReply('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', localizedGuideRefs),
    '',
    'literal KB replies should stay empty when only a single title line is available after removing translated duplicates'
  );

  const messages = chatService.buildMessages(
    { display_name: 'Tester', persona: 'Persona block' },
    [],
    '极速奇袭',
    'KB_CONTEXT',
    'KG_FACTS',
    'LIVE_RESULTS',
    { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' }
  );
  const systemPrompt = messages[0].content;
  assert.ok(systemPrompt.indexOf('LIVE_RESULTS') < systemPrompt.indexOf('Tester'));
  assert.ok(systemPrompt.indexOf('KB_CONTEXT') < systemPrompt.indexOf('Tester'));
  assert.ok(systemPrompt.indexOf('KG_FACTS') < systemPrompt.indexOf('Tester'));
  assert.ok(systemPrompt.includes('灯塔-国内'));

  const englishMessages = chatService.buildMessages(
    { display_name: 'Tester', persona: 'Persona block' },
    [],
    'How do beginners start?',
    'KB_CONTEXT',
    'KG_FACTS',
    '',
    { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' }
  );
  assert.ok(!englishMessages[0].content.includes('灯塔-国内'));
  assert.ok(englishMessages[0].content.includes('Last Light'));

  const generalMessages = chatService.buildMessages(
    { display_name: 'Tester', persona: 'Persona block' },
    [],
    '世界杯的季军赛是什么时候？',
    '',
    '',
    '',
    { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' },
    { domainMode: 'general' }
  );
  assert.ok(!generalMessages[0].content.includes('Current bound game/version context'));
  assert.ok(generalMessages[0].content.includes('If the current question is not about the game'));
  assert.strictEqual(chatService.isArticleStyleGuideQuery('巅峰竞技场攻略'), true);
  assert.strictEqual(chatService.isArticleStyleGuideQuery('极速奇袭三星效果'), false);

  const guideMessages = chatService.buildMessages(
    { display_name: 'Tester', persona: 'Persona block' },
    [],
    '巅峰竞技场攻略',
    'KB_CONTEXT',
    'KG_FACTS',
    '',
    { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' }
  );
  assert.ok(guideMessages[0].content.includes('preserve the main sections and details instead of compressing it into a brief summary'));
  assert.ok(guideMessages[0].content.includes('opening time, participation requirements, rules, rewards'));
  assert.ok(!guideMessages[0].content.includes('Prefer one direct lead sentence plus a short continuation.'));

  const collapsedReply = chatService.postProcessAssistantReply(
    '【开启时间】\n- 每周二开启\n- 持续3天',
    '极速奇袭基础效果',
    [{ entryId: 1 }],
    'zh-CN'
  );
  assert.strictEqual(collapsedReply, '【开启时间】：每周二开启；持续3天');

  const guideReply = chatService.postProcessAssistantReply(
    '【开启时间】\n- 每周二开启\n- 持续3天',
    '巅峰竞技场攻略',
    [{ entryId: 1 }],
    'zh-CN'
  );
  assert.strictEqual(guideReply, '【开启时间】\n- 每周二开启\n- 持续3天');

  assert.deepStrictEqual(
    chatService.extractTrailingHeroCardBlock('这是介绍文案\n\n```herocard\n{"name":"卡西迪"}\n```'),
    {
      prose: '这是介绍文案',
      heroCardBlock: '```herocard\n{"name":"卡西迪"}\n```',
    }
  );
  assert.deepStrictEqual(
    chatService.extractTrailingHeroCardBlock('只有普通回答'),
    {
      prose: '只有普通回答',
      heroCardBlock: '',
    }
  );
  assert.strictEqual(
    chatService.buildHeroCardFallbackReply({ name: '维克多' }),
    '先看下维克多的卡片。'
  );
  assert.strictEqual(
    chatService.sanitizeHeroCardVisibleReply('维克多的技能是英勇冲锋，基础效果很强。', { name: '维克多' }, 'zh-CN'),
    ''
  );
  assert.strictEqual(
    chatService.sanitizeHeroCardVisibleReply('先给你挂上维克多的卡片', { name: '维克多' }, 'zh-CN'),
    '先给你挂上维克多的卡片。'
  );

  assert.strictEqual(
    chatService.buildHeroCardLeadReply('\u7ef4\u514b\u591a\u7684\u53f0\u8bcd', { name: '\u7ef4\u514b\u591a', quote: '\u542c\u8d77\u6765\u5f88\u5371\u9669\uff0c\u7b97\u6211\u4e00\u4e2a\u3002' }),
    '\u7ef4\u514b\u591a\u7684\u53f0\u8bcd\u5728\u5361\u7247\u91cc\uff0c\u4f60\u76f4\u63a5\u770b\u3002'
  );
  assert.strictEqual(
    chatService.buildHeroCardLeadReply('\u7ef4\u514b\u591a\u503c\u4e0d\u503c\u5f97\u7ec3', { name: '\u7ef4\u514b\u591a' }),
    ''
  );

  llm._setImpl(async () => ({
    content: '更自然一点的回答。\n有哪块想深入了解可以继续问。',
  }));
  try {
    assert.strictEqual(
      await chatService.polishReplyThroughAi(
        { model: null },
        '\u4ecb\u7ecd\u4e00\u4e0b\u5361\u897f\u8fea',
        '\u5361\u897f\u8fea\u662f\u4e00\u4e2a\u8f93\u51fa\u82f1\u96c4\u3002\n\n```herocard\n{"name":"\u5361\u897f\u8fea"}\n```',
        {
          history: [{ role: 'assistant', content: '\u8fd9\u662f\u4e4b\u524d\u90a3\u79cd\u673a\u68b0\u56de\u7b54\u3002' }],
          preferredLocale: 'zh-CN',
        }
      ),
      '\u5361\u897f\u8fea\u662f\u4e00\u4e2a\u8f93\u51fa\u82f1\u96c4\u3002\n\n```herocard\n{"name":"\u5361\u897f\u8fea"}\n```'
    );
  } finally {
    llm._setImpl(null);
  }

  llm._setImpl(async () => {
    throw new Error('mock llm unavailable');
  });
  try {
    assert.strictEqual(
      await chatService.polishReplyThroughAi(
        { model: null },
        'PVP\u57fa\u5730\u9632\u5b88\u8981\u70b9',
        [
          'PVP\u57fa\u5730\u9632\u5b88\u8981\u70b9',
          '\u5f53\u5176\u4ed6\u6307\u6325\u5b98\u8fdb\u653b\u4f60\u7684\u57fa\u5730\u65f6,\u4f5c\u4e3a\u9632\u5b88\u65b9,\u4f60\u7684\u90e8\u5206\u58eb\u5175\u4e0d\u4f1a\u7acb\u523b\u9635\u4ea1,\u800c\u662f\u4f1a\u4ee5\u300c\u91cd\u4f24\u300d\u72b6\u6001\u8fdb\u5165\u533b\u9662\u3002',
          '\u533b\u9662\u80fd\u5bb9\u7eb3\u7684\u4f24\u5175\u6570\u91cf\u6709\u9650,\u4e00\u65e6\u8d85\u51fa,\u591a\u4f59\u7684\u58eb\u5175\u5c31\u4f1a\u76f4\u63a5\u9635\u4ea1\u3002',
          '\u900f\u8fc7\u5347\u7ea7\u533b\u9662\u6216\u8005\u7814\u7a76\u53d1\u5c55\u3001\u9632\u5fa1\u5de5\u4e8b\u7b49\u79d1\u6280\u6765\u589e\u52a0\u5bb9\u91cf,\u53ef\u4ee5\u6709\u6548\u51cf\u5c11\u635f\u5931,\u4fdd\u7559\u66f4\u591a\u6218\u529b\u3002',
        ].join('\n'),
        {
          refs: [{ entryId: 10442 }],
          preferredLocale: 'zh-CN',
        }
      ),
      [
        '\u53ef\u4ee5\u76f4\u63a5\u770b\u8fd9\u51e0\u4e2a\u8981\u70b9\uff1a',
        '- \u5f53\u5176\u4ed6\u6307\u6325\u5b98\u8fdb\u653b\u4f60\u7684\u57fa\u5730\u65f6,\u4f5c\u4e3a\u9632\u5b88\u65b9,\u4f60\u7684\u90e8\u5206\u58eb\u5175\u4e0d\u4f1a\u7acb\u523b\u9635\u4ea1,\u800c\u662f\u4f1a\u4ee5\u300c\u91cd\u4f24\u300d\u72b6\u6001\u8fdb\u5165\u533b\u9662\u3002',
        '- \u533b\u9662\u80fd\u5bb9\u7eb3\u7684\u4f24\u5175\u6570\u91cf\u6709\u9650,\u4e00\u65e6\u8d85\u51fa,\u591a\u4f59\u7684\u58eb\u5175\u5c31\u4f1a\u76f4\u63a5\u9635\u4ea1\u3002',
        '- \u900f\u8fc7\u5347\u7ea7\u533b\u9662\u6216\u8005\u7814\u7a76\u53d1\u5c55\u3001\u9632\u5fa1\u5de5\u4e8b\u7b49\u79d1\u6280\u6765\u589e\u52a0\u5bb9\u91cf,\u53ef\u4ee5\u6709\u6548\u51cf\u5c11\u635f\u5931,\u4fdd\u7559\u66f4\u591a\u6218\u529b\u3002',
      ].join('\n')
    );
  } finally {
    llm._setImpl(null);
  }

  let capturedMessages = null;
  llm._setImpl(async (llmMessages) => {
    capturedMessages = llmMessages;
    return { content: 'ok' };
  });
  try {
    await chatService.getResolvedFollowupReply(
      { model: null, display_name: 'Tester', persona: 'Persona block' },
      '三星呢',
      'zh-CN',
      {
        versionContext: { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' },
        domainMode: 'game',
      }
    );
    assert.ok(capturedMessages[0].content.includes('灯塔-国内'));
    assert.ok(capturedMessages[0].content.includes('Do not ask the user to repeat which person, game, brand, or topic they mean.'));

    await chatService.getNoHitEntityReply(
      { model: null, display_name: 'Tester', persona: 'Persona block' },
      '特斯拉',
      'zh-CN',
      {
        versionContext: { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' },
        domainMode: 'game',
      }
    );
    assert.ok(capturedMessages[0].content.includes('Do not invent any game hero profile'));

    await chatService.getSearchGroundedReply(
      { model: null, display_name: 'Tester', persona: 'Persona block' },
      '世界杯季军赛什么时候？',
      [{ title: 'Official Schedule', snippet: '2026-07-18 20:00 kickoff', url: 'https://example.com' }],
      'zh-CN',
      { domainMode: 'general' }
    );
    assert.ok(capturedMessages[0].content.includes('When web search results are provided, answer directly from those results first.'));
  } finally {
    llm._setImpl(null);
  }

  let heroMessages = null;
  llm._setImpl(async (llmMessages) => {
    heroMessages = llmMessages;
    return {
      content: '索尼克更偏前排承伤和突脸输出，值不值得练得看你现在缺不缺这个位。',
    };
  });
  try {
    const heroReply = await chatService.getHeroCardGroundedReply(
      { model: null, display_name: 'Tester', persona: 'Persona block' },
      '索尼克值不值得练',
      {
        name: '索尼克',
        title: '极速奇袭',
        faction: '守护者',
        career: '前排突进',
        rarity: 'S+',
        quote: '跟上我的节奏。',
        skills: [
          {
            index: 1,
            name: '极速冲击',
            description: '对单体造成高额物理伤害',
          },
          {
            index: 2,
            name: '旋风防护',
            description: '给前排提供承伤与减伤',
            isCore: true,
          },
        ],
      },
      [
        { role: 'user', content: '先给我看看索尼克' },
        { role: 'assistant', content: '上轮已经给了简单介绍。' },
      ],
      'zh-CN',
      {
        versionContext: {
          display_name: '灯塔-国内',
          game_name: 'Last Light',
          code: 'lighthouse_cn',
        },
        domainMode: 'game',
      }
    );
    assert.strictEqual(
      heroReply,
      '索尼克更偏前排承伤和突脸输出，值不值得练得看你现在缺不缺这个位。'
    );
    assert.ok(heroMessages[0].content.includes('Do not mechanically enumerate every card field'));
    assert.ok(heroMessages[0].content.includes('fixed lead-ins like'));
    assert.ok(heroMessages[1].content.includes('Current user question:'));
    assert.ok(heroMessages[1].content.includes('Recent conversation:'));
    assert.ok(heroMessages[1].content.includes('Hero card JSON:'));
  } finally {
    llm._setImpl(null);
  }

  console.log('chatService tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
