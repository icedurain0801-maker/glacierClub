const assert = require('assert');

const heroCardService = require('../src/services/heroCardService');

const {
  buildHeroCardPayload,
} = heroCardService.__test__;

function main() {
  const summaryEntry = {
    raw: {
      需求英雄: '明日之弓_萨吉塔Sagitta',
      跳转: '明日之弓_萨吉塔',
      英雄级别: 'S+',
    },
    targetSheet: '明日之弓_萨吉塔',
    aliases: ['明日之弓_萨吉塔Sagitta', '明日之弓', '萨吉塔', 'Sagitta'],
  };

  const detailEntries = [
    { raw: { 项目: '角色名字', 中文: '萨吉塔' }, images: [] },
    { raw: { 项目: '角色头像' }, images: [] },
    {
      raw: { 项目: '角色立绘' },
      images: [
        '/kb-images/1/75/17_0_0_1.png',
        '/kb-images/1/75/17_1_14_1.png',
        '/kb-images/1/75/17_6_6_1.png',
      ],
    },
    {
      raw: { 对应位置: '技能1', 项目: '名称', 中文: '狩猎之箭' },
      images: ['/kb-images/1/75/17_15_7_1.png'],
    },
    {
      raw: { 对应位置: '技能1', 项目: '技能详情', 中文: '对敌方造成伤害。' },
      images: [],
    },
    {
      raw: { 对应位置: '技能4', 项目: '名称', 中文: '无此技能' },
      images: [],
    },
    {
      raw: { 对应位置: '技能4', 项目: '技能详情', 中文: '无此技能' },
      images: [],
    },
  ];

  const card = buildHeroCardPayload(summaryEntry, detailEntries);
  assert.strictEqual(card.name, '萨吉塔');
  assert.strictEqual(card.avatarUrl, '/kb-images/1/75/17_1_14_1.png');
  assert.strictEqual(card.skills.length, 1);
  assert.strictEqual(card.skills[0].name, '狩猎之箭');

  console.log('heroCardService regression tests passed');
}

main();
