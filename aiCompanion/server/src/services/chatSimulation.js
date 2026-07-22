const db = require('../config/db');
const chatService = require('./chatService');

const MIN_TURNS = 1;
const MAX_TURNS = 12;
const DEFAULT_TURNS = 4;
const SCORE_WAIT_ATTEMPTS = 20;
const SCORE_WAIT_MS = 500;

const PROMPT_MODES = [
  {
    key: 'independent',
    label: '独立问题',
    description: '每一轮都单独成问，不依赖上一轮上下文。',
  },
  {
    key: 'continuous',
    label: '连续追问',
    description: '问题会按梯度追问，后续问题依赖上一轮上下文。',
  },
];

const SCENARIOS = [
  {
    key: 'newbie_guide',
    label: '新手入门',
    description: '模拟新玩家询问开局、体力分配、抽卡和前期养成。',
    topicPlaceholder: '游戏名或新区开局',
    independentTemplates: [
      '我刚开始玩{topic}，开局第一天最该先做什么？',
      '{topic}这种开局里，前期体力优先刷哪一类内容最划算？',
      '如果我在{topic}前期抽到角色比较杂，怎么判断谁值得先养？',
      '零氪玩{topic}的话，前七天最容易踩的坑有哪些？',
      '我每天只能玩半小时，{topic}前期任务该怎么取舍？',
      '你给我列一个{topic}新手每天照着做的简化清单。',
      '如果我是今天刚进{topic}的新手，前两天应该避免乱花哪些资源？',
      '{topic}这种前期开荒，主线、活动、抽卡资源之间应该怎么排优先级？',
    ],
    continuousSteps: [
      [
        '我刚开始玩{topic}，开局第一天最该先做什么？',
        '如果现在入坑{topic}，你觉得第一步最稳的开局动作是什么？',
        '新手刚进{topic}的时候，最先抓的一件事应该是什么？',
      ],
      [
        '如果只能先做一件事，你建议我优先推主线还是先攒资源？',
        '那我要是时间有限，是先冲主线还是先把资源拿满？',
        '如果我现在只能专注一件事，主线和资源你更建议先抓哪个？',
      ],
      [
        '真的吗？那前期体力是不是也要完全围着这个节奏走？',
        '你确定吗？前期体力分配也应该跟着这个思路吗？',
        '那体力是不是也别乱花，要按你刚才那个优先级来？',
      ],
      [
        '如果我抽到的角色比较杂，你再给我一个更省资源的培养方案。',
        '要是我前期角色很多但资源不够，你给我一个更克制的养法。',
        '如果抽卡结果有点散，你再帮我收成一个省材料的培养顺序。',
      ],
      [
        '还有没有更稳一点的路线，适合零氪慢慢玩的？',
        '那如果我就是想保守一点玩，有没有更稳的推进方式？',
        '如果我不想冒险乱投资源，你还有没有更稳妥的思路？',
      ],
      [
        '最后你帮我压缩成三步执行顺序，我照着做。',
        '你最后收一下，给我一个三步版的开局顺序。',
        '行，那你把前期最重要的三步直接排给我。',
      ],
    ],
  },
  {
    key: 'lineup_building',
    label: '阵容搭配',
    description: '模拟玩家围绕角色定位、阵容思路和替补方案追问。',
    topicPlaceholder: '某个角色或阵容主题',
    independentTemplates: [
      '我想围绕{topic}组队，这个思路靠谱吗？',
      '围绕{topic}搭阵容时，最怕碰到哪类对手？',
      '如果围绕{topic}组队但缺一个核心位，有什么平替能先顶上？',
      '围绕{topic}的队伍，站位和技能释放顺序最该注意什么？',
      '资源有限的情况下，围绕{topic}的阵容里先养哪两个角色收益最高？',
      '你再给我一个更适合平民的{topic}备选阵容。',
      '{topic}这种阵容如果我不打算冲榜，只想稳过图，配置要怎么降配？',
      '如果我现在就想围绕{topic}开练，先把哪些位置配齐最关键？',
    ],
    continuousSteps: [
      [
        '我想围绕{topic}组队，这个思路靠谱吗？',
        '如果我打算围绕{topic}组阵容，你觉得这个方向值不值得练？',
        '我现在主玩{topic}，这套阵容思路能不能成型？',
      ],
      [
        '你再给我一个更适合平民的备选阵容。',
        '那你顺手给我一个预算更低的替代阵容。',
        '如果我资源不够，你再补一个平民一点的备选方案。',
      ],
      [
        '真的吗？还有没有更好的，别太吃稀有角色。',
        '你确定这个就够稳了吗？还有没有更不吃高稀有的搭法？',
        '真要这么配？有没有再克制一点、没那么挑角色的版本？',
      ],
      [
        '如果我少一个核心位，你觉得先拿什么角色顶上最不亏？',
        '那要是我现在缺一个关键角色，先用谁过渡最划算？',
        '如果核心位暂时抽不到，你觉得哪个替补最不亏战力？',
      ],
      [
        '这套备选阵容最怕什么环境，值不值得我现在就转？',
        '那这个平民方案会被什么阵容克得最难受？我现在转过去亏不亏？',
        '如果我现在改练这套，最容易在哪种环境里吃亏？',
      ],
      [
        '最后你帮我排一下优先级，先练谁、后练谁。',
        '那你最后给我一个培养顺序，先投谁最稳。',
        '行，最后你把练度优先级排出来，我按这个养。',
      ],
    ],
  },
  {
    key: 'resource_progression',
    label: '资源养成',
    description: '模拟玩家咨询金币、材料、装备和角色养成优先级。',
    topicPlaceholder: '当前关卡阶段',
    independentTemplates: [
      '我在{topic}阶段资源很缺，最该优先投哪一类？',
      '{topic}阶段金币、经验和突破材料都不够时，优先级怎么排？',
      '我在{topic}阶段养装备时，是平均强化还是先集中喂主力？',
      '{topic}阶段有哪些资源看起来很多，其实不该乱花？',
      '如果我在{topic}阶段一周只能刷两种材料，你建议刷什么？',
      '帮我把{topic}阶段的养成顺序按优先级排一下。',
      '如果我在{topic}阶段总是卡材料，应该先补角色练度还是补装备？',
      '{topic}这种阶段里，最容易因为错投资源导致进度变慢的是哪一块？',
    ],
    continuousSteps: [
      [
        '我在{topic}阶段资源很缺，最该优先投哪一类？',
        '到了{topic}这个阶段，资源紧的时候你觉得最先保哪块？',
        '我现在卡在{topic}，资源不够的话第一优先应该给谁？',
      ],
      [
        '如果只能先保一个主力，那是不是其他角色先别动？',
        '那我要是资源只够养一个主力，其他角色是不是先停一下？',
        '如果只能先喂一个核心，是不是其他人先别扩练？',
      ],
      [
        '那装备和突破材料冲突时，你觉得哪个更值得先砸？',
        '如果装备强化和角色突破只能选一个先做，你站哪边？',
        '装备和突破材料同时缺的时候，你会先救哪一边？',
      ],
      [
        '真的吗？还有没有更保守一点、不容易浪费的养法？',
        '你确定这么投最稳吗？有没有更不容易翻车的资源分配法？',
        '那如果我想保守一点养，怎么做才不容易浪费材料？',
      ],
      [
        '如果我这周只能刷两种材料，你再帮我缩成最小方案。',
        '那你把这周要刷的材料压成最少两个，我照着刷。',
        '如果我要把体力压缩到最少，你帮我保留两个最关键的材料本。',
      ],
      [
        '最后你给我一个从今天开始就能执行的养成顺序。',
        '行，那你最后帮我排一个今天就能照抄的资源投放顺序。',
        '最后收一下，给我一个能直接执行的养成次序。',
      ],
    ],
  },
  {
    key: 'event_rewards',
    label: '活动奖励',
    description: '模拟玩家围绕活动性价比、兑换优先级和时间安排提问。',
    topicPlaceholder: '当前活动',
    independentTemplates: [
      '现在这个{topic}活动值得投入吗？',
      '{topic}活动商店里哪些东西最值得优先换？',
      '如果我玩{topic}活动每天上线时间不固定，怎么拿主要奖励？',
      '{topic}活动更适合新手还是老玩家？',
      '如果我预算有限，{topic}活动里最不建议买什么？',
      '你给我一个{topic}活动最低投入、收益不差的打法。',
      '{topic}活动如果只打核心奖励，哪些内容可以直接跳过？',
      '要是我这次不想卷{topic}活动，最划算的参与深度大概在哪？',
    ],
    continuousSteps: [
      [
        '现在这个{topic}活动值得投入吗？',
        '这期{topic}活动你觉得值不值得我认真打？',
        '如果只看收益，这个{topic}活动现在有必要投入吗？',
      ],
      [
        '如果我只想拿最核心的奖励，先换哪几个？',
        '那要是我不想全清，最关键的几个奖励先拿什么？',
        '如果我只打核心收益，你建议优先兑换哪些东西？',
      ],
      [
        '真的吗？还有没有更省时间的拿法？',
        '你确定这么打最划算？有没有更省时间的做法？',
        '那如果我上线碎片化一点，有没有更省事的拿奖励路线？',
      ],
      [
        '如果我上线不稳定，是不是就别碰高投入那部分了？',
        '那我时间不固定的话，高投入玩法是不是可以直接放弃？',
        '如果我没法按点上线，是不是该避开最吃时间的部分？',
      ],
      [
        '预算有限的话，哪些东西我应该直接跳过？',
        '那在投入受限的情况下，哪些兑换项你建议我完全别碰？',
        '如果我不想多花资源，哪几样奖励最该直接放弃？',
      ],
      [
        '最后你帮我收成一个最低投入的活动执行清单。',
        '那你最后给我一个最低投入版本的活动清单。',
        '你收一下，给我一个只拿关键奖励的执行顺序。',
      ],
    ],
  },
  {
    key: 'payment_value',
    label: '付费性价比',
    description: '模拟玩家咨询月卡、礼包、付费收益和消费决策。',
    topicPlaceholder: '某个礼包或付费点',
    independentTemplates: [
      '我在看{topic}，这个付费值不值？',
      '如果每月只愿意为{topic}这类内容花一小笔钱，优先买什么？',
      '围绕{topic}，短期提升和长期收益分别该怎么买？',
      '和{topic}类似的付费项里，有没有那种看着便宜其实很亏的？',
      '如果我是回流玩家，围绕{topic}的付费策略会和新手有什么区别？',
      '最后你给我一个轻度付费方案，别太激进。',
      '{topic}这种付费项如果只打算补进度，不冲强度，值得买吗？',
      '如果我只能选一个长期买的付费点，你觉得{topic}和月卡谁更优先？',
    ],
    continuousSteps: [
      [
        '我在看{topic}，这个付费值不值？',
        '如果只看性价比，{topic}这个付费点你觉得该不该买？',
        '我现在纠结{topic}，你觉得它值不值得我下手？',
      ],
      [
        '如果我每月只想小充一点，是不是优先买你刚说的那个就够了？',
        '那我要是每个月只打算轻度付费，是不是先买你推荐的那项就行？',
        '如果我预算很克制，每月只小充一点，你建议先锁哪一个？',
      ],
      [
        '真的吗？还有没有比它更稳的长期选择？',
        '你确定它是最优先的吗？有没有更适合长期买的？',
        '那如果我想长期买得更稳一点，还有没有更好的选择？',
      ],
      [
        '那短期想补战力的话，是不是该换成另一种买法？',
        '如果我现在想立刻补一点强度，买法是不是要换？',
        '那我要是目标是短期提战力，跟长期方案是不是应该分开？',
      ],
      [
        '如果我是回流补进度，有没有更克制一点的方案？',
        '那回流玩家想补进度的话，你会不会建议更保守的买法？',
        '如果我只是回坑补进度，不打算长期投入，你会怎么改？',
      ],
      [
        '最后你给我一个轻度付费的梯度建议，从最值到最不值。',
        '你最后排一下轻度付费优先级，我按梯度买。',
        '最后收一下，给我一个从最值得买到最该放弃的顺序。',
      ],
    ],
  },
  {
    key: 'mixed_pressure',
    label: '连续追问压测',
    description: '模拟玩家从玩法、活动、阵容一路连续追问，测试多轮上下文稳定性。',
    topicPlaceholder: '游戏名或当前版本',
    independentTemplates: [
      '我最近回坑{topic}，现在版本最值得做的事情是什么？',
      '如果在{topic}当前版本里角色练度一般，优先级会变吗？',
      '{topic}当前版本里，活动和主线冲突时应该先做哪个？',
      '如果我在{topic}这个版本里卡资源，你会建议先养成还是先补阵容？',
      '{topic}现在这个版本如果想冲强度，有没有最短路径？',
      '你把{topic}当前版本最重要的三条建议整理给我。',
      '如果我现在刚回到{topic}，最容易走错的版本节奏是什么？',
      '{topic}当前版本里，如果我只想先稳住进度，最该抓哪条线？',
    ],
    continuousSteps: [
      [
        '我最近回坑{topic}，现在版本最值得做的事情是什么？',
        '如果我现在回到{topic}，你觉得这个版本第一优先该抓什么？',
        '我刚回坑{topic}，这个版本最值的一件事你会建议先做什么？',
      ],
      [
        '那如果我角色练度一般，优先级会变吗？',
        '要是我现在练度不高，这个版本的优先级是不是要改？',
        '如果我账号练度一般，你刚才那个建议还成立吗？',
      ],
      [
        '真的吗？如果活动和主线撞在一起，你还是建议我这么排吗？',
        '那要是活动和主线冲突，你这个顺序还不变吗？',
        '如果活动刚好和主线抢时间，你会不会改优先级？',
      ],
      [
        '那我现在又刚好卡资源，是继续养成还是先补阵容？',
        '如果我同时又缺资源，你觉得该先救养成还是先补队伍？',
        '那资源也不够的时候，你会先让我补练度还是补阵容？',
      ],
      [
        '如果我就是想尽快提强度，还有没有更短的路线？',
        '那我要是只追求短期强度，你有没有更激进一点的路径？',
        '如果我想最快把战力拉起来，你还会怎么压缩路线？',
      ],
      [
        '最后帮我压缩成三条最重要的建议，按先后顺序给。',
        '你最后收一下，给我三条按先后顺序排好的版本建议。',
        '行，最后把最关键的三条建议按顺序列给我。',
      ],
    ],
  },
];

function listScenarioOptions() {
  return SCENARIOS.map(item => ({
    key: item.key,
    label: item.label,
    description: item.description,
    topicPlaceholder: item.topicPlaceholder,
  }));
}

function listPromptModes() {
  return PROMPT_MODES.map(item => ({ ...item }));
}

function normalizeScenarioKey(value) {
  const key = String(value || '').trim().toLowerCase();
  const matched = SCENARIOS.find(item => item.key === key);
  return matched ? matched.key : SCENARIOS[0].key;
}

function normalizePromptMode(value) {
  const key = String(value || '').trim().toLowerCase();
  const matched = PROMPT_MODES.find(item => item.key === key);
  return matched ? matched.key : PROMPT_MODES[0].key;
}

function sanitizeTurns(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TURNS;
  return Math.max(MIN_TURNS, Math.min(MAX_TURNS, parsed));
}

function normalizeTopic(value, fallback = '这款游戏') {
  const topic = String(value || '').trim();
  return topic || fallback;
}

function createSeed() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function hashString(input) {
  let hash = 2166136261;
  const source = String(input || '');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = hashString(seed) || 1;
  return function random() {
    state = Math.imul(state, 1664525) + 1013904223;
    state >>>= 0;
    return state / 4294967296;
  };
}

function sampleWithoutReplacement(items, count, rng) {
  const pool = Array.isArray(items) ? items.slice() : [];
  const limit = Math.max(0, Math.min(Number(count) || 0, pool.length));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, limit);
}

function fillTemplate(template, topic) {
  return String(template || '').replace(/\{topic\}/g, topic);
}

function dedupePrompts(prompts) {
  const seen = new Set();
  const results = [];
  for (const prompt of prompts) {
    const normalized = String(prompt || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(normalized);
  }
  return results;
}

function buildIndependentPrompts(scenario, topic, turns, rng) {
  const picks = sampleWithoutReplacement(scenario.independentTemplates || [], turns, rng);
  return dedupePrompts(picks.map(item => fillTemplate(item, topic)));
}

function buildContinuousPrompts(scenario, topic, turns, rng) {
  const steps = Array.isArray(scenario.continuousSteps) ? scenario.continuousSteps : [];
  const prompts = [];
  for (let index = 0; index < steps.length && prompts.length < turns; index += 1) {
    const variants = Array.isArray(steps[index]) ? steps[index] : [];
    if (!variants.length) continue;
    const pick = variants[Math.floor(rng() * variants.length)];
    prompts.push(fillTemplate(pick, topic));
  }

  if (prompts.length >= turns) {
    return dedupePrompts(prompts.slice(0, turns));
  }

  const fallbackPool = (scenario.independentTemplates || []).map(item => fillTemplate(item, topic));
  const extras = sampleWithoutReplacement(
    fallbackPool.filter(item => !prompts.includes(item)),
    turns - prompts.length,
    rng
  );
  return dedupePrompts(prompts.concat(extras));
}

function buildScenarioPrompts(scenario, promptMode, topic, turns, rng) {
  const key = normalizePromptMode(promptMode);
  if (key === 'continuous') {
    return buildContinuousPrompts(scenario, topic, turns, rng);
  }
  return buildIndependentPrompts(scenario, topic, turns, rng);
}

function buildSimulationPlan({ scenarioKey, promptMode, turns, customTopic, seed }) {
  const normalizedKey = normalizeScenarioKey(scenarioKey);
  const normalizedMode = normalizePromptMode(promptMode);
  const scenario = SCENARIOS.find(item => item.key === normalizedKey) || SCENARIOS[0];
  const mode = PROMPT_MODES.find(item => item.key === normalizedMode) || PROMPT_MODES[0];
  const safeTurns = sanitizeTurns(turns);
  const topic = normalizeTopic(customTopic);
  const resolvedSeed = String(seed || createSeed());
  const rng = createRng([normalizedKey, normalizedMode, topic, safeTurns, resolvedSeed].join('|'));
  const prompts = buildScenarioPrompts(scenario, normalizedMode, topic, safeTurns, rng).slice(0, safeTurns);

  return {
    scenarioKey: scenario.key,
    scenarioLabel: scenario.label,
    scenarioDescription: scenario.description,
    promptMode: mode.key,
    promptModeLabel: mode.label,
    turns: safeTurns,
    customTopic: topic,
    seed: resolvedSeed,
    prompts,
  };
}

function buildSessionKey(plan) {
  return [
    'sim',
    plan.scenarioKey,
    plan.promptMode,
    Date.now(),
    Math.random().toString(36).slice(2, 8),
  ].join('_');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForScores(sessionId, expectedTurns) {
  const target = Math.max(0, Number(expectedTurns) || 0);
  if (!target) return;

  for (let index = 0; index < SCORE_WAIT_ATTEMPTS; index += 1) {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total
         FROM chat_message_scores
        WHERE session_id = ?
          AND score_status IN ('completed', 'fallback', 'failed')`,
      [sessionId]
    );
    if (Number(rows[0]?.total || 0) >= target) return;
    await sleep(SCORE_WAIT_MS);
  }
}

async function loadSimulationResult(versionId, sessionKey) {
  const [sessionRows] = await db.query(
    `SELECT id, version_id, session_key, title, message_count, created_at, updated_at
       FROM chat_sessions
      WHERE version_id = ? AND session_key = ?
      LIMIT 1`,
    [versionId, sessionKey]
  );

  if (sessionRows.length === 0) {
    throw new Error('模拟会话未生成');
  }

  const session = sessionRows[0];
  const [messageRows] = await db.query(
    `SELECT
        user_msg.id AS user_message_id,
        user_msg.content AS user_content,
        user_msg.created_at AS user_created_at,
        assistant.id AS assistant_message_id,
        assistant.content AS assistant_content,
        assistant.refs_json AS assistant_refs_json,
        assistant.created_at AS assistant_created_at,
        score.id AS score_id,
        score.score_status,
        score.score_source,
        score.total_score,
        score.grade,
        score.risk_level,
        score.review_status
      FROM chat_messages user_msg
 LEFT JOIN chat_messages assistant
        ON assistant.session_id = user_msg.session_id
       AND assistant.role = 'assistant'
       AND assistant.id = (
         SELECT inner_assistant.id
           FROM chat_messages inner_assistant
          WHERE inner_assistant.session_id = user_msg.session_id
            AND inner_assistant.role = 'assistant'
            AND inner_assistant.id > user_msg.id
          ORDER BY inner_assistant.id ASC
          LIMIT 1
       )
 LEFT JOIN chat_message_scores score
        ON score.message_id = assistant.id
     WHERE user_msg.session_id = ?
       AND user_msg.role = 'user'
     ORDER BY user_msg.id ASC`,
    [session.id]
  );

  const transcript = messageRows.map((row, index) => {
    const assistantRefs = parseAssistantRefs(row.assistant_refs_json);
    const answerSource = assistantRefs.length > 0 ? 'knowledge' : 'free';

    return {
      turn: index + 1,
      userMessageId: row.user_message_id,
      userContent: row.user_content || '',
      userCreatedAt: row.user_created_at || null,
      assistantMessageId: row.assistant_message_id || null,
      assistantContent: row.assistant_content || '',
      assistantCreatedAt: row.assistant_created_at || null,
      scoreId: row.score_id || null,
      scoreStatus: row.score_status || 'pending',
      scoreSource: row.score_source || null,
      totalScore: row.total_score == null ? null : Number(row.total_score),
      grade: row.grade || null,
      riskLevel: row.risk_level || 'low',
      reviewStatus: row.review_status || 'pending',
      answerSource,
      answerSourceLabel: answerSource === 'knowledge' ? '\u77e5\u8bc6\u5e93' : '\u81ea\u7531\u56de\u7b54',
    };
  });

  const scoredTurns = transcript.filter(item => item.totalScore != null).length;
  const highRiskTurns = transcript.filter(item => item.riskLevel === 'high').length;
  const scoredItems = transcript.filter(item => item.totalScore != null);
  const avgTotalScore = scoredItems.length
    ? Math.round((scoredItems.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / scoredItems.length) * 10) / 10
    : null;

  return {
    session: {
      id: session.id,
      versionId: session.version_id,
      sessionKey: session.session_key,
      title: session.title || '',
      messageCount: session.message_count,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    summary: {
      totalTurns: transcript.length,
      scoredTurns,
      highRiskTurns,
      avgTotalScore,
    },
    transcript,
  };
}

function parseAssistantRefs(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function runSimulation({ versionId, scenarioKey, promptMode, turns, customTopic, requestMeta = {} }) {
  const plan = buildSimulationPlan({ scenarioKey, promptMode, turns, customTopic });
  const sessionKey = buildSessionKey(plan);

  for (const prompt of plan.prompts) {
    await chatService.handleChat({
      versionId,
      sessionKey,
      message: prompt,
      requestMeta,
    });
  }

  const [sessionRows] = await db.query(
    'SELECT id FROM chat_sessions WHERE version_id = ? AND session_key = ? LIMIT 1',
    [versionId, sessionKey]
  );
  if (sessionRows.length === 0) {
    throw new Error('模拟会话未生成');
  }

  await waitForScores(sessionRows[0].id, plan.prompts.length);
  const result = await loadSimulationResult(versionId, sessionKey);

  return {
    scenario: {
      key: plan.scenarioKey,
      label: plan.scenarioLabel,
      description: plan.scenarioDescription,
    },
    config: {
      turns: plan.turns,
      promptMode: plan.promptMode,
      promptModeLabel: plan.promptModeLabel,
      customTopic: plan.customTopic,
      seed: plan.seed,
    },
    ...result,
  };
}

module.exports = {
  MIN_TURNS,
  MAX_TURNS,
  DEFAULT_TURNS,
  listScenarioOptions,
  listPromptModes,
  normalizeScenarioKey,
  normalizePromptMode,
  sanitizeTurns,
  buildSimulationPlan,
  runSimulation,
};
