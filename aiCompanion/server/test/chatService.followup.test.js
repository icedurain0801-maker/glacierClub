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

    await test('skill-star follow-up should inherit previous skill subject', async () => {
      const history = [
        { role: 'user', content: '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\u600e\u6837\u7684' },
        { role: 'assistant', content: '\u4e8c\u661f\u6548\u679c\u4f1a\u5f3a\u5316\u8fdb\u573a\u7206\u53d1\u3002' },
      ];

      assert.strictEqual(
        chatService.getRecentGenericSubjectFromHistory(history),
        '\u6781\u901f\u5947\u88ad'
      );

      const result = chatService.buildGenericContextAugmentedQuery(
        '\u4e09\u661f\u5462',
        history
      );

      assert.strictEqual(result.subject, '\u6781\u901f\u5947\u88ad');
      assert.ok(result.retrievalQuery.includes('\u6781\u901f\u5947\u88ad'));
      assert.ok(result.retrievalQuery.includes('\u4e09\u661f'));
      assert.ok(result.retrievalQuery.includes('\u6548\u679c'));
    });

    await test('knowledge detail follow-up should expand short fragments into kb-friendly retrieval terms', async () => {
      const history = [
        { role: 'user', content: '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\u600e\u6837\u7684' },
        { role: 'assistant', content: '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\uff1a\u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3' },
      ];

      const starFollowup = chatService.buildGenericContextAugmentedQuery('\u4e09\u661f\u5462', history);
      assert.strictEqual(starFollowup.retrievalQuery, '\u6781\u901f\u5947\u88ad \u4e09\u661f\u6548\u679c');

      const baseFollowup = chatService.buildGenericContextAugmentedQuery('\u57fa\u7840\u5462', history);
      assert.strictEqual(baseFollowup.retrievalQuery, '\u6781\u901f\u5947\u88ad \u57fa\u7840\u6548\u679c');

      const factionFollowup = chatService.buildGenericContextAugmentedQuery('\u9635\u8425\u5462', history);
      assert.strictEqual(factionFollowup.retrievalQuery, '\u6781\u901f\u5947\u88ad \u9635\u8425');
    });

    await test('field-only follow-ups should not become the carried subject for later turns', async () => {
      const history = [
        { role: 'user', content: '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\u600e\u6837\u7684' },
        { role: 'assistant', content: '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\uff1a\u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3' },
        { role: 'user', content: '\u4e09\u661f\u5462' },
        { role: 'assistant', content: '\u4e09\u661f\u6548\u679c\u662f\uff1a\u989d\u5916\u9020\u621070%\u7684\u7269\u7406\u4f24\u5bb3' },
      ];

      assert.strictEqual(
        chatService.getRecentGenericSubjectFromHistory(history),
        '\u6781\u901f\u5947\u88ad'
      );

      const baseFollowup = chatService.buildGenericContextAugmentedQuery(
        '\u57fa\u7840\u5462',
        history
      );
      assert.strictEqual(baseFollowup.subject, '\u6781\u901f\u5947\u88ad');
      assert.strictEqual(baseFollowup.retrievalQuery, '\u6781\u901f\u5947\u88ad \u57fa\u7840\u6548\u679c');

      const fiveStarHistory = [
        ...history,
        { role: 'user', content: '\u57fa\u7840\u5462' },
        { role: 'assistant', content: '\u6781\u901f\u5947\u88ad\u7684\u57fa\u7840\u6548\u679c\u662f\uff1a\u5bf9\u654c\u65b9\u5355\u4f53\u9020\u6210372%\u653b\u51fb\u7684\u7269\u7406\u4f24\u5bb3' },
      ];
      const fiveStarFollowup = chatService.buildGenericContextAugmentedQuery(
        '\u4e94\u661f\u5462',
        fiveStarHistory
      );
      assert.strictEqual(fiveStarFollowup.subject, '\u6781\u901f\u5947\u88ad');
      assert.strictEqual(fiveStarFollowup.retrievalQuery, '\u6781\u901f\u5947\u88ad \u4e94\u661f\u6548\u679c');
    });

    await test('short follow-up should inherit recent assistant title when prior user turn was a title-style question', async () => {
      const history = [
        { role: 'user', content: '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f' },
        { role: 'assistant', content: '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f\n1. \u5408\u7406\u7ad9\u4f4d\n2. \u5175\u79cd\u514b\u5236 + \u9635\u5bb9\u52a0\u6210\n3. \u9635\u5bb9\u53d1\u5c55' },
      ];

      assert.strictEqual(
        chatService.getRecentGenericSubjectFromHistory(history),
        '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f'
      );

      const result = chatService.buildGenericContextAugmentedQuery(
        '\u6e38\u730e\u5462',
        history
      );

      assert.strictEqual(result.subject, '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f');
      assert.ok(result.retrievalQuery.includes('\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f'));
      assert.ok(result.retrievalQuery.includes('\u6e38\u730e'));
    });

    await test('focused follow-up fragment should stay short and keep the asked branch', async () => {
      assert.strictEqual(
        chatService.getFocusedFollowupFragment('\u6e38\u730e\u5462', '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f'),
        '\u6e38\u730e'
      );
      assert.strictEqual(
        chatService.getFocusedFollowupFragment('\u4e09\u661f\u5462', '\u6781\u901f\u5947\u88ad'),
        '\u4e09\u661f'
      );
    });

    await test('focused knowledge draft should keep the matched branch details for short follow-ups', async () => {
      const draft = [
        '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f',
        '1. \u5408\u7406\u7ad9\u4f4d\uff1a\u53d1\u6325\u82f1\u96c4\u80fd\u529b\u6700\u5927\u5316',
        '2. \u5175\u79cd\u514b\u5236 + \u9635\u5bb9\u52a0\u6210 = \u6218\u6597\u529b\u63d0\u5347',
        '3. \u9635\u5bb9\u53d1\u5c55',
        '1\uff09\u9009\u5b9a\u8981\u53d1\u5c55\u7684\u9635\u5bb9',
        '\u5b88\u62a4\u8005\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c57\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4',
        '\u6e38\u730e\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c71\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4',
        '\u72c2\u5f92\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c99\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4',
        '2\uff09\u4e13\u6ce8\u4e8e\u4e00\u5957\u4e3b\u529b\u9635\u5bb9\uff0c\u7b49\u7ea7\u63d0\u5347\u96c6\u4e2d\u57f9\u517b\u66f4\u9ad8\u6548\u3002',
      ].join('\n');

      const focused = chatService.focusKnowledgeDraftOnFollowup(draft, '\u6e38\u730e', 'zh-CN');

      assert.ok(focused.includes('\u6e38\u730e\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c71\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4'));
      assert.ok(/3\.\s*\u9635\u5bb9\u53d1\u5c55/u.test(focused));
      assert.ok(!focused.includes('\u72c2\u5f92\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c99\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4'));
    });

    await test('hero detail follow-up should still prefer hero-card reply when hero context exists', async () => {
      assert.strictEqual(
        chatService.shouldPreferHeroCardDirectReply(
          '\u4ed6\u7684\u6280\u80fd2\u4e09\u661f\u6548\u679c\u662f\u600e\u4e48\u6837\u7684',
          { name: '\u5361\u897f\u8fea' }
        ),
        true
      );
    });

    await test('field-scoped knowledge draft should not be re-cut by short follow-up focus', async () => {
      const draft = [
        '\u6781\u901f\u5947\u88ad',
        '\u9879\u76ee: \u4e8c\u661f\u6548\u679c',
        '\u5907\u6ce8: \u2b50\u2b50',
        '\u4e2d\u6587: \u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3',
      ].join('\n');

      const focused = chatService.focusKnowledgeDraftOnFollowup(draft, '\u4e8c\u661f\u6548\u679c', 'zh-CN');

      assert.strictEqual(focused, draft);
      assert.strictEqual(chatService.isFieldScopedKnowledgeReply(draft), true);
    });

    await test('field-scoped knowledge draft should be humanized into a natural answer', async () => {
      const draft = [
        '\u6781\u901f\u5947\u88ad',
        '\u9879\u76ee: \u4e8c\u661f\u6548\u679c',
        '\u5907\u6ce8: \u2b50\u2b50',
        '\u4e2d\u6587: \u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3',
      ].join('\n');

      const reply = chatService.humanizeFieldScopedKnowledgeReply(
        '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\u600e\u6837\u7684',
        draft,
        'zh-CN'
      );

      assert.strictEqual(
        reply,
        '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\uff1a\u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3'
      );
    });

    await test('field-scoped knowledge answer should drop injected hero name when query focus is the skill item', async () => {
      const draft = [
        '\u9879\u76ee: \u4e8c\u661f\u6548\u679c',
        '\u5907\u6ce8: \u2b50\u2b50',
        '\u4e2d\u6587: \u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3',
      ].join('\n');

      const reply = chatService.humanizeFieldScopedKnowledgeReply(
        '\u8389\u5965\u62c9 \u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\u600e\u6837\u7684',
        draft,
        'zh-CN'
      );

      assert.strictEqual(
        reply,
        '\u6781\u901f\u5947\u88ad\u7684\u4e8c\u661f\u6548\u679c\u662f\uff1a\u989d\u5916\u9020\u621045%\u7684\u7269\u7406\u4f24\u5bb3'
      );
    });

    await test('focused ref fallback should extract the asked branch from raw kb text', async () => {
      const refs = [
        {
          matchText: [
            'Sheet: \u82f1\u96c4',
            '\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f',
            '1. \u5408\u7406\u7ad9\u4f4d\uff1a\u53d1\u6325\u82f1\u96c4\u80fd\u529b\u6700\u5927\u5316',
            '2. \u5175\u79cd\u514b\u5236 + \u9635\u5bb9\u52a0\u6210 = \u6218\u6597\u529b\u63d0\u5347',
            '3. \u9635\u5bb9\u53d1\u5c55',
            '\u5b88\u62a4\u8005\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c57\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4',
            '\u6e38\u730e\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c71\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4',
            '\u72c2\u5f92\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c99\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4',
            '\u4e13\u6ce8\u517b\u6210\u4e3b\u529b\u9635\u5bb9\uff0c\u4f18\u5148\u5347\u7ea7\u6838\u5fc3\u82f1\u96c4\u4e0e\u88c5\u5907',
          ].join('\n'),
        },
      ];

      const focused = chatService.buildFocusedRefFollowupReply(refs, '\u6e38\u730e', 'zh-CN');

      assert.ok(focused.includes('\u5982\u4f55\u6784\u5efa\u6700\u4f73\u5c0f\u961f'));
      assert.ok(focused.includes('3. \u9635\u5bb9\u53d1\u5c55'));
      assert.ok(!focused.includes('2. \u5175\u79cd\u514b\u5236 + \u9635\u5bb9\u52a0\u6210'));
      assert.ok(focused.includes('\u6e38\u730e\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c71\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4'));
      assert.ok(!focused.includes('\u72c2\u5f92\u9635\u5bb9\uff1a\u5f00\u670d\u7b2c99\u5929\u53ef\u51d1\u9f505\u4e2aS+\u82f1\u96c4'));
      assert.ok(!focused.includes('Select Your Core Lineup'));
    });

    await test('skill detail queries should extract the exact star-effect row from mixed same-article refs', async () => {
      const refs = [
        {
          entryId: 10115,
          rowIndex: 1207,
          metadataPenalty: 0,
          lexicalScore: 29,
          score: 0.29,
          matchText: [
            'Sheet: 契约女仆_莉奥拉',
            'Row: 33',
            'A: 1、伤害类的系数，是覆盖关系',
            '2、buff/debuff的效果系数，是叠加关系',
            '对应位置：技能1',
            '极速奇袭',
          ].join('\n'),
        },
        {
          entryId: 10103,
          rowIndex: 1195,
          metadataPenalty: 4,
          lexicalScore: 12,
          score: 0.12,
          matchText: [
            'Sheet: 契约女仆_莉奥拉',
            'Row: 20',
            '项目: 二星效果',
            '备注: ⭐⭐',
            '中文: 额外造成45%的物理伤害',
          ].join('\n'),
        },
      ];

      const filtered = chatService.filterRefsForAnswer('极速奇袭的二星效果是咋样的', refs);
      const focused = chatService.buildFieldScopedKnowledgeReply(refs, '二星效果', 'zh-CN');

      assert.ok(
        filtered.some(ref => ref.entryId === 10115),
        'should preserve the same-article anchor row for title context'
      );
      assert.ok(focused.includes('二星效果'));
      assert.ok(focused.includes('额外造成45%的物理伤害'));
      assert.ok(!focused.includes('伤害类的系数'));
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
