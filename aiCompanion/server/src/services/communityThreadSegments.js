const crypto = require('crypto');

const NOISE_PATTERNS = [
  /^[\p{P}\p{S}\s]+$/u,
  /^(顶|沙发|前排|路过|围观|打卡|占楼|mark|1+|6+|666+|收到|支持|同问|来了|好耶|哈哈+|hhh+|up)$/iu,
  /^(谢谢|感谢|辛苦了|牛|nb|赞|不错|好玩|可以|有用)([!！。.~\s]*)$/u,
];

const STRONG_SIGNAL_RE = /(活动|奖励|兑换|时间|日期|几点|结束|开始|规则|条件|步骤|流程|方法|教程|攻略|阵容|搭配|掉落|位置|入口|链接|地址|更新|修复|异常|bug|报错|解决|办法|建议|推荐|配置|技能|属性|材料|次数|上限|保底|概率|账号|登录|绑定|审核|任务|成就|称号|礼包|口令|兑换码|下载)/u;
const QUESTION_RE = /(怎么|如何|为什么|哪里|在哪|能不能|有没有|是否|多少|多久|几点|啥时候|\?|？)/u;
const ANSWER_RE = /(可以|需要|记得|先|然后|再|因为|所以|建议|推荐|最好|必须|只要|即可|就能|完成|获得|失败|成功|解决|修复|重启|刷新|重登)/u;
const STRUCTURE_RE = /(\n|1\.|2\.|3\.|一、|二、|三、|- )/u;

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function uniqueTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).filter(Boolean))];
}

function buildPostSegment(page) {
  const thread = page?.thread;
  if (!thread?.post?.content) return null;
  const content = [
    thread.board?.name ? `板块：${thread.board.name}` : '',
    thread.post.authorName ? `作者：${thread.post.authorName}` : '',
    thread.post.createdAt ? `发布时间：${thread.post.createdAt}` : '',
    `帖子标题：${thread.post.title || page.title || ''}`,
    `帖子地址：${page.url}`,
    '',
    thread.post.content,
  ].filter(Boolean).join('\n');

  return {
    sourceType: 'post_main',
    sourceUid: `post:${thread.post.id || hash(page.url)}`,
    parentSourceUid: null,
    authorName: thread.post.authorName || '',
    content: normalizeText(content),
    qualityScore: 100,
    qualityDecision: 'selected',
    reasonTags: ['post', 'main_content'],
  };
}

function flattenComments(thread) {
  const out = [];
  for (const comment of Array.isArray(thread?.comments) ? thread.comments : []) {
    const commentUid = `comment:${comment.id || hash(`${comment.authorName}:${comment.createdAt}:${comment.content}`)}`;
    out.push({
      level: 1,
      sourceType: 'comment_answer',
      sourceUid: commentUid,
      parentSourceUid: `post:${thread?.post?.id || 'unknown'}`,
      authorName: comment.authorName || '',
      createdAt: comment.createdAt || '',
      content: normalizeText(comment.content),
    });

    for (const reply of Array.isArray(comment.replies) ? comment.replies : []) {
      out.push({
        level: 2,
        sourceType: 'comment_answer',
        sourceUid: `reply:${comment.id || 'c'}:${reply.id || hash(`${reply.authorName}:${reply.createdAt}:${reply.content}`)}`,
        parentSourceUid: commentUid,
        authorName: reply.authorName || '',
        createdAt: reply.createdAt || '',
        replyTo: reply.replyTo || '',
        content: normalizeText(reply.content),
      });
    }
  }
  return out.filter(item => item.content);
}

function scoreComment(comment, seenFingerprints) {
  const text = compactText(comment.content);
  const length = text.length;
  const reasons = [];
  let score = 0;

  if (!text) {
    return { score: 0, decision: 'ignored', reasonTags: ['empty'] };
  }

  const fingerprint = text.toLowerCase();
  if (seenFingerprints.has(fingerprint)) {
    return { score: 0, decision: 'ignored', reasonTags: ['duplicate'] };
  }
  seenFingerprints.add(fingerprint);

  if (NOISE_PATTERNS.some(pattern => pattern.test(text))) {
    return { score: 0, decision: 'ignored', reasonTags: ['noise'] };
  }

  if (length >= 12) {
    score += 1;
    reasons.push('length_12');
  }
  if (length >= 24) {
    score += 2;
    reasons.push('length_24');
  }
  if (length >= 60) {
    score += 2;
    reasons.push('length_60');
  }
  if (/\d/.test(text)) {
    score += 1;
    reasons.push('contains_number');
  }
  if (STRONG_SIGNAL_RE.test(text)) {
    score += 3;
    reasons.push('strong_signal');
  }
  if (QUESTION_RE.test(text)) {
    score += 1;
    reasons.push('question');
  }
  if (ANSWER_RE.test(text)) {
    score += 2;
    reasons.push('answer');
  }
  if (STRUCTURE_RE.test(comment.content)) {
    score += 1;
    reasons.push('structured');
  }
  if (comment.level > 1) {
    score += 1;
    reasons.push('reply');
  }

  let decision = 'ignored';
  if (score >= 7) decision = 'selected';
  else if (score >= 4) decision = 'digest_only';
  else reasons.push('low_score');

  return {
    score,
    decision,
    reasonTags: uniqueTags(reasons),
  };
}

function formatCommentSegment(page, comment, scored) {
  const title = page?.thread?.post?.title || page?.title || '';
  const lines = [
    title ? `帖子：${title}` : '',
    `帖子地址：${page.url}`,
    comment.authorName ? `评论作者：${comment.authorName}` : '',
    comment.createdAt ? `评论时间：${comment.createdAt}` : '',
    comment.replyTo ? `回复对象：${comment.replyTo}` : '',
    '',
    comment.content,
  ].filter(Boolean);

  return {
    sourceType: 'comment_answer',
    sourceUid: comment.sourceUid,
    parentSourceUid: comment.parentSourceUid,
    authorName: comment.authorName,
    content: normalizeText(lines.join('\n')),
    qualityScore: scored.score,
    qualityDecision: scored.decision,
    reasonTags: scored.reasonTags,
  };
}

function buildDigestSegment(page, comments) {
  if (!comments.length) return null;
  const snippets = comments
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.authorName || '匿名'}${item.createdAt ? ` @ ${item.createdAt}` : ''}\n${item.content}`)
    .join('\n\n');

  return {
    sourceType: 'comment_digest',
    sourceUid: `digest:${page?.thread?.post?.id || hash(page.url)}`,
    parentSourceUid: `post:${page?.thread?.post?.id || hash(page.url)}`,
    authorName: '',
    content: normalizeText([
      `帖子：${page?.thread?.post?.title || page?.title || ''}`,
      `帖子地址：${page.url}`,
      '',
      '以下评论被保留为摘要，未单独作为问答入库：',
      snippets,
    ].filter(Boolean).join('\n')),
    qualityScore: Math.max(4, comments.reduce((sum, item) => sum + (item.qualityScore || 0), 0)),
    qualityDecision: 'selected',
    reasonTags: ['digest', 'compressed_comments'],
  };
}

function buildImageSegments(page) {
  return (Array.isArray(page?.thread?.imageInsights) ? page.thread.imageInsights : [])
    .map((item, index) => {
      const text = normalizeText(item?.analysisText);
      if (!text) return null;
      return {
        sourceType: 'image_fact',
        sourceUid: `image:${item.imageHash || index + 1}`,
        parentSourceUid: `post:${page?.thread?.post?.id || hash(page.url)}`,
        authorName: '',
        content: normalizeText([
          `帖子：${page?.thread?.post?.title || page?.title || ''}`,
          `帖子地址：${page.url}`,
          item?.url ? `图片地址：${item.url}` : '',
          '',
          text,
        ].filter(Boolean).join('\n')),
        qualityScore: 8,
        qualityDecision: 'selected',
        reasonTags: ['image', 'ocr_fact'],
      };
    })
    .filter(Boolean);
}

function buildSegments(page) {
  if (!page?.thread || page.thread.type !== 'q1_post') {
    return {
      segments: [],
      stats: {
        commentCount: 0,
        usefulCommentCount: 0,
        ignoredCommentCount: 0,
        selectedEntryCount: 0,
      },
    };
  }

  const segments = [];
  const postSegment = buildPostSegment(page);
  if (postSegment) segments.push(postSegment);

  const seenFingerprints = new Set();
  const flattened = flattenComments(page.thread);
  const digestCandidates = [];
  let usefulCommentCount = 0;
  let ignoredCommentCount = 0;

  for (const comment of flattened) {
    const scored = scoreComment(comment, seenFingerprints);
    const segment = formatCommentSegment(page, comment, scored);
    if (scored.decision === 'selected') {
      usefulCommentCount += 1;
      segments.push(segment);
    } else if (scored.decision === 'digest_only') {
      usefulCommentCount += 1;
      segments.push(segment);
      digestCandidates.push(segment);
    } else {
      ignoredCommentCount += 1;
      segments.push(segment);
    }
  }

  const digestSegment = buildDigestSegment(page, digestCandidates);
  if (digestSegment) segments.push(digestSegment);
  segments.push(...buildImageSegments(page));

  const finalSegments = segments.map(segment => ({
    ...segment,
    content: normalizeText(segment.content),
    contentHash: hash(segment.content),
    reasonTags: uniqueTags(segment.reasonTags),
  }));

  const selectedEntryCount = finalSegments.filter(segment => segment.qualityDecision === 'selected').length;
  return {
    segments: finalSegments,
    stats: {
      commentCount: flattened.length,
      usefulCommentCount,
      ignoredCommentCount,
      selectedEntryCount,
    },
  };
}

module.exports = {
  buildSegments,
};
