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

  llm._setImpl(async () => ({
    content: '更自然一点的回答。\n有哪块想深入了解可以继续问。',
  }));
  try {
    assert.strictEqual(
      await chatService.polishReplyThroughAi(
        { model: null },
        '介绍一下卡西迪',
        '卡西迪是一个输出英雄。\n\n```herocard\n{"name":"卡西迪"}\n```',
        {
          history: [{ role: 'assistant', content: '这是之前那种机械回答。' }],
          preferredLocale: 'zh-CN',
        }
      ),
      '更自然一点的回答。\n\n```herocard\n{"name":"卡西迪"}\n```'
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
