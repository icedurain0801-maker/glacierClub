const assert = require('assert');

const heroCardService = require('../src/services/heroCardService');

const {
  buildHeroCardPayload,
  buildAggregateSkillSpriteCrops,
} = heroCardService.__test__;

function buildSingleAggregateTableCard() {
  const summaryEntry = {
    raw: {
      英雄级别: 'S+',
      英雄名称: 'Valkyra',
    },
    targetSheet: 'Valkyra',
    aliases: ['Valkyra'],
  };

  const detailEntries = [
    {
      raw: { 项目: '技能icon' },
      images: ['/kb-images/1/75/5_15_4_1.png'],
    },
    { raw: { 对应位置: '技能1', 项目: '名称', 中文: 'Skill One' }, images: [] },
    { raw: { 对应位置: '技能1', 项目: '技能详情', 中文: 'Skill One Desc' }, images: [] },
    { raw: { 对应位置: '技能2', 项目: '名称', 中文: 'Skill Two' }, images: [] },
    { raw: { 对应位置: '技能2', 项目: '技能详情', 中文: 'Skill Two Desc' }, images: [] },
    { raw: { 对应位置: '技能3', 项目: '名称', 中文: 'Skill Three' }, images: [] },
    { raw: { 对应位置: '技能3', 项目: '技能详情', 中文: 'Skill Three Desc' }, images: [] },
    { raw: { 对应位置: '技能4', 项目: '名称', 中文: 'Skill Four' }, images: [] },
    { raw: { 对应位置: '技能4', 项目: '技能详情', 中文: 'Skill Four Desc' }, images: [] },
  ];

  return buildHeroCardPayload(summaryEntry, detailEntries);
}

function main() {
  const crops = buildAggregateSkillSpriteCrops('/kb-images/1/75/5_15_4_1.png', 4);
  assert.strictEqual(crops.length, 4);
  assert.ok(crops.every(crop => crop.width > 0 && crop.height > 0));
  assert.ok(crops[1].x > crops[0].x);
  assert.ok(crops[2].x > crops[1].x);

  const card = buildSingleAggregateTableCard();
  assert.strictEqual(card.skills.length, 4);
  assert.ok(card.skills.every(skill => skill.imageUrl === '/kb-images/1/75/5_15_4_1.png'));
  assert.ok(card.skills.every(skill => skill.imageCrop && skill.imageCrop.width > 0));
  assert.ok(card.skills[1].imageCrop.x > card.skills[0].imageCrop.x);
  assert.ok(card.skills[2].imageCrop.x > card.skills[1].imageCrop.x);

  console.log('heroCardService sprite crop tests passed');
}

main();
