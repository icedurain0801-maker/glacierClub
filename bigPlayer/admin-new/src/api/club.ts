import type { DressUpListItem } from '@ts/appearance';
import { APPROVAL_STATUS, DRESS_ENUM, EXPIRED_DAY, LISTING_STATUS } from '@ts/appearance';

const now = '2026-06-04 10:00:00';
const image =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2272%22 viewBox=%220 0 120 72%22%3E%3Crect width=%22120%22 height=%2272%22 fill=%22%23e6f4ff%22/%3E%3Ctext x=%2260%22 y=%2240%22 text-anchor=%22middle%22 font-size=%2212%22 fill=%22%231675c1%22%3EPreview%3C/text%3E%3C/svg%3E';
const taskBeginTime = Math.floor(new Date('2026-06-04T09:00:00+08:00').getTime() / 1000);
const taskEndTime = Math.floor(new Date('2026-06-30T23:59:59+08:00').getTime() / 1000);
const postContent = JSON.stringify([{ Type: 'text', Data: 'Preview content for the operations console.' }]);
const secondPostContent = JSON.stringify([{ Type: 'text', Data: 'Second non-empty post row.' }]);
const commentContent = JSON.stringify([{ Type: 'text', Data: 'This guide is useful.' }]);

const ok = (data: any = null, total?: number) =>
  Promise.resolve({
    data,
    code: 0,
    total: total ?? (Array.isArray(data) ? data.length : 0),
    msg: '',
  });

const exportOk = () => ok('mock-export.csv');

const mockAppearanceList: DressUpListItem[] = [
  {
    id: 1,
    name: 'Avatar Frame',
    type: DRESS_ENUM.Frame,
    dressType: DRESS_ENUM.Frame,
    status: APPROVAL_STATUS.Approved,
    approvalStatus: APPROVAL_STATUS.Approved,
    listingState: LISTING_STATUS.Online,
    expiredDay: EXPIRED_DAY.Forever,
    iconUrl: image,
    dressUpInfos: [{ dressName: 'Starter Frame', language: 'zh-CN' }],
    startTime: now,
    endTime: '2026-12-31 23:59:59',
    reviewer: 'admin',
    reviewTime: now,
    remark: 'Approved for preview',
    applicant: 'operator',
    applicationTime: now,
  },
  {
    id: 2,
    name: 'Profile Background',
    type: DRESS_ENUM.Background,
    dressType: DRESS_ENUM.Background,
    status: APPROVAL_STATUS.Pending,
    approvalStatus: APPROVAL_STATUS.Pending,
    listingState: LISTING_STATUS.Offline,
    expiredDay: EXPIRED_DAY.ThirtyDay,
    iconUrl: image,
    dressUpInfos: [{ dressName: 'Blue Background', language: 'en-US' }],
    startTime: now,
    endTime: '2026-12-31 23:59:59',
    reviewer: 'reviewer',
    reviewTime: now,
    remark: 'Waiting for review',
    applicant: 'designer',
    applicationTime: now,
  },
  {
    id: 3,
    name: 'Anniversary Avatar',
    type: DRESS_ENUM.Avatar,
    dressType: DRESS_ENUM.Avatar,
    status: APPROVAL_STATUS.Approved,
    approvalStatus: APPROVAL_STATUS.Approved,
    listingState: LISTING_STATUS.Online,
    expiredDay: EXPIRED_DAY.NinetyDay,
    iconUrl: image,
    dressUpInfos: [
      { dressName: 'Anniversary Avatar', language: 'zh-CN' },
      { dressName: 'Anniversary Avatar', language: 'en-US' },
    ],
    startTime: now,
    endTime: '2026-12-31 23:59:59',
    reviewer: 'admin',
    reviewTime: now,
    remark: 'Seasonal preview item',
    applicant: 'operator',
    applicationTime: now,
  },
  {
    id: 4,
    name: 'Festival Frame',
    type: DRESS_ENUM.Frame,
    dressType: DRESS_ENUM.Frame,
    status: APPROVAL_STATUS.Pending,
    approvalStatus: APPROVAL_STATUS.Pending,
    listingState: LISTING_STATUS.Offline,
    expiredDay: EXPIRED_DAY.SevenDay,
    iconUrl: image,
    dressUpInfos: [{ dressName: 'Festival Frame', language: 'zh-CN' }],
    startTime: now,
    endTime: '2026-12-31 23:59:59',
    reviewer: 'reviewer',
    reviewTime: now,
    remark: 'Pending campaign review',
    applicant: 'designer',
    applicationTime: now,
  },
  {
    id: 5,
    name: 'Rank Background',
    type: DRESS_ENUM.Background,
    dressType: DRESS_ENUM.Background,
    status: APPROVAL_STATUS.Rejected,
    approvalStatus: APPROVAL_STATUS.Rejected,
    listingState: LISTING_STATUS.Offline,
    expiredDay: EXPIRED_DAY.ThirtyDay,
    iconUrl: image,
    dressUpInfos: [{ dressName: 'Rank Background', language: 'en-US' }],
    startTime: now,
    endTime: '2026-12-31 23:59:59',
    reviewer: 'admin',
    reviewTime: now,
    remark: 'Needs asset update',
    applicant: 'designer',
    applicationTime: now,
  },
  {
    id: 6,
    name: 'Creator Badge Look',
    type: DRESS_ENUM.Frame,
    dressType: DRESS_ENUM.Frame,
    status: APPROVAL_STATUS.Approved,
    approvalStatus: APPROVAL_STATUS.Approved,
    listingState: LISTING_STATUS.Online,
    expiredDay: EXPIRED_DAY.Forever,
    iconUrl: image,
    dressUpInfos: [
      { dressName: 'Creator Badge Look', language: 'zh-CN' },
      { dressName: 'Creator Badge Look', language: 'en-US' },
    ],
    startTime: now,
    endTime: '2026-12-31 23:59:59',
    reviewer: 'admin',
    reviewTime: now,
    remark: 'Approved for preview',
    applicant: 'operator',
    applicationTime: now,
  },
];

const boards = [
  {
    id: 1,
    name: 'Main Board',
    imageUrl: image,
    status: 1,
    toolbar: [
      { id: 1, name: 'Post' },
      { id: 2, name: 'Topic' },
    ],
    sections: [
      { id: 10, parentId: 0, name: 'Announcements', sort: 1, type: 'post' },
      { id: 11, parentId: 10, name: 'Updates', sort: 2, type: 'post' },
      { id: 12, parentId: 0, name: 'Guides', sort: 3, type: 'post' },
    ],
    operatorTime: now,
    operatorName: 'admin',
    clubDeployVersion: 'zh',
  },
  {
    id: 2,
    name: 'Game Talk',
    imageUrl: image,
    status: 1,
    toolbar: [{ id: 3, name: 'Vote' }],
    sections: [{ id: 20, parentId: 0, name: 'Strategy', sort: 1, type: 'post' }],
    operatorTime: now,
    operatorName: 'operator',
    clubDeployVersion: 'zh',
  },
  {
    id: 3,
    name: 'Strategy Hub',
    imageUrl: image,
    status: 1,
    toolbar: [
      { id: 4, name: 'Guide' },
      { id: 5, name: 'Vote' },
    ],
    sections: [
      { id: 30, parentId: 0, name: 'Builds', sort: 1, type: 'post' },
      { id: 31, parentId: 30, name: 'Advanced', sort: 2, type: 'post' },
      { id: 32, parentId: 0, name: 'Events', sort: 3, type: 'post' },
    ],
    operatorTime: now,
    operatorName: 'admin',
    clubDeployVersion: 'zh',
  },
  {
    id: 4,
    name: 'Creator Zone',
    imageUrl: image,
    status: 0,
    toolbar: [
      { id: 6, name: 'Post' },
      { id: 7, name: 'Reward' },
    ],
    sections: [
      { id: 40, parentId: 0, name: 'Highlights', sort: 1, type: 'post' },
      { id: 41, parentId: 40, name: 'Showcase', sort: 2, type: 'post' },
    ],
    operatorTime: now,
    operatorName: 'reviewer',
    clubDeployVersion: 'zh',
  },
  {
    id: 5,
    name: 'Support Desk',
    imageUrl: image,
    status: 1,
    toolbar: [
      { id: 8, name: 'FAQ' },
      { id: 9, name: 'Notice' },
    ],
    sections: [
      { id: 50, parentId: 0, name: 'Help Center', sort: 1, type: 'post' },
      { id: 51, parentId: 50, name: 'Known Issues', sort: 2, type: 'post' },
    ],
    operatorTime: now,
    operatorName: 'operator',
    clubDeployVersion: 'zh',
  },
];

const boardSections = [
  { id: 10, parentId: 0, name: 'Announcements', sort: 1, type: 'post' },
  { id: 11, parentId: 10, name: 'Updates', sort: 2, type: 'post' },
  { id: 20, parentId: 0, name: 'Strategy', sort: 3, type: 'post' },
];

const postRows = [
  {
    id: 10001,
    title: 'Welcome to the club',
    content: postContent,
    type: 'post',
    status: 1,
    rating: 1,
    boardId: 1,
    boardName: 'Main Board',
    sectionId: 10,
    sectionName: 'Announcements',
    topics: ['Welcome'],
    tags: JSON.stringify(['high-value', 'starter']),
    clickCount: 230,
    distinctViewCount: 180,
    thumbsUpCount: 42,
    commentCount: 12,
    distinctComment: 9,
    collectionUpCount: 6,
    nickName: 'PlayerOne',
    userId: '1000001',
    userName: 'player_one',
    createTime: now,
    releaseTime: now,
    auditedBy: 'admin',
    auditTime: now,
    remark: 'mock row',
    mark: 1,
  },
  {
    id: 10002,
    title: 'Build guide discussion',
    content: secondPostContent,
    type: 'post',
    status: 0,
    rating: 0,
    boardId: 2,
    boardName: 'Game Talk',
    sectionId: 20,
    sectionName: 'Strategy',
    topics: ['Guide'],
    tags: JSON.stringify(['guide']),
    clickCount: 88,
    distinctViewCount: 64,
    thumbsUpCount: 11,
    commentCount: 4,
    distinctComment: 3,
    collectionUpCount: 2,
    nickName: 'GuideMaker',
    userId: '1000002',
    userName: 'guide_maker',
    createTime: now,
    releaseTime: now,
    auditedBy: 'reviewer',
    auditTime: now,
    remark: 'needs follow-up',
    mark: 0,
  },
];

const comments = [
  {
    id: 5001,
    content: commentContent,
    postId: 10001,
    title: 'Welcome to the club',
    status: 1,
    boardName: 'Main Board',
    sectionName: 'Announcements',
    nickName: 'Commenter',
    userId: '1000003',
    userName: 'commenter',
    createTime: now,
    auditedBy: 'admin',
    auditTime: now,
    remark: 'visible mock comment',
  },
];

const avatar =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 rx=%2240%22 fill=%22%23fff1b8%22/%3E%3Ctext x=%2240%22 y=%2246%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%23ad6800%22%3EAvatar%3C/text%3E%3C/svg%3E';

const userRows = [
  {
    id: 1,
    userInfoId: 90001,
    userStatsId: 80001,
    nickName: 'PreviewUser',
    userId: '1000001',
    channelUserId: '1000001',
    userName: 'preview_user',
    passportId: 'P10001',
    passportName: 'preview_passport',
    isBc: 1,
    status: 1,
    tags: ['High Value', 'Active'],
    forumPoint: 1280,
    experience: 4300,
    activation: 8600,
    postCount: 18,
    userRoleType: 'core',
    labelType: 'High Value',
    ip: '127.0.0.1',
    birthday: '1998-06-01',
    sex: 1,
    region: 'Shanghai',
    registerTime: now,
    lastLoginTime: now,
    operationTime: now,
    remark: 'mock user',
    avatar,
  },
];

const auditRows = [
  {
    id: 7001,
    avatar,
    content: 'PreviewName',
    nickName: 'PreviewUser',
    beforeContent: 'OldName',
    status: 0,
    auditBy: 'admin',
    auditTime: now,
    channelUserId: '1000001',
    userName: 'preview_user',
    operationTime: now,
    remark: 'mock audit row',
  },
];

const creatorRows = [
  {
    id: 2001,
    index: 1,
    userId: '1000001',
    nickName: 'PreviewCreator',
    passportId: 'P10001',
    passportName: 'preview_passport',
    status: 1,
    totalLikes: 120,
    totalComments: 35,
    totalFans: 58,
    totalPosts: 16,
    totalViews: 980,
    auditedBy: 'admin',
    remark: 'approved',
    auditTime: now,
    applicant: 'PreviewCreator',
    applicationTime: now,
  },
];

const taskRows = [
  {
    id: 3001,
    isEnable: 1,
    name: 'Daily creator task',
    description: ['Publish one quality post', 'Keep comments constructive'],
    status: 1,
    beginTime: taskBeginTime,
    endTime: taskEndTime,
    date: '2026-06-04',
    remark: 'mock task',
    updateBy: 'admin',
    updateTime: now,
    createBy: 'admin',
    createTime: now,
  },
];

const lotteryRows = [
  {
    enable: 1,
    id: 6001,
    name: 'June Reward Draw',
    multiLang: { 'zh-CN': { name: 'June Reward Draw' }, 'en-US': { name: 'June Reward Draw' } },
    status: 1,
    auditedBy: 'admin',
    auditedTime: now,
    auditedRemark: 'approved',
    updateBy: 'admin',
    updateTime: now,
    realRewardTime: now,
    rewardTime: '2026-12-31 23:59:59',
  },
];

const modelSetting = {
  categoryStrength: 50,
  creationTagDecompositionStrength: 10,
  creationMatchLevel: 8,
  postCount: 20,
  commentCount: 10,
  likeCount: 15,
  favoriteCount: 5,
  viewCount: 25,
  postMatch: 70,
  activityMatch: 50,
  associationStrength: 50,
  commentRule: 'Keep replies specific and friendly.',
  commentPostThreshold: 500,
  commentActivityThreshold: 100,
  baseScore: 100,
  priority: 10,
  modelMatchScore: 30,
  freshnessScore: 20,
};

// Appearance / DressUp
export const getDressUpList = (..._args: any[]) => ok(mockAppearanceList);
export const getAllDressUp = (..._args: any[]) => ok(mockAppearanceList);
export const addDressUp = (data: any) => ok(data);
export const editDressUp = (data: any) => ok(data);
export const deleteDressUp = (id: any) => ok({ id });
export const auditDressUp = (data: any) => ok(data);

// Board
export const getBoardList = (..._args: any[]) => ok(boards);
export const addBoard = (data: any) => ok(data);
export const editBoard = (data: any) => ok(data);
export const deleteBoard = (id: any) => ok({ id });
export const changeStatus = (..._args: any[]) => ok(null);
export const getBoardGameVersion = (..._args: any[]) =>
  ok([{ gameId: 1, gameVersion: 'v1', deployVersion: 'zh', name: 'Demo Game' }]);
export const getBoardSection = (..._args: any[]) => ok(boardSections);
export const boardCheckName = (..._args: any[]) => ok(false);
export const getCdkList = (..._args: any[]) =>
  ok([{ id: 1, gameId: 1, gameVersion: 'v1', cdkey: 'PREVIEW-CDK-001' }]);
export const getSectionByBoard = (..._args: any[]) => ok(boardSections);
export const submitAccountBatch = (data: any) => ok(data);
export const validateAccountBatch = (data: any) => ok(data);

// Banner
export const getBannerList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      hasEnable: 1,
      name: 'Homepage Banner',
      image,
      positions: '0,10',
      status: 1,
      redirection: 'https://example.com',
      visitCount: 1200,
      uniqueUserCount: 840,
      startTime: now,
      endTime: '2026-12-31 23:59:59',
      auditedBy: 'admin',
      auditedTime: now,
      creator: 'admin',
      createTime: now,
    },
  ]);
export const addBanner = (data: any) => ok(data);
export const editBanner = (data: any) => ok(data);
export const deleteBanner = (id: any) => ok({ id });
export const changeBannerStatus = (..._args: any[]) => ok(null);
export const sortBanner = (data: any) => ok(data);
export const auditBanner = (data: any) => ok(data);

// Content / Post
export const getBasePostList = (..._args: any[]) => ok(postRows);
export const batchOperatePost = (data: any) => ok(data);
export const batchImportPost = (data: any) => ok(data);
export const postRecommend = (data: any) => ok(data);
export const postToTop = (data: any) => ok(data);
export const setPostWeight = (data: any) => ok(data);
export const postRating = (data: any) => ok(data);
export const addPostAuditRemark = (data: any) => ok(data);
export const updatePostAuditRemark = (data: any) => ok(data);
export const getPostAuditRemark = (..._args: any[]) => ok([{ id: 1, remark: 'Mock audit remark' }]);
export const postBatchAudit = (data: any) => ok(data);
export const commentToTop = (data: any) => ok(data);
export const getPostVoteHref = (..._args: any[]) => ok('https://example.com/vote');
export const getVoteDetails = (..._args: any[]) => ok({ items: [{ id: 1, option: 'A', count: 10 }], total: 10 });
export const getVoteRecord = (..._args: any[]) => ok([{ id: 1, userId: '1000001', option: 'A', createTime: now }]);

// Creator
export const getCreatorList = (..._args: any[]) => ok(creatorRows);
export const addCreator = (data: any) => ok(data);
export const revokeCreator = (data: any) => ok(data);
export const batchAuditCreator = (data: any) => ok(data);
export const getCreatorData = (..._args: any[]) =>
  ok({ totalLikes: 120, totalComments: 35, totalFans: 58, totalPosts: 16, totalViews: 980 });
export const getCreatorUserList = (..._args: any[]) => ok(userRows);
export const addCreatorTask = (data: any) => ok(data);
export const editCreatorTask = (data: any) => ok(data);
export const batchAuditCreatorTask = (data: any) => ok(data);

// Emotions
export const getEmoticonList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      name: 'Smile Pack',
      icon: image,
      list: JSON.stringify([image, image]),
      status: 1,
      auditedBy: 'admin',
      auditedTime: now,
      updateBy: 'admin',
      updateTime: now,
    },
  ]);
export const createEmoticon = (data: any) => ok(data);
export const updateEmoticon = (data: any) => ok(data);
export const removeEmoticon = (id: any) => ok({ id });
export const sortEmoticon = (data: any) => ok(data);
export const auditEmoticon = (data: any) => ok(data);

// Encyclopedia
export const getPediaList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      enable: 1,
      name: 'Starter Guide',
      columns: [
        { id: 1, name: 'Overview', sort: 1, type: 'post' },
        { id: 2, name: 'Advanced Tips', sort: 2, type: 'post' },
      ],
      type: 'common',
      multiLangColumns: {
        'en-US': { sort: 0, name: 'Starter Guide', columns: [{ id: 1, name: 'Overview', sort: 1 }] },
      },
      status: 1,
      showType: 1,
      boardId: 1,
      updateBy: 'admin',
      updateTime: now,
      remark: 'mock encyclopedia row',
      creator: 'admin',
      createTime: now,
    },
  ]);
export const addPedia = (data: any) => ok(data);
export const updatePedia = (data: any) => ok(data);
export const deletePedia = (id: any) => ok({ id });
export const sortPedia = (data: any) => ok(data);
export const changePediaStatus = (..._args: any[]) => ok(null);
export const auditPedia = (data: any) => ok(data);
export const getEncyclopediaGroupList = (..._args: any[]) => ok([{ id: 1, name: 'Default Group' }]);
export const batchCopyEncyclopediaGroup = (data: any) => ok(data);
export const batchSyncEncyclopediaGroup = (data: any) => ok(data);
export const checkEncyclopediaNameExists = (..._args: any[]) => ok({ exists: false });
export const existsEncyclopedia = (..._args: any[]) => ok({ exists: false });

// Log / Report
export const getComplaintRecord = (..._args: any[]) =>
  ok([
    {
      id: 1,
      nickname: 'Reporter',
      channelUserId: '1000001',
      userName: 'reporter',
      type: 'post',
      fromNickName: 'PreviewUser',
      fromChannelUserId: '1000002',
      fromUserName: 'preview_user',
      source: 'app',
      description: 'Mock report description',
      image: [{ src: image }],
      createTime: now,
      auditResult: 1,
      remark: 'handled',
      auditName: 'admin',
      auditTime: now,
    },
  ]);
export const getComplaintRecordHref = (..._args: any[]) => exportOk();
export const auditComplaintRecord = (data: any) => ok(data);

// Lottery
export const getLotteryList = (..._args: any[]) => ok(lotteryRows);
export const getLotteryDetail = (..._args: any[]) =>
  ok({
    ...lotteryRows[0],
    id: 6001,
    name: 'June Reward Draw',
    userId: 1000001,
    nickName: 'PreviewCreator',
    postId: 10001,
    count: 3,
    remark: 'Preview lottery activity',
    rewardTime: '2026-12-31 23:59:59',
    condition: ['discuss'],
    isAssociatedAuthor: 0,
    followConditionList: [],
    lotteryRewards: [{ rewardEnum: 1, id: 1001, name: 'Gold Pack', number: 100 }],
    voteOption: [],
    commentFloor: [],
    status: 1,
  });
export const createLottery = (data: any) => ok(data);
export const editLottery = (data: any) => ok(data);
export const getLotteryPostList = (..._args: any[]) =>
  ok(
    postRows.map(item => ({
      ...item,
      type: 0,
      votes: [
        { id: 1, content: 'Option A' },
        { id: 2, content: 'Option B' },
      ],
    }))
  );
export const getLotteryUserList = (..._args: any[]) =>
  ok(
    userRows.map(item => ({
      id: item.id,
      userId: Number(item.userId),
      userName: item.userName,
      nickName: item.nickName,
    }))
  );
export const delLottery = (id: any) => ok({ id });
export const enableLottery = (data: any) => ok(data);
export const batchAuditLottery = (data: any) => ok(data);
export const getLotteryLogList = (..._args: any[]) =>
  ok([
    {
      id: 9001,
      index: 1,
      userId: '1000001',
      nickName: 'LuckyUser',
      passportId: 'P10001',
      userName: 'lucky_user',
      roleId: 'R1',
      roleName: 'Warrior',
      worldId: 1,
      status: 1,
      reward: JSON.stringify([{ RewardEnum: 2, Name: 'Gold Pack', Number: 100 }]),
      rewardEnum: 2,
      name: 'Lucky User',
      phone: '13800000000',
      province: 'Shanghai',
      city: 'Pudong',
      address: 'No. 100 Preview Road',
      confirmTime: now,
    },
  ]);
export const searchLotteryAuthor = (..._args: any[]) => ok([{ id: 1, name: 'admin' }]);

// Push
export const getPushMessageList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      title: 'Maintenance Notice',
      content: 'Preview push message content',
      status: 1,
      isPushAll: 'all',
      image,
      senderList: [{ id: 1, name: 'All Users', userId: 1000001, userName: 'preview_user', nickName: 'PreviewUser', isPass: true }],
      pushTime: now,
      auditedBy: 'admin',
      auditedTime: now,
      remark: 'mock push',
      updateBy: 'admin',
      updateTime: now,
    },
  ]);
export const createPushMessage = (data: any) => ok(data);
export const updatePushMessage = (data: any) => ok(data);
export const removePushMessage = (id: any) => ok({ id });
export const auditPushMessage = (data: any) => ok(data);

// Statistics
export const getStatisticsSummary = (..._args: any[]) =>
  ok({
    gameActiveAccountCount: 620,
    pv: 5600,
    uv: 2200,
    actiCount: 780,
    memberActinums: 510,
    actiRate: '65%',
    registerCount: 45,
    dailyactinums: 700,
    dailyactiRate: '58%',
    postCount: 280,
    dynamicsCount: 120,
    commontCount: 760,
    likeCount: 2100,
    userPostCount: 124,
    userDynamicsCount: 68,
    userCommentCount: 350,
    userLikeCount: 920,
  });
export const getStatisticsDaily = (..._args: any[]) =>
  ok([
    {
      statisticsDate: '20260604',
      gameActiveAccountCount: 620,
      pv: 5600,
      uv: 2200,
      actiCount: 780,
      memberActinums: 510,
      actiRate: '65%',
      registerCount: 45,
      dailyactinums: 700,
      dailyactiRate: '58%',
      postCount: 32,
      dynamicsCount: 18,
      commontCount: 76,
      likeCount: 210,
      userPostCount: 24,
      userDynamicsCount: 12,
      userCommentCount: 50,
      userLikeCount: 180,
    },
  ]);
export const getStatisticsDailyHerf = (..._args: any[]) => exportOk();

// Topic
export const getClubTopicList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      status: 1,
      name: 'Hot Topic',
      type: 0,
      introduction: 'Preview topic introduction',
      icon: image,
      articleCount: 42,
      auditStatus: 1,
      auditor: 'admin',
      auditTime: now,
      remark: 'mock topic',
      applicant: 'operator',
      applicationTime: now,
    },
  ]);
export const addClubTopic = (data: any) => ok(data);
export const editClubTopic = (data: any) => ok(data);
export const deleteClubTopic = (id: any) => ok({ id });
export const changeClubTopicStatus = (..._args: any[]) => ok(null);
export const topTopic = (data: any) => ok(data);
export const auditClubTopic = (data: any) => ok(data);

// User
export const getUserList = (..._args: any[]) => ok(userRows);
export const getUserListHref = (..._args: any[]) => exportOk();
export const editUserinfo = (data: any) => ok(data);
export const changeUserinfoStatus = (data: any) => ok(data);
export const checkUserId = (..._args: any[]) => ok({ exists: false });
export const getUserTag = (..._args: any[]) => ok([{ id: 1, name: 'High Value' }, { id: 2, name: 'Active' }]);
export const getUserExperience = (..._args: any[]) =>
  ok([{ id: 1, type: 'post', value: 20, createTime: now, remark: 'mock experience' }]);
export const getUserExperienceHref = (..._args: any[]) => exportOk();
export const getUserAuditLog = (..._args: any[]) => ok(auditRows);
export const getUserAuditLogHref = (..._args: any[]) => exportOk();
export const userAudit = (data: any) => ok(data);
export const userAuditCancel = (data: any) => ok(data);
export const userMachineAudit = (data: any) => ok(data);
export const getLikeListHref = (..._args: any[]) => exportOk();
export const getlikeList = (..._args: any[]) =>
  ok([{ id: 1, postId: 10001, userId: '1000001', createTime: now }]);

// AI / Model
export const getModelSetting = (..._args: any[]) => ok(modelSetting);
export const updateModelSetting = (data: any) => ok(data);
export const getModelTag = (..._args: any[]) =>
  ok([
    { id: 1, name: 'High Value', tags: JSON.stringify(['spender', 'active']), count: 120 },
    { id: 2, name: 'New User', tags: JSON.stringify(['fresh', 'tutorial']), count: 75 },
    { id: 3, name: 'Other', tags: JSON.stringify(['other']), count: 30, isOther: true },
  ]);

// Additional exports used by feature pages
export const getPostList = (..._args: any[]) => ok(postRows);
export const getPostListHref = (..._args: any[]) => exportOk();
export const getCommentList = (..._args: any[]) => ok(comments);
export const getCommentListHref = (..._args: any[]) => exportOk();
export const commentBatchAudit = (data: any) => ok(data);
export const commentBatchDelete = (data: any) => ok(data);
export const commentBatchMachineAudit = (data: any) => ok(data);
export const garbageCommentRestore = (data: any) => ok(data);
export const garbagePostRestore = (data: any) => ok(data);
export const getGarbagePostList = (..._args: any[]) =>
  ok(postRows.map(item => ({ ...item, deleteBy: 'admin', deleteTime: now })));
export const getGarbageCommentList = (..._args: any[]) =>
  ok(comments.map(item => ({ ...item, deleteBy: 'admin', deleteTime: now })));
export const postBatchDelete = (data: any) => ok(data);
export const postBatchMachineAudit = (data: any) => ok(data);
export const batchMigratePostSection = (data: any) => ok(data);
export const postRevoked = (data: any) => ok(data);
export const postSink = (data: any) => ok(data);
export const postBoutique = (data: any) => ok(data);
export const postLimitComment = (data: any) => ok(data);
export const getCoordinatorApplyList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      reason: 'Apply for coordinator',
      type: 1,
      operate: 'delete',
      objectId: 10001,
      objectContent: postContent,
      status: 0,
      boardName: 'Main Board',
      sectionName: 'Announcements',
      nickName: 'CoordinatorUser',
      channelUserId: '1000004',
      userName: 'coordinator_user',
      auditBy: 'admin',
      auditTime: now,
      auditReason: 'pending preview',
      createTime: now,
    },
  ]);
export const auditCoordinatorApply = (data: any) => ok(data);
export const removeCoordinatorApply = (id: any) => ok({ id });
export const downloadCoordinatorApplyList = (..._args: any[]) => exportOk();
export const getCreatorTaskList = (..._args: any[]) => ok(taskRows);
export const getCreatorAuditTaskList = (..._args: any[]) => ok(taskRows);
export const getCreatorTaskDetail = (..._args: any[]) => ok(taskRows[0]);
export const sortCreatorTask = (data: any) => ok(data);
export const toggleCreatorTaskEnable = (data: any) => ok(data);
export const deleteCreatorTask = (id: any) => ok({ id });
export const getLotteryAwardsList = (..._args: any[]) =>
  ok([{ id: 1, name: 'Gold Pack', type: 1, num: 100, rewardEnum: 1 }]);
export const getLotteryPrizepoolUser = (..._args: any[]) => ok(userRows);
export const downloadLotteryUserList = (..._args: any[]) => exportOk();
export const confirmLottery = (data: any) => ok(data);
export const updateLotteryRecord = (data: any) => ok(data);
export const getConversationRecordList = (..._args: any[]) =>
  ok([
    {
      id: 1,
      conversationId: 'C-10001',
      nickName: 'PreviewUser',
      userId: '1000001',
      passportId: 'P10001',
      detail: 'Question and answer preview',
      dialogueTurns: 4,
      standardResponses: 3,
      standardSatisfactionPercent: 92,
      freeResponses: 1,
      freeSatisfactionPercent: 88,
    },
  ]);
export const getConversationMessageList = (..._args: any[]) =>
  ok([{ id: 1, content: 'Hello AI', role: 'user', createdAt: now }]);
export const getConversationStatistics = (..._args: any[]) =>
  ok({
    totalConversationsCount: 18,
    totalUsers: 12,
    dialogueTurnsPercent: '4.2',
    totalStandardResponses: 30,
    standardSatisfactionPercent: 92,
    totalFreeResponses: 10,
    freeSatisfactionPercent: 88,
  });
export const downloadConversationRecordListHerf = (..._args: any[]) => exportOk();
export const getAllChannel = (..._args: any[]) =>
  ok([{ id: 1, name: 'Official', value: 'official' }, { id: 2, name: 'Web', value: 'web' }]);
export const getClubToken = () => ok({ token: 'mock-token' });
