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
    await test('generic follow-up still falls back to recent user topic without refs', async () => {
      const history = [
        { role: 'user', content: '\u51b0\u7cfb\u9635\u5bb9' },
        { role: 'assistant', content: '\u53ef\u4ee5\u5148\u56f4\u7ed5\u63a7\u5236\u548c\u51cf\u901f\u505a\u6838\u5fc3\u3002' },
      ];

      assert.strictEqual(
        chatService.getRecentGenericSubjectFromHistory(history),
        '\u51b0\u7cfb\u9635\u5bb9'
      );

      const result = chatService.buildGenericContextAugmentedQuery(
        '\u8fd9\u4e2a\u9635\u5bb9\u8fd8\u6709\u66f4\u5e73\u6c11\u7684\u5417',
        history
      );
      assert.strictEqual(result.subject, '\u51b0\u7cfb\u9635\u5bb9');
      assert.ok(result.retrievalQuery.includes('\u51b0\u7cfb\u9635\u5bb9'));
    });

    await test('broad scoped game activity question should not be narrowed to previous specific activity', async () => {
      const history = [
        { role: 'user', content: '\u8fd9\u6b3e\u6e38\u620f\u6d3b\u52a8\u5546\u5e97\u91cc\u54ea\u4e9b\u4e1c\u897f\u6700\u503c\u5f97\u4f18\u5148\u6362\uff1f' },
        {
          role: 'assistant',
          content: '\u540c\u76df\u5bf9\u51b3\u6574\u4f53\u6027\u4ef7\u6bd4\u4e0d\u9519\u3002',
          refs_json: JSON.stringify([
            {
              matchText: 'Sheet: \u540c\u76df\u5bf9\u51b3\n\u6d3b\u52a8\u79ef\u5206\u548c\u5956\u52b1\u6863\u4f4d...',
            },
          ]),
        },
      ];

      const result = chatService.buildGenericContextAugmentedQuery(
        '\u8fd9\u6b3e\u6e38\u620f\u6d3b\u52a8\u66f4\u9002\u5408\u65b0\u624b\u8fd8\u662f\u8001\u73a9\u5bb6\uff1f',
        history
      );

      assert.strictEqual(result.subject, '');
      assert.strictEqual(
        result.retrievalQuery,
        '\u8fd9\u6b3e\u6e38\u620f\u6d3b\u52a8\u66f4\u9002\u5408\u65b0\u624b\u8fd8\u662f\u8001\u73a9\u5bb6\uff1f'
      );
      assert.strictEqual(result.followupContextBlock, '');
    });

    await test('broad scoped detector should match this-game activity wording', async () => {
      assert.strictEqual(
        chatService.hasExplicitBroadScopedObject('\u8fd9\u6b3e\u6e38\u620f\u6d3b\u52a8\u66f4\u9002\u5408\u65b0\u624b\u8fd8\u662f\u8001\u73a9\u5bb6\uff1f'),
        true
      );
    });

    await test('question-intent validator should reject unrelated answer drift', async () => {
      assert.strictEqual(
        chatService.answerMatchesQuestionIntent(
          '\u8fd9\u6b3e\u6e38\u620f\u6d3b\u52a8\u66f4\u9002\u5408\u65b0\u624b\u8fd8\u662f\u8001\u73a9\u5bb6\uff1f',
          '\u540c\u76df\u5bf9\u51b3\u6574\u4f53\u504f\u8001\u73a9\u5bb6\uff0c\u5175\u529b\u3001\u79d1\u6280\u3001\u82f1\u96c4\u57f9\u517b\u5230\u4f4d\u7684\u4eba\u80fd\u6253\u51fa\u66f4\u9ad8\u8d21\u732e\u503c\u3002'
        ),
        false
      );

      assert.strictEqual(
        chatService.answerMatchesQuestionIntent(
          '\u8fd9\u6b3e\u6e38\u620f\u6d3b\u52a8\u66f4\u9002\u5408\u65b0\u624b\u8fd8\u662f\u8001\u73a9\u5bb6\uff1f',
          '\u6574\u4f53\u66f4\u504f\u8001\u73a9\u5bb6\uff0c\u4f46\u65b0\u624b\u4e5f\u80fd\u8ddf\u7740\u8054\u76df\u62ff\u57fa\u7840\u5956\u52b1\uff1b\u5982\u679c\u53ea\u6c42\u7a33\u62ff\u5956\u52b1\uff0c\u65b0\u624b\u53ef\u4ee5\u53c2\u4e0e\uff0c\u60f3\u51b2\u9ad8\u6863\u4f4d\u66f4\u9002\u5408\u8001\u73a9\u5bb6\u3002'
        ),
        true
      );
    });

    await test('hero card lead reply should avoid fixed look-at-card phrasing', async () => {
      const card = {
        name: '\u9ea6\u514b\u65af',
        faction: '\u8349\u539f\u8054\u76df',
        career: '\u6f5c\u730e',
        rarity: 'S+',
        quote: '\u6211\u53ea\u4fe1\u5956\u91d1\u548c\u6210\u679c\u3002',
        skills: [
          { name: '\u7a33\u56fa\u9632\u7ebf', isCore: true },
        ],
      };

      const skillReply = chatService.buildHeroCardLeadReply('\u9ea6\u514b\u65af\u6280\u80fd\u662f\u4ec0\u4e48', card);
      const factionReply = chatService.buildHeroCardLeadReply('\u9ea6\u514b\u65af\u662f\u4ec0\u4e48\u9635\u8425', card);

      assert.ok(!skillReply.includes('\u5148\u770b\u4e0b'));
      assert.ok(!factionReply.includes('\u5148\u770b\u4e0b'));
      assert.notStrictEqual(skillReply, factionReply);
      assert.ok(skillReply.includes('\u7a33\u56fa\u9632\u7ebf'));
      assert.ok(factionReply.includes('\u8349\u539f\u8054\u76df'));
    });

    await test('hero card fallback reply should stay concise without fixed template', async () => {
      const reply = chatService.buildHeroCardFallbackReply({ name: '\u841d\u65af' });
      assert.ok(reply.includes('\u841d\u65af'));
      assert.ok(!reply.includes('\u5148\u770b\u4e0b'));
      assert.ok(!reply.includes('\u5361\u7247\u3002'));
    });

    console.log(`\n${passed} tests passed`);
  } catch (err) {
    console.error(`\nFAILED: ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

main();
