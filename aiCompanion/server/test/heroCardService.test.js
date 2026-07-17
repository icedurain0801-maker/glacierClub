const assert = require('assert');

const heroCardService = require('../src/services/heroCardService');

const {
  looksLikeHeroDetailQuery,
  collectHeroAliases,
  scoreHeroCandidate,
  buildHeroCardPayload,
  parseStarLevel,
  extractBaseSkillDescription,
  extractSkillDetailSections,
  selectAggregateSkillIcons,
  selectCareerIcon,
  findBestMatchingSkill,
  isSkillContextFollowupQuery,
  findSkillFromHistory,
  formatSkillReply,
  formatHeroStarListReply,
  isAllSkillsQuery,
  shouldCarryHeroFromHistory,
  isHeroProfileIntent,
  shouldReturnHeroCardRequest,
  extractHeroNameFromAssistantReply,
  isValidHeroNameCandidate,
} = heroCardService.__test__;

function buildFixtureCard() {
  const summaryEntry = {
    raw: {
      英雄级别: 'S+',
      英雄名称: '蔷薇',
    },
    targetSheet: '末日狂花-蔷薇',
    aliases: ['蔷薇'],
  };

  const detailEntries = [
    { raw: { 项目: '角色称号', 中文: '末日狂花' }, images: [] },
    { raw: { 项目: '角色名字', 中文: '蔷薇' }, images: [] },
    { raw: { 项目: '角色阵营', 中文: '守护者' }, images: [] },
    { raw: { 项目: '角色职业', 中文: '能承担更多伤害' }, images: ['/kb-images/1/69/career.png'] },
    { raw: { 项目: '星级（S+/S/A）', 中文: 'S+' }, images: [] },
    { raw: { 项目: '角色头像' }, images: ['/kb-images/1/69/avatar.png'] },
    { raw: { 项目: '英雄台词', 中文: '跟我走，否则会不得好死。' }, images: [] },
    {
      raw: { 项目: '技能Icon' },
      images: [
        '/kb-images/1/69/1354_1.png',
        '/kb-images/1/69/1354_2.png',
        '/kb-images/1/69/1354_3.png',
        '/kb-images/1/69/1354_4.png',
        '/kb-images/1/69/1354_5.png',
      ],
    },
    {
      raw: {
        项目: '技能名称',
        中文: '决意突袭',
        英文: '铁壁统御',
        日语: '夜色庇护',
        韩语: '战意觉醒',
      },
      images: [],
    },
    {
      raw: {
        项目: '技能基础效果',
        中文: '对敌方单体造成511%攻击的物理伤害',
        英文: 'Reduces Physical DMG taken by front-row allies by 29% for 1 turn',
        日语: '战斗中，降低我方前排单位受到的所有伤害7%',
        韩语: '生命、攻击、防御+20%，速度+40',
      },
      images: [],
    },
    {
      raw: {
        项目: '一星效果',
        中文: '额外造成30%物理伤害',
        英文: 'Reduces Physical DMG taken by an additional 2%',
        日语: '额外降低受到的所有伤害7%',
        韩语: '通用技能没有升星加成',
      },
      images: [],
    },
    {
      raw: {
        项目: '二星效果',
        中文: '额外造成45%物理伤害',
        英文: '攻击次数提升至6次',
        日语: '额外降低受到的所有伤害7%',
        韩语: '通用技能没有升星加成',
      },
      images: [],
    },
    { raw: { 对应位置: '技能1', 项目: '名称', 中文: '决意突袭' }, images: [] },
    { raw: { 对应位置: '技能1', 项目: '技能基础效果', 中文: '对敌方单体造成511%攻击的物理伤害' }, images: [] },
    {
      raw: {
        对应位置: '技能1',
        项目: '技能详情',
        中文: '对敌方单体造成511%攻击的物理伤害\n\n额外造成30%物理伤害\n额外造成45%物理伤害',
      },
      images: [],
    },
    { raw: { 对应位置: '技能2（核心技能）', 项目: '名称', 中文: '铁壁统御' }, images: ['/kb-images/1/69/wrong-per-skill.png'] },
    {
      raw: {
        对应位置: '技能2（核心技能）',
        项目: 'Basic Effects',
        英文: 'Reduces Physical DMG taken by front-row allies by 29% for 1 turn',
      },
      images: [],
    },
    {
      raw: {
        对应位置: '技能2（核心技能）',
        项目: '技能详情',
        中文: '进行4次攻击，每次对敌方随机单位造成155%的物理伤害\n\n额外造成20%的物理伤害\n攻击次数提升至6次\n额外造成45%的物理伤害',
      },
      images: [],
    },
    { raw: { 对应位置: '技能3', 项目: '名称', 中文: '夜色庇护' }, images: [] },
    { raw: { 对应位置: '技能3', 项目: '技能基础效果', 中文: '战斗中，降低我方前排单位受到的所有伤害7%' }, images: [] },
    { raw: { 对应位置: '技能4', 项目: '名称', 中文: '战意觉醒' }, images: [] },
    { raw: { 对应位置: '技能4', 项目: '技能详情', 中文: '生命、攻击、防御+20%，速度+40' }, images: [] },
  ];

  return buildHeroCardPayload(summaryEntry, detailEntries);
}

function main() {
  assert.strictEqual(looksLikeHeroDetailQuery('介绍一下蔷薇'), true);
  assert.strictEqual(looksLikeHeroDetailQuery('你好'), false);
  assert.strictEqual(isHeroProfileIntent('介绍一下萝斯'), true);
  assert.strictEqual(isHeroProfileIntent('她适合什么阵容'), false);
  assert.strictEqual(shouldReturnHeroCardRequest('介绍一下萝斯'), true);
  assert.strictEqual(shouldReturnHeroCardRequest('她适合什么阵容'), false);

  const aliases = collectHeroAliases(
    {
      需求英雄: '特工狂花蔷薇_Viper',
      英雄名称: '蔷薇',
    },
    '末日狂花-蔷薇'
  );
  assert.ok(aliases.includes('蔷薇'));
  assert.ok(scoreHeroCandidate('介绍一下蔷薇', aliases) >= 800);

  const derivedAliases = collectHeroAliases(
    {
      需求英雄: '特工狂花蔷薇_Viper',
    },
    ''
  );
  assert.ok(derivedAliases.includes('蔷薇'));

  assert.strictEqual(parseStarLevel('二星效果是啥样的'), 2);
  assert.strictEqual(parseStarLevel('5星提升'), 5);
  assert.strictEqual(parseStarLevel('满星效果'), 5);

  assert.strictEqual(
    extractBaseSkillDescription('对敌方单体造成511%攻击的物理伤害\n\n额外造成30%物理伤害\n额外造成70%物理伤害'),
    '对敌方单体造成511%攻击的物理伤害'
  );

  assert.deepStrictEqual(
    extractSkillDetailSections('对敌方单体造成511%攻击的物理伤害\n\n额外造成30%物理伤害\n额外造成45%物理伤害'),
    {
      baseEffect: '对敌方单体造成511%攻击的物理伤害',
      upgrades: {
        1: '额外造成30%物理伤害',
        2: '额外造成45%物理伤害',
      },
    }
  );

  assert.deepStrictEqual(
    selectAggregateSkillIcons([
      '/kb-images/1/69/1354_1.png',
      '/kb-images/1/69/1354_2.png',
      '/kb-images/1/69/1354_3.png',
      '/kb-images/1/69/1354_4.png',
      '/kb-images/1/69/1354_5.png',
    ]),
    [
      '/kb-images/1/69/1354_2.png',
      '/kb-images/1/69/1354_3.png',
      '/kb-images/1/69/1354_4.png',
      '/kb-images/1/69/1354_5.png',
    ]
  );

  assert.strictEqual(
    selectCareerIcon([
      '/kb-images/1/69/1344_1.png',
      '/kb-images/1/69/1344_2.png',
      '/kb-images/1/69/1344_3.png',
    ]),
    '/kb-images/1/69/1344_1.png'
  );

  const card = buildFixtureCard();
  assert.strictEqual(card.name, '蔷薇');
  assert.strictEqual(card.title, '末日狂花');
  assert.strictEqual(card.faction, '守护者');
  assert.strictEqual(card.rarity, 'S+');
  assert.strictEqual(card.avatarUrl, '/kb-images/1/69/avatar.png');
  assert.strictEqual(card.careerIconUrl, '/kb-images/1/69/career.png');
  assert.strictEqual(card.skills.length, 4);
  assert.strictEqual(card.skills[0].imageUrl, '/kb-images/1/69/1354_2.png');
  assert.strictEqual(card.skills[0].description, '对敌方单体造成511%攻击的物理伤害');
  assert.strictEqual(card.skills[0].upgrades[2], '额外造成45%物理伤害');
  assert.strictEqual(card.skills[1].imageUrl, '/kb-images/1/69/1354_3.png');
  assert.strictEqual(card.skills[1].isCore, true);
  assert.strictEqual(card.skills[1].description, 'Reduces Physical DMG taken by front-row allies by 29% for 1 turn');
  assert.strictEqual(card.skills[1].upgrades[2], '攻击次数提升至6次');
  assert.strictEqual(card.quote, '跟我走，否则会不得好死。');

  const matchedSkill = findBestMatchingSkill(card.skills, '决意突袭的二星效果是什么？');
  assert.ok(matchedSkill);
  assert.strictEqual(matchedSkill.index, 1);

  assert.strictEqual(isSkillContextFollowupQuery('三星呢'), true);
  assert.strictEqual(isSkillContextFollowupQuery('基础效果呢'), true);
  assert.strictEqual(isAllSkillsQuery('所有技能的二星效果呢'), true);
  assert.strictEqual(isAllSkillsQuery('她的技能二星效果咋样'), false);

  assert.strictEqual(shouldCarryHeroFromHistory('特斯拉'), false);
  assert.strictEqual(shouldCarryHeroFromHistory('介绍一下特斯拉'), false);
  assert.strictEqual(shouldCarryHeroFromHistory('然后呢'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('基础效果'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('适合什么阵容'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('这个英雄怎么样'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('你觉得咋样'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('厉害吗'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('值不值得练'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('那台词呢'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('职业呢'), true);
  assert.strictEqual(shouldCarryHeroFromHistory('技能1呢'), true);

  assert.strictEqual(isValidHeroNameCandidate('卡西迪'), true);
  assert.strictEqual(isValidHeroNameCandidate('这是卡西迪'), false);
  assert.strictEqual(
    extractHeroNameFromAssistantReply('这是卡西迪的英雄档案。\n\n```herocard\n{"name":"卡西迪","skills":[]}\n```'),
    '卡西迪'
  );
  assert.strictEqual(
    extractHeroNameFromAssistantReply('卡西迪「神射」\n基础效果：对前排造成伤害'),
    '卡西迪'
  );

  const historySkill = findSkillFromHistory(card.skills, [
    { role: 'user', content: '决意突袭的二星效果是什么？' },
    { role: 'assistant', content: '蔷薇「决意突袭」\n基础效果：对敌方单体造成511%攻击的物理伤害\n二星效果：额外造成45%物理伤害' },
  ]);
  assert.ok(historySkill);
  assert.strictEqual(historySkill.index, 1);

  assert.strictEqual(
    formatSkillReply(card, matchedSkill, 2),
    '蔷薇「决意突袭」\n基础效果：对敌方单体造成511%攻击的物理伤害\n二星效果：额外造成45%物理伤害'
  );

  assert.strictEqual(
    formatHeroStarListReply(card, 2),
    '蔷薇的二星效果如下：\n- 决意突袭：额外造成45%物理伤害\n- 铁壁统御：攻击次数提升至6次\n- 夜色庇护：额外降低受到的所有伤害7%\n- 战意觉醒：通用技能没有升星加成'
  );

  console.log('heroCardService tests passed');
}

main();
