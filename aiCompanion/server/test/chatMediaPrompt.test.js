require('dotenv').config();
const assert = require('assert');

const chatService = require('../src/services/chatService');

async function main() {
  let passed = 0;
  const test = async (name, fn) => {
    await fn();
    console.log(`  OK ${name}`);
    passed += 1;
  };

  try {
    await test('buildMediaContextBlock returns normalized attachment summary', async () => {
      const block = chatService.buildMediaContextBlock({
        kind: 'image',
        summary: '  画面里是角色面板，显示战力和装备信息  ',
        tags: ['角色', '装备', '角色'],
        mimeType: 'image/png',
        originalName: 'panel.png',
      });

      assert.ok(block.includes('附件类型：图片'));
      assert.ok(block.includes('附件内容概括：画面里是角色面板，显示战力和装备信息'));
      assert.ok(block.includes('附件关键标签：角色、装备'));
      assert.ok(block.includes('附件 MIME：image/png'));
      assert.ok(block.includes('附件文件名：panel.png'));
    });

    await test('buildMediaAugmentedQuery appends attachment context to user message', async () => {
      const query = chatService.buildMediaAugmentedQuery('这套阵容能玩吗', {
        kind: 'video',
        summary: '战斗结算页，显示阵容和伤害统计',
        tags: ['阵容', '结算'],
      });

      assert.ok(query.startsWith('这套阵容能玩吗'));
      assert.ok(query.includes('[用户附件信息]'));
      assert.ok(query.includes('附件类型：视频'));
      assert.ok(query.includes('附件内容概括：战斗结算页，显示阵容和伤害统计'));
    });

    await test('buildMessages injects media context before live and kb blocks', async () => {
      const mediaContextBlock = chatService.buildMediaContextBlock({
        kind: 'image',
        summary: '英雄详情卡，显示阵营和技能',
        tags: ['英雄', '技能'],
      });

      const messages = chatService.buildMessages(
        { display_name: 'Tester', persona: 'Persona block' },
        [],
        '帮我看看这个英雄值不值得练',
        'KB_CONTEXT',
        'KG_FACTS',
        'LIVE_RESULTS',
        { display_name: '灯塔-国内', game_name: 'Last Light', code: 'lighthouse_cn' },
        { mediaContextBlock }
      );

      const systemPrompt = messages[0].content;
      assert.ok(systemPrompt.includes('附件内容概括：英雄详情卡，显示阵营和技能'));
      assert.ok(systemPrompt.indexOf('附件内容概括：英雄详情卡，显示阵营和技能') < systemPrompt.indexOf('LIVE_RESULTS'));
      assert.ok(systemPrompt.indexOf('附件内容概括：英雄详情卡，显示阵营和技能') < systemPrompt.indexOf('KB_CONTEXT'));
    });

    console.log(`\n${passed} tests passed`);
  } catch (err) {
    console.error(`\nFAILED: ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

main();
