const now = '2026-06-04 10:00:00';

const ok = (data: any = null, total?: number) =>
  Promise.resolve({ data, code: 0, total: total ?? (Array.isArray(data) ? data.length : 0), msg: '' });

const qualityRows = [
  {
    id: 1,
    checkId: 1001,
    userId: '1000001',
    userName: 'preview_user',
    nickName: 'PreviewUser',
    status: 1,
    checkResult: 1,
    checkType: 'chat',
    matchTags: ['High Value', 'Active'],
    mismatchedPostId: 9002,
    postRank: 3,
    aiReason: 'The selected recommendation is weaker than the user profile suggests.',
    aiScore: 78,
    createdAt: now,
    checkTime: now,
    userChatSession: JSON.stringify({
      User: 'How do I improve my build?',
      System: 'Try upgrading your weapon first.',
      UserTime: now,
      SystemTime: now,
      robotName: 'Club AI',
    }),
    aiAnswer: 'Try upgrading your weapon first.',
    posts: [
      { id: 9001, title: 'Beginner build guide', tags: ['guide', 'starter'] },
      { id: 9002, title: 'Advanced build analysis', tags: ['advanced', 'build'] },
    ],
  },
  {
    id: 2,
    checkId: 1002,
    userId: '1000002',
    userName: 'guide_maker',
    nickName: 'GuideMaker',
    status: 2,
    checkResult: 2,
    checkType: 'post',
    matchTags: ['Guide'],
    mismatchedPostId: 9003,
    postRank: 5,
    aiReason: 'The item needs manual review because the score is below threshold.',
    aiScore: 62,
    createdAt: now,
    checkTime: now,
    userChatSession: JSON.stringify({
      User: 'Where can I farm resources?',
      System: 'Check the weekly dungeon rotation.',
      UserTime: now,
      SystemTime: now,
      robotName: 'Club AI',
    }),
    aiAnswer: 'Check the weekly dungeon rotation.',
    posts: [{ id: 9003, title: 'Weekly dungeon resource route', tags: ['dungeon', 'resource'] }],
  },
];

const statistic = {
  list: [
    {
      date: '2026-06-01',
      totalRecommendations: 120,
      mediumScores: 18,
      lowScores: 6,
      pendingVerificationCount: 5,
      verificationRatio: 0.2,
    },
    {
      date: '2026-06-02',
      totalRecommendations: 150,
      mediumScores: 20,
      lowScores: 8,
      pendingVerificationCount: 6,
      verificationRatio: 0.19,
    },
    {
      date: '2026-06-03',
      totalRecommendations: 180,
      mediumScores: 22,
      lowScores: 9,
      pendingVerificationCount: 7,
      verificationRatio: 0.17,
    },
  ],
  summary: {
    totalRecommendations: 450,
    totalScores: 83,
    totalRecommendationsRate: 0.18,
    recommendationClickRate: 0.42,
    recommendationClickRateChange: 0.06,
    interactionConversionRate: 0.23,
    interactionConversionRateChange: 0.03,
    negativeFeedbackRate: 0.04,
    negativeFeedbackRateChange: -0.01,
    mediumScoreRatio: 0.14,
    mediumScoreRatioChange: -0.02,
    lowScoreRatio: 0.05,
    lowScoreRatioChange: -0.01,
  },
};

export const getQualityList = (..._args: any[]) => ok(qualityRows);
export const getQualityDetail = (..._args: any[]) => ok(qualityRows[0]);
export const reviewQuality = (data: any) => ok(data);
export const batchReviewQuality = (data: any) => ok(data);
export const getQualityAnalysis = (..._args: any[]) =>
  ok('### Preview analysis\n- Recommendation quality is stable.\n- Pending verification items have visible mock data.');
export const getQualityStatistic = (..._args: any[]) => ok(statistic);
export const getOptimizeAnswer = (..._args: any[]) => ok('Use the weekly dungeon and prioritize daily stamina.');
