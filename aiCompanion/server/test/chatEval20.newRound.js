require('dotenv').config();

const fs = require('fs');
const path = require('path');

const db = require('../src/config/db');
const vectorStore = require('../src/services/vectorStore');
const chatService = require('../src/services/chatService');
const qualityScoring = require('../src/services/qualityScoring');

const args = process.argv.slice(2);
const roundArg = args.find(arg => /^--round(?:=|$)/.test(arg));
const outputArg = args.find(arg => arg.startsWith('--output='));
const tagArg = args.find(arg => arg.startsWith('--tag='));
const caseTimeoutArg = args.find(arg => arg.startsWith('--case-timeout-ms='));

const round = (() => {
  if (!roundArg) return 1;
  if (roundArg.includes('=')) {
    const value = Number(roundArg.split('=')[1]);
    return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
  }
  const index = args.indexOf(roundArg);
  if (index >= 0 && args[index + 1]) {
    const value = Number(args[index + 1]);
    if (Number.isFinite(value) && value >= 1) return Math.floor(value);
  }
  return 1;
})();

const roundTag = tagArg ? String(tagArg.split('=')[1] || '').trim() || `v2-round${round}` : `v2-round${round}`;
const outputPath = outputArg ? String(outputArg.split('=')[1] || '').trim() : '';
const caseTimeoutMs = (() => {
  if (!caseTimeoutArg) return 60000;
  const value = Number(caseTimeoutArg.split('=')[1]);
  return Number.isFinite(value) && value >= 5000 ? Math.floor(value) : 60000;
})();

// ===================== 全新 20 题 =====================
// 设计原则:
//   10 KB 题 + 10 自由题
//   覆盖上次弱项: 英雄上下文追问/星级链/自由题深度/多技能比较
//   3 条连续追问链(hero_skill_chain / hero_compare / guide_chain)
//   7 条独立问答(覆盖天气预报/科技对比/健康/通用知识)
const CASES = [
  // ---- KB 连续追问链 1: 技能星级链 (5题, checks star-level follow-up) ----
  { id: 1, session: 'skill_star_chain', expectedType: 'knowledge', question: '极速奇袭造成多少基础伤害', mustIncludeAny: ['372%'], forbiddenAny: ['排期', 'UI需求'] },
  { id: 2, session: 'skill_star_chain', expectedType: 'knowledge', question: '二星效果呢', mustIncludeAny: ['极速奇袭', '二星'], forbiddenAny: ['排期', 'UI需求'] },
  { id: 3, session: 'skill_star_chain', expectedType: 'knowledge', question: '那三星呢', mustIncludeAny: ['极速奇袭', '三星'], forbiddenAny: ['排期', 'UI需求'] },
  { id: 4, session: 'skill_star_chain', expectedType: 'knowledge', question: '四星有什么变化', mustIncludeAny: ['四星', '伤害'], forbiddenAny: ['排期', 'UI需求'] },
  { id: 5, session: 'skill_star_chain', expectedType: 'free', question: '这个技能适合优先升吗', mustIncludeAny: ['极速奇袭', '优先'], forbiddenAny: ['排期', '百科UI需求'] },

  // ---- KB 连续追问链 2: 英雄介绍+技能+定位 (3题, checks hero context) ----
  { id: 6, session: 'hero_context_chain', expectedType: 'knowledge', question: '介绍一下契约女仆莉奥拉这个英雄', mustIncludeAny: ['莉奥拉', '英雄'], forbiddenAny: ['天气', '电影'] },
  { id: 7, session: 'hero_context_chain', expectedType: 'knowledge', question: '她的技能名称是什么', mustIncludeAny: ['技能', '极速奇袭'], forbiddenAny: ['天气', '电影'] },
  { id: 8, session: 'hero_context_chain', expectedType: 'free', question: '适合放在前排还是后排', mustIncludeAny: ['前排', '后排'], forbiddenAny: ['天气', '电影'] },

  // ---- KB 连续追问链 3: 攻略链 (2题, checks guide/strategy retrieval) ----
  { id: 9, session: 'guide_chain', expectedType: 'knowledge', question: '同盟对决有什么攻略或技巧吗', mustIncludeAny: ['同盟对决', '攻略'], forbiddenAny: ['排期', '百科UI需求'] },
  { id: 10, session: 'guide_chain', expectedType: 'knowledge', question: '推一个适合新手的平民阵容', mustIncludeAny: ['阵容', '新手'], forbiddenAny: ['排期', '百科UI需求'] },

  // ---- 自由回答 连续追问链 1: 天气预报 (2题) ----
  { id: 11, session: 'weather_free_chain', expectedType: 'free', question: '今天北京天气怎么样', mustIncludeAny: ['北京'], forbiddenAny: ['英雄', '技能'] },
  { id: 12, session: 'weather_free_chain', expectedType: 'free', question: '那明天适合出门吗', mustIncludeAny: ['明天', '出门'], forbiddenAny: ['英雄', '技能'] },

  // ---- 自由回答 独立题 (8题) ----
  { id: 13, session: 'free_ind_1', expectedType: 'free', question: '新能源汽车和燃油车哪个更值得买', mustIncludeAny: ['新能源', '燃油'], forbiddenAny: ['英雄', '技能'] },
  { id: 14, session: 'free_ind_2', expectedType: 'free', question: 'AI会对程序员的工作造成多大影响', mustIncludeAny: ['AI', '程序员'], forbiddenAny: ['英雄', '技能'] },
  { id: 15, session: 'free_ind_3', expectedType: 'free', question: '有什么适合上班族做的简单健康餐', mustIncludeAny: ['健康餐', '备餐'], forbiddenAny: ['英雄', '技能'] },
  { id: 16, session: 'free_ind_4', expectedType: 'free', question: '推荐三首适合健身时听的歌', mustIncludeAny: ['健身', '歌'], forbiddenAny: ['英雄', '技能'] },
  { id: 17, session: 'free_ind_5', expectedType: 'free', question: '为什么天空是蓝色的', mustIncludeAny: ['散射', '蓝'], forbiddenAny: ['英雄', '技能'] },
  { id: 18, session: 'free_ind_6', expectedType: 'free', question: '2026年最值得期待的科技趋势有哪些', mustIncludeAny: ['科技', '2026'], forbiddenAny: ['英雄', '技能'] },
  { id: 19, session: 'free_ind_7', expectedType: 'free', question: '新手跑步需要注意什么', mustIncludeAny: ['跑步', '注意'], forbiddenAny: ['英雄', '技能'] },
  { id: 20, session: 'free_ind_8', expectedType: 'free', question: '深度学习里的Transformer架构是什么原理', mustIncludeAny: ['Transformer', '注意力'], forbiddenAny: ['英雄', '技能'] },
];

// ===================== 评分逻辑 (沿用 chatEval20.run.js) =====================
function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function includesAny(text, terms = []) {
  const source = normalize(text);
  return terms.some(term => source.includes(normalize(term)));
}

function hasJapanese(text) {
  return /[\u3040-\u30ff]/u.test(String(text || ''));
}

function looksLikeHeroCardReply(reply) {
  return /```herocard[\s\S]*```/u.test(String(reply || ''));
}

function classifyByAnswer(answer) {
  const reply = String((answer && answer.reply) || '');
  const answerType = String((answer && answer.answerType) || '').trim();
  if (answerType === 'knowledge_polished') return 'knowledge';
  if (looksLikeHeroCardReply(reply)) return 'knowledge';
  return 'free';
}

function calcMatchScore(testCase, answer = {}) {
  const reply = String(answer.reply || '');
  const refs = Array.isArray(answer.refs) ? answer.refs : [];
  const detectedType = classifyByAnswer(answer);
  const heroCardReply = looksLikeHeroCardReply(reply);
  const hasMust = includesAny(reply, testCase.mustIncludeAny);
  const hasForbidden = includesAny(reply, testCase.forbiddenAny);

  const base = qualityScoring.buildHeuristicScore({
    userContent: testCase.question,
    assistantContent: reply,
    refs,
  }).total_score || 0;

  let score = base;
  if (hasMust) score += 16;
  else score -= 14;
  if (hasForbidden) score -= 35;
  if (hasJapanese(reply)) score -= 12;
  if (reply.length < 50) score -= 4;
  if (testCase.expectedType === detectedType) score += 8;
  else score -= 12;
  if (hasMust && !hasForbidden) score += 6;
  if (testCase.expectedType === 'knowledge' && refs.length === 0 && !heroCardReply) score -= 6;
  if (testCase.expectedType === 'free' && refs.length > 0) score -= 4;
  if (/系统异常|timeout:/i.test(reply)) score -= 30;

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

async function resolveVersionId() {
  const [rows] = await db.query(
    'SELECT id FROM versions WHERE status = "active" ORDER BY id ASC LIMIT 1'
  );
  if (!rows.length) throw new Error('没有可用 active 版本');
  return rows[0].id;
}

function average(values) {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timeout:${label}:${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run() {
  console.log(`[chat-eval20-v2] start round=${roundTag} caseTimeoutMs=${caseTimeoutMs}`);
  const versionId = await resolveVersionId();
  await vectorStore.loadAll();
  console.log(`[chat-eval20-v2] vector loaded, versionId=${versionId}`);

  const startedAt = new Date().toISOString();
  const rows = [];
  const sessionMap = new Map();

  for (const testCase of CASES) {
    console.log(`\n[chat-eval20-v2] ===== case=${testCase.id} q="${testCase.question}" session=${testCase.session} =====`);
    let sessionKey = sessionMap.get(testCase.session);
    if (!sessionKey) {
      sessionKey = `eval20v2_${roundTag}_${testCase.session}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionMap.set(testCase.session, sessionKey);
    }

    let answer;
    let errorMessage = '';
    const t0 = Date.now();
    try {
      answer = await withTimeout(
        chatService.handleChat({
          versionId,
          sessionKey,
          message: testCase.question,
          requestMeta: {
            ip: '127.0.0.1',
            forwardedFor: '',
            userAgent: `chat-eval20-v2-${roundTag}`,
          },
        }),
        caseTimeoutMs,
        `case-${testCase.id}`
      );
    } catch (error) {
      errorMessage = String((error && (error.message || error.stack)) || error);
      answer = {
        reply: `系统异常：${errorMessage}`,
        refs: [],
        answerType: 'free',
        answerTypeLabel: '自由回答',
      };
    }
    const elapsed = Date.now() - t0;

    const detectedType = classifyByAnswer(answer);
    const score = calcMatchScore(testCase, answer);
    const refs = Array.isArray(answer.refs) ? answer.refs : [];

    rows.push({
      id: testCase.id,
      session: testCase.session,
      expectedType: testCase.expectedType,
      detectedType,
      answerType: String(answer.answerType || ''),
      answerTypeLabel: answer.answerTypeLabel || (detectedType === 'knowledge' ? '知识库润色回答' : '自由回答'),
      score,
      pass90: score >= 90,
      question: testCase.question,
      reply: String(answer.reply || ''),
      refsCount: refs.length,
      refs,
      elapsedMs: elapsed,
      errorMessage,
    });

    console.log(`[chat-eval20-v2] case=${testCase.id} score=${score} type=${detectedType} refs=${refs.length} elapsed=${elapsed}ms${errorMessage ? ' error=' + errorMessage : ''}`);
  }

  const knowledgeRows = rows.filter(item => item.detectedType === 'knowledge');
  const freeRows = rows.filter(item => item.detectedType === 'free');

  const summary = {
    round: roundTag,
    startedAt,
    finishedAt: new Date().toISOString(),
    total: rows.length,
    knowledgeCount: knowledgeRows.length,
    freeCount: freeRows.length,
    knowledgeAvg: average(knowledgeRows.map(item => item.score)),
    freeAvg: average(freeRows.map(item => item.score)),
    overallAvg: average(rows.map(item => item.score)),
    failedIds: rows.filter(item => !item.pass90).map(item => item.id),
    below80Ids: rows.filter(item => item.score < 80).map(item => item.id),
    caseTimeoutMs,
  };

  const output = { summary, rows };
  const text = JSON.stringify(output, null, 2);
  const jsonPath = outputPath || `../.temp/eval20-v2-${roundTag}.json`;

  const absoluteJson = path.isAbsolute(jsonPath)
    ? jsonPath
    : path.resolve(process.cwd(), jsonPath);
  ensureParentDir(absoluteJson);
  fs.writeFileSync(absoluteJson, text, 'utf8');
  console.log(`\n[chat-eval20-v2] saved: ${absoluteJson}`);

  // Print summary table
  console.log(`\n========== ROUND ${round} SUMMARY ==========`);
  console.log(`Total: ${summary.total}  KB: ${summary.knowledgeCount} avg=${summary.knowledgeAvg}  Free: ${summary.freeCount} avg=${summary.freeAvg}`);
  console.log(`Overall Avg: ${summary.overallAvg}`);
  console.log(`Failed (<90): [${summary.failedIds.join(', ')}]`);
  console.log(`Below 80: [${summary.below80Ids.join(', ')}]`);
  console.log(`========== END SUMMARY ==========`);
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  } catch (error) {
    console.error('[chat-eval20-v2] db.end failed:', error && (error.message || error));
  }
  process.exit(process.exitCode || 0);
});
