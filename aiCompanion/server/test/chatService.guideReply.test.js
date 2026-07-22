const assert = require('assert');

const chatService = require('../src/services/chatService');

async function main() {
  const guideRefs = [
    {
      entryId: 10447,
      documentId: 76,
      rowIndex: 162,
      matchText: [
        'Sheet: arena',
        'Row: 162',
        '\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565 / Peak Arena Guide',
      ].join('\n'),
      lexicalScore: 42,
      semanticScore: 0.42,
      score: 0.42,
    },
    {
      entryId: 10448,
      documentId: 76,
      rowIndex: 163,
      matchText: [
        'Sheet: arena',
        'Row: 163',
        '\u3010\u5f00\u542f\u65f6\u95f4\u3011',
      ].join('\n'),
      lexicalScore: 12,
      semanticScore: 0.12,
      score: 0.12,
    },
    {
      entryId: 10449,
      documentId: 76,
      rowIndex: 164,
      matchText: [
        'Sheet: arena',
        'Row: 164',
        '1.\u5dc5\u5cf0\u7ade\u6280\u573a\u4f1a\u5728\u6bcf\u5468\u4e8c\u5f00\u542f',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0.16,
      score: 0.16,
    },
    {
      entryId: 10452,
      documentId: 76,
      rowIndex: 167,
      matchText: [
        'Sheet: arena',
        'Row: 167',
        '\u3010\u53c2\u4e0e\u6761\u4ef6\u3011',
      ].join('\n'),
      lexicalScore: 12,
      semanticScore: 0.12,
      score: 0.12,
    },
    {
      entryId: 10453,
      documentId: 76,
      rowIndex: 168,
      matchText: [
        'Sheet: arena',
        'Row: 168',
        '1.\u53ea\u6709\u6392\u540d\u524d 200 \u7684\u6307\u6325\u5b98\u53ef\u4ee5\u53c2\u4e0e',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0.16,
      score: 0.16,
    },
    {
      entryId: 10456,
      documentId: 76,
      rowIndex: 171,
      matchText: [
        'Sheet: arena',
        'Row: 171',
        '\u3010\u6bd4\u8d5b\u89c4\u5219\u3011',
      ].join('\n'),
      lexicalScore: 12,
      semanticScore: 0.12,
      score: 0.12,
    },
    {
      entryId: 10457,
      documentId: 76,
      rowIndex: 172,
      matchText: [
        'Sheet: arena',
        'Row: 172',
        '1.\u6311\u6218\u80dc\u5229\u540e\u53ef\u4ee5\u4e0e\u5bf9\u624b\u4ea4\u6362\u6392\u540d',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0.16,
      score: 0.16,
    },
    {
      entryId: 10460,
      documentId: 76,
      rowIndex: 175,
      matchText: [
        'Sheet: arena',
        'Row: 175',
        '\u3010\u5956\u52b1\u7ed3\u7b97\u3011',
      ].join('\n'),
      lexicalScore: 12,
      semanticScore: 0.12,
      score: 0.12,
    },
    {
      entryId: 10461,
      documentId: 76,
      rowIndex: 176,
      matchText: [
        'Sheet: arena',
        'Row: 176',
        '1.\u6bcf\u5929 21:00 \u4f1a\u6839\u636e\u5f53\u524d\u6392\u540d\u53d1\u653e\u6bcf\u65e5\u5956\u52b1',
      ].join('\n'),
      lexicalScore: 16,
      semanticScore: 0.16,
      score: 0.16,
    },
    {
      entryId: 10462,
      documentId: 76,
      rowIndex: 177,
      matchText: [
        'Sheet: arena',
        'Row: 177',
        '3V3竞技场  3V3 Arena',
      ].join('\n'),
      lexicalScore: 4,
      semanticScore: 0.04,
      score: 0.04,
    },
    {
      entryId: 10463,
      documentId: 76,
      rowIndex: 178,
      matchText: [
        'Sheet: arena',
        'Row: 178',
        '3V3竞技场攻略',
      ].join('\n'),
      lexicalScore: 4,
      semanticScore: 0.04,
      score: 0.04,
    },
    {
      entryId: 10464,
      documentId: 76,
      rowIndex: 179,
      matchText: [
        'Sheet: arena',
        'Row: 179',
        '【持续时间】',
      ].join('\n'),
      lexicalScore: 4,
      semanticScore: 0.04,
      score: 0.04,
    },
  ];

  const filtered = chatService.filterRefsForAnswer('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', guideRefs);
  const reply = await chatService.getDetailedGuideKnowledgeReply('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565', filtered);

  assert.ok(reply.startsWith('\u5dc5\u5cf0\u7ade\u6280\u573a\u653b\u7565'));
  assert.ok(reply.includes('\u3010\u5f00\u542f\u65f6\u95f4\u3011'));
  assert.ok(reply.includes('\u3010\u53c2\u4e0e\u6761\u4ef6\u3011'));
  assert.ok(reply.includes('\u3010\u6bd4\u8d5b\u89c4\u5219\u3011'));
  assert.ok(reply.includes('\u3010\u5956\u52b1\u7ed3\u7b97\u3011'));
  assert.ok(reply.includes('\u6bcf\u5468\u4e8c\u5f00\u542f'));
  assert.ok(reply.includes('\u6392\u540d\u524d 200'));
  assert.ok(reply.includes('\u4ea4\u6362\u6392\u540d'));
  assert.ok(reply.includes('21:00'));
  assert.ok(!reply.includes('Peak Arena Guide'));
  assert.ok(!reply.includes('3V3竞技场'));
  assert.ok(!reply.includes('【持续时间】'));

  console.log('chatService guide reply tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
