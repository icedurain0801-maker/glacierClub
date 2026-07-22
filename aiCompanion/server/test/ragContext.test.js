const assert = require('assert');
const ragContext = require('../src/services/ragContext');

function main() {
  const casualGreetingRefs = [
    { entryId: 5900, score: 0.351, snippet: '命运之轮图片和立绘资源整理', images: ['/kb-images/1/a.png'] },
    { entryId: 6064, score: 0.348, snippet: '英雄资料配图说明', images: ['/kb-images/1/b.png'] },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('你好', casualGreetingRefs),
    [],
    'casual greetings should not surface random refs or images'
  );

  const ambiguousGuideRefs = [
    { entryId: 5659, score: 0.476, snippet: '英雄头像与参数资料', images: ['/kb-images/1/wrong.png'] },
    { entryId: 6521, score: 0.469, snippet: '技能图标与数值说明', images: ['/kb-images/1/wrong-2.png'] },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('有什么攻略推荐', ambiguousGuideRefs),
    [],
    'ambiguous guide requests should ask for specifics instead of surfacing random refs or images'
  );

  const keywordMatchedRefs = [
    { entryId: 101, score: 0.361, snippet: '卡西迪技能：神射、战术翻滚、午时已到', images: ['/kb-images/1/cassidy.png'] },
    { entryId: 102, score: 0.344, snippet: '其他无关条目', images: ['/kb-images/1/other.png'] },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('卡西迪技能', keywordMatchedRefs).map(item => item.entryId),
    [101],
    'weak-score refs should still survive when query and snippet clearly overlap'
  );

  const weakQuoteOnlyRefs = [
    {
      entryId: 9443,
      score: 0.12,
      lexicalScore: 12,
      semanticScore: 0,
      snippet: 'Sheet: 玫瑰女郎_萝斯\n项目: 英雄台词\n中文: 你...好像一直在看着我？',
      matchText: [
        'Sheet: 玫瑰女郎_萝斯',
        '项目: 英雄台词',
        '中文: 你...好像一直在看着我？',
        '角色背景版（金色为S+用，紫色为S用，蓝色为A用）: 核心技能需带CS提示',
      ].join('\n'),
      images: ['/kb-images/1/75/13_8_4_1.png'],
    },
    {
      entryId: 11394,
      score: 0.51,
      lexicalScore: 51,
      semanticScore: 0.34,
      snippet: '【圣武好像一直处于下风的讨论贴】',
      matchText: '【圣武好像一直处于下风的讨论贴】\n修罗火女队伍、公爵女神队、大娃风息队，讨论为什么一直处于下风。',
      images: [],
    },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('圣武好像一直处于下风怎么办', weakQuoteOnlyRefs).map(item => item.entryId),
    [11394],
    'quote-only rows with attached art should be suppressed for unrelated gameplay questions'
  );

  assert.strictEqual(
    ragContext.shouldSuppressWeakRef('圣武好像一直处于下风怎么办', weakQuoteOnlyRefs[0]),
    true,
    'weak quote-only asset rows should be suppressed'
  );

  const strongSemanticRefs = [
    { entryId: 201, score: 0.472, snippet: '阵营与职业关系说明', images: [] },
    { entryId: 202, score: 0.331, snippet: '无关条目', images: [] },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('角色职业怎么分', strongSemanticRefs).map(item => item.entryId),
    [201],
    'strong semantic hits should be preserved'
  );

  const lexicalRescueRefs = [
    {
      entryId: 301,
      score: 0.18,
      lexicalScore: 18,
      snippet: '...同盟最多可容纳100名成员，并分为5个阶级...',
      matchText: 'Sheet: 联盟\n同盟最多可容纳100名成员，并分为5个阶级。',
      images: [],
    },
    {
      entryId: 302,
      score: 0.21,
      lexicalScore: 2,
      snippet: '每个联盟最多可派出20名正式成员和10名替补成员',
      matchText: '每个联盟最多可派出20名正式成员和10名替补成员',
      images: [],
    },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('联盟最多可以有多少人', lexicalRescueRefs).map(item => item.entryId),
    [301],
    'lexical rescue should keep the exact knowledge hit even when vector score is weak'
  );

  const snippet = ragContext.buildRelevantSnippet(
    [
      'Sheet: 联盟',
      'Rows: 19-35',
      '同盟是玩家聚集的地方。',
      '同盟最多可容纳100名成员，并分为5个阶级。',
      'R5 盟主，R4 军官。',
    ].join('\n'),
    '联盟最多可以有多少人'
  );
  assert(
    snippet.includes('100名成员'),
    'relevant snippet should be centered around the matched fact instead of the first 200 chars'
  );

  assert(
    ragContext.scoreLexicalMatch('联盟最多可以有多少人', '同盟最多可容纳100名成员，并分为5个阶级。') > 0,
    'lexical scoring should reward overlapping knowledge rows'
  );
  assert(
    ragContext.scoreLexicalMatch('联盟最多可以有多少人', '联盟最多可拥有 6 座城市。')
      < ragContext.scoreLexicalMatch('联盟最多可以有多少人', '同盟最多可容纳100名成员，并分为5个阶级。'),
    'people-count questions should rank member-capacity rows above city-capacity rows'
  );

  const rerankedRefs = ragContext.rerankRefsByIntent('联盟最多可以有多少人', [
    {
      entryId: 401,
      score: 0.43,
      semanticScore: 0.43,
      lexicalScore: 43,
      matchText: '同盟最多可容纳100名成员，并分为5个阶级。',
      snippet: '同盟最多可容纳100名成员，并分为5个阶级。',
      images: [],
    },
    {
      entryId: 402,
      score: 0.42,
      semanticScore: 0.42,
      lexicalScore: 42,
      matchText: '每个联盟最多可派出20名正式成员和10名替补成员。',
      snippet: '每个联盟最多可派出20名正式成员和10名替补成员。',
      images: [],
    },
    {
      entryId: 403,
      score: 0.419,
      semanticScore: 0.419,
      lexicalScore: 33,
      matchText: '联盟最多可拥有6座城市。',
      snippet: '联盟最多可拥有6座城市。',
      images: [],
    },
  ]);
  assert.deepStrictEqual(
    rerankedRefs.map(item => item.entryId),
    [401],
    'intent rerank should keep the member-capacity fact and suppress battle/city scoped distractions'
  );

  const metadataVsGuideRefs = ragContext.rerankRefsByIntent('PVP基地防守要点', [
    {
      entryId: 501,
      score: 0.414,
      semanticScore: 0.414,
      lexicalScore: 11,
      matchText: [
        'Sheet: Schedule',
        'Row: 8',
        'Category: Basic Guides',
        'Guide Title: PVP基地防守要点',
        'Status: Done',
        'Publish Time: 2026/5/22',
        'Reference: https://example.com/doc',
        'Asset Path: \\\\172.16.0.180\\share\\pvp',
      ].join('\n'),
      snippet: 'Guide Title: PVP基地防守要点',
      images: [],
    },
    {
      entryId: 502,
      score: 0.11,
      semanticScore: 0,
      lexicalScore: 11,
      matchText: [
        'Sheet: PVP攻略',
        'Rows: 4-22',
        'PVP基地防守要点',
        '一、士兵死伤规则',
        '当其他指挥官进攻你的基地时，作为防守方，你的部分士兵不会立刻阵亡，而是会以重伤状态进入医院。',
        '医院能容纳的伤兵数量有限，一旦超出，多余的士兵就会直接阵亡。',
        '二、保命手段',
        '1. 开启保护盾：最稳妥的方式，可完全避免攻击。',
        '2. 请盟友支援：遭遇强敌时，呼叫盟友增援。',
      ].join('\n'),
      snippet: 'PVP基地防守要点',
      images: [],
    },
  ]);
  assert.strictEqual(
    metadataVsGuideRefs[0].entryId,
    502,
    'guide body should rank above schedule metadata when both mention the same title'
  );

  assert.strictEqual(
    ragContext.hasTitleStyleMatch('巅峰竞技场攻略', '巅峰竞技场攻略 / Peak Arena Guide'),
    true,
    'title matching should preserve bilingual title rows'
  );

  const promptExcerpt = ragContext.buildPromptExcerpt(
    [
      'Sheet: PVP攻略',
      'Rows: 4-22',
      'PVP基地防守要点',
      '一、士兵死伤规则',
      '当其他指挥官进攻你的基地时，作为防守方，你的部分士兵不会立刻阵亡，而是会以重伤状态进入医院。',
      '医院能容纳的伤兵数量有限，一旦超出，多余的士兵就会直接阵亡。',
      '二、保命手段',
      '1. 开启保护盾：最稳妥的方式，可完全避免攻击。',
      '2. 请盟友支援：遭遇强敌时，呼叫盟友增援。',
    ].join('\n'),
    'PVP基地防守要点',
    300
  );
  assert(
    promptExcerpt.includes('一、士兵死伤规则') && promptExcerpt.includes('二、保命手段'),
    'prompt excerpt should carry the substantive guide body instead of only metadata or title lines'
  );

  const contextBlock = ragContext.toContextBlock([
    {
      entryId: 601,
      query: 'PVP基地防守要点',
      snippet: 'meta',
      matchText: [
        'Sheet: 百科UI需求',
        'Row: 9',
        'Context: 基础攻略百科UI需求',
        '百科分类: PVP基地防守要点',
        '贴文内容参考: https://example.com/post',
        '内容主题: 基地防守',
      ].join('\n'),
      images: [],
    },
    {
      entryId: 602,
      query: 'PVP基地防守要点',
      snippet: 'guide',
      matchText: [
        'Sheet: PVP攻略',
        'Rows: 4-22',
        'PVP基地防守要点',
        '一、士兵死伤规则',
        '当其他指挥官进攻你的基地时，作为防守方，你的部分士兵不会立刻阵亡，而是会以重伤状态进入医院。',
      ].join('\n'),
      images: [],
    },
  ]);
  assert(
    contextBlock.includes('一、士兵死伤规则') && !contextBlock.includes('百科UI需求'),
    'context block should prefer substantive guide content and skip metadata-only sheets when guide content exists'
  );

  assert.strictEqual(
    ragContext.hasTitleStyleMatch('介绍一下PVP基地防守要点', [
      'Sheet: PVP攻略',
      'Rows: 4-22',
      'PVP基地防守要点',
    ].join('\n')),
    true,
    'title-style matching should still detect the KB title when the user adds natural-language lead-in'
  );
  assert.strictEqual(
    ragContext.hasTitleStyleMatch('介绍一下PVP基地防守要点', [
      'Sheet: 末日危城',
      'Row: 39',
      '关闭基地城防：避免因防守本基地而造成部队过度损耗。',
    ].join('\n')),
    false,
    'title-style matching should not treat semantically related but differently titled content as the same KB article'
  );
  assert.strictEqual(
    ragContext.isGenericBeginnerGuideQuery('新手入门怎么玩'),
    true,
    'generic beginner onboarding queries should be detected explicitly'
  );
  assert(
    ragContext.buildLexicalSearchTokens('新手入门怎么玩').includes('快速上手'),
    'generic beginner onboarding queries should expand to quick-start style guide terms'
  );
  assert(
    ragContext.scoreLexicalMatch('新手入门怎么玩', '快速上手攻略：每日必做') > 0,
    'generic beginner onboarding queries should lexically match quick-start guide titles'
  );

  const beginnerGuideRefs = ragContext.rerankRefsByIntent('新手入门怎么玩', [
    {
      entryId: 701,
      score: 0.42,
      semanticScore: 0.42,
      lexicalScore: 25,
      matchText: '新手竞技场：每天可参与 5 次，胜利可拿积分。',
      snippet: '新手竞技场：每天可参与 5 次，胜利可拿积分。',
      images: [],
    },
    {
      entryId: 702,
      score: 0.39,
      semanticScore: 0.39,
      lexicalScore: 20,
      matchText: [
        '新手入门指南',
        '开局先跟主线任务走，优先升级核心建筑和主力队伍。',
        '前期资源优先保证体力、建筑升级和主力培养。',
      ].join('\n'),
      snippet: '新手入门指南',
      images: [],
    },
  ]);
  assert.strictEqual(
    beginnerGuideRefs[0].entryId,
    702,
    'generic beginner guide queries should rank broad onboarding guidance above specific arena topics'
  );

  const quickStartGuideRefs = ragContext.rerankRefsByIntent('新手入门怎么玩', [
    {
      entryId: 703,
      score: 0.36,
      semanticScore: 0.36,
      lexicalScore: 30,
      matchText: '新手竞技场：每天可参与 5 次，胜利可拿积分。',
      snippet: '新手竞技场：每天可参与 5 次，胜利可拿积分。',
      images: [],
    },
    {
      entryId: 704,
      score: 0.31,
      semanticScore: 0.31,
      lexicalScore: 16,
      matchText: [
        '快速上手攻略：每日必做',
        '每日必做：优先领取体力、VIP 点数、每日免费礼包。',
        '推荐日常：货车、军备竞赛、竞技场点赞都别漏。',
      ].join('\n'),
      snippet: '快速上手攻略：每日必做',
      images: [],
    },
  ]);
  assert.strictEqual(
    quickStartGuideRefs[0].entryId,
    704,
    'quick-start guide bodies should outrank specific arena entries for broad beginner questions'
  );

  assert.strictEqual(
    ragContext.isGenericBeginnerGuideQuery('\u65b0\u624b\u7ade\u6280\u573a\u653b\u7565'),
    false,
    'specific beginner-topic questions should not be downgraded into broad onboarding queries'
  );
  assert.strictEqual(
    ragContext.buildLexicalSearchTokens('\u65b0\u624b\u7ade\u6280\u573a\u653b\u7565').includes('quick start'),
    false,
    'specific beginner-topic queries should not expand into unrelated quick-start guide terms'
  );

  const articleGuideRefs = [
    {
      entryId: 801,
      documentId: 76,
      rowIndex: 162,
      score: 0.68,
      semanticScore: 0.68,
      lexicalScore: 39,
      matchText: [
        'Sheet: 竞技场集合',
        'Row: 7',
        '巅峰竞技场 巅峰竞技场  Peak Arena: 巅峰竞技场攻略',
      ].join('\n'),
      snippet: '巅峰竞技场攻略',
      images: [],
    },
    {
      entryId: 802,
      documentId: 76,
      rowIndex: 163,
      score: 0.16,
      semanticScore: 0.16,
      lexicalScore: 0,
      matchText: [
        'Sheet: 竞技场集合',
        'Row: 8',
        '巅峰竞技场 巅峰竞技场  Peak Arena: 【开启时间】',
      ].join('\n'),
      snippet: '【开启时间】',
      images: [],
    },
    {
      entryId: 803,
      documentId: 76,
      rowIndex: 164,
      score: 0.18,
      semanticScore: 0.18,
      lexicalScore: 0,
      matchText: [
        'Sheet: 竞技场集合',
        'Row: 9',
        '巅峰竞技场 巅峰竞技场  Peak Arena: 1.巅峰竞技场会在每周二开启',
      ].join('\n'),
      snippet: '1.巅峰竞技场会在每周二开启',
      images: [],
    },
    {
      entryId: 804,
      documentId: 76,
      rowIndex: 175,
      score: 0.15,
      semanticScore: 0.15,
      lexicalScore: 0,
      matchText: [
        'Sheet: 竞技场集合',
        'Row: 20',
        '巅峰竞技场 巅峰竞技场  Peak Arena: 【奖励结算】',
      ].join('\n'),
      snippet: '【奖励结算】',
      images: [],
    },
  ];
  assert.deepStrictEqual(
    ragContext.filterRelevantRefs('巅峰竞技场攻略', articleGuideRefs).map(item => item.entryId),
    [801, 802, 803, 804],
    'article-style guide queries should preserve same-article section headers and body rows'
  );
  const articleGuideContextBlock = ragContext.toContextBlock([
    { ...articleGuideRefs[0], query: '巅峰竞技场攻略' },
    { ...articleGuideRefs[1], query: '巅峰竞技场攻略' },
    { ...articleGuideRefs[2], query: '巅峰竞技场攻略' },
    { ...articleGuideRefs[3], query: '巅峰竞技场攻略' },
  ]);
  assert(
    articleGuideContextBlock.includes('【开启时间】')
      && articleGuideContextBlock.includes('1.巅峰竞技场会在每周二开启')
      && articleGuideContextBlock.includes('【奖励结算】'),
    'article-style guide context should keep section headers and body rows instead of collapsing to title-only lines'
  );

  console.log('ragContext tests passed');
}

main();
