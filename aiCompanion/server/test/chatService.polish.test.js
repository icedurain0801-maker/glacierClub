require('dotenv').config();
const assert = require('assert');

const chatService = require('../src/services/chatService');
const llm = require('../src/services/llm');

async function main() {
  const originalImpl = llm._setImpl;
  llm._setImpl(async () => {
    throw new Error('mock llm unavailable');
  });

  try {
    const reply = await chatService.polishReplyThroughAi(
      { system_prompt: '' },
      'PVP基地防守要点',
      [
        '**建筑优先级**：',
        '',
        '- 防守的核心是降低被打时的兵损，同时让对方付出更高代价。',
        '- - 医院和急救中心先升，容量越大救回的兵越多。',
        '- - 防御工事完成后会解锁额外医院，这个性价比很高。',
        '- - 主打PVP的话校场也要跟上，直接影响你能带多少兵防守反击。',
        '**强化层面**',
      ].join('\n'),
      {
        refs: [
          {
            matchText: [
              'PVP基地防守要点',
              '医院和急救中心优先升级',
              '校场影响带兵量',
            ].join('\n'),
          },
        ],
        preferredLocale: 'zh-CN',
      }
    );

    assert.ok(reply.includes('PVP基地防守要点'));
    assert.ok(reply.includes('医院和急救中心先升'));
    assert.ok(!reply.includes('**'));
    assert.ok(!reply.includes('- -'));
    assert.ok(!reply.includes('强化层面'));

    console.log('chatService polish test passed');
  } finally {
    llm._setImpl(null);
    void originalImpl;
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
