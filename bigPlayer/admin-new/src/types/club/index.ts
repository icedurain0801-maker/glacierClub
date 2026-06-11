export type CLUB_DEPLOY_VERSION = 'zh' | 'en' | string;

export const BOARD_PERMIT_SEPARATE = '&&';
export const CLUB_APP_ID = 'club';
export const CLUB_OSS_PREFIX = 'https://opsoss.q1.com/club/';

export enum CLUB_ENVIRONMENT_ENUM {
  Dev = 'dev', Test = 'test', Pre = 'pre', Prod = 'prod', EN = 'en', ZH = 'zh',
}

export const ClubDeployVersionConstant: Record<string, string> = { zh: '国内 (zh)', en: '海外 (en)' };

export const ClubDeployVersionOptionsData = [
  { label: '国内 (zh)', value: 'zh' },
  { label: '海外 (en)', value: 'en' },
];

export interface BoardPermitOptionsChild {
  id: number | string; label: string; value: string;
}
export interface BoardPermitOptionsType {
  label: string; value: string; children: BoardPermitOptionsChild[];
}
export interface BoardPermitType {
  id: number | string; label: string; value: string; deployVersionId: string;
}

// Board
export const BOARD_STATUS = { Enable: 1, Disable: 0, Open: 1, Close: 0 } as const;
export const BOARD_PERMIT_SEPARATE_VALUE = '&&';
export interface BoardEditParams { id?: number; name?: string; status?: number; boardId?: string; [k: string]: any }
export interface BoardSectionType { id: number; name: string; sort: number }
export const BindTypeOptions = [{ label: '绑定', value: 1 }, { label: '不绑定', value: 0 }];
export const DownloadTypeOptions = [{ label: 'Android', value: 1 }, { label: 'iOS', value: 2 }];
export const DOWNLOAD_TYPE_ENUM = { Android: 1, IOS: 2, Download: 1, NoDownload: 0 } as const;
export type ModelTag = { id: number; name: string; color?: string };
export const getModelTag = (tags: ModelTag[]) => tags;

// Content / Post
export interface PostListItem {
  id: number; title: string; content?: string; boardId?: number; status?: number;
  createdAt?: string; createdBy?: string; [k: string]: any;
}
export const AUDIT_STATUS = {
  Pass: 1,
  Passed: 1,
  Reject: 2,
  Rejected: 2,
  Pending: 0,
  PenddingReview: 0,
  Revoked: 3,
  MachinePassed: 4,
  MachineBatchPassed: 5,
  MachineBatchRejected: 6,
} as const;
export type AUDIT_STATUS = typeof AUDIT_STATUS[keyof typeof AUDIT_STATUS];
export const AuditStatusColor: Record<number, string> = { 0: 'default', 1: 'success', 2: 'error' };
export const AuditStatusConstant: Record<number, string> = { 0: '待审核', 1: '已通过', 2: '已拒绝' };
export const PostAuditOptions = [
  { label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }, { label: '已拒绝', value: 2 },
];
export const recordAndCancleStatusOptionsData = [
  { label: '正常', value: 1 }, { label: '已撤销', value: 0 },
];
export const recordStatusOptionsData = [
  { label: '全部', value: '' }, { label: '正常', value: 1 }, { label: '异常', value: 0 },
];
export const ActiveKeyType = { Record: 'Record', Audit: 'Audit' } as const;
export type ActiveKeyType = typeof ActiveKeyType[keyof typeof ActiveKeyType];
export const POST_RATING = { Good: 1, Bad: 0 } as const;
export const PostRatingOptions = [{ label: '好评', value: 1 }, { label: '差评', value: 0 }];
export const CLUB_REMARK_ENUM = { System: 'system', Manual: 'manual' } as const;
export type RichTextType = { Type: string; Data: string; [k: string]: any };
export const RICH_TEXT_TYPE_ENUM = {
  Text: 'text',
  Link: 'link',
  Image: 'image',
  Video: 'video',
  Emoji: 'emoji',
  Vote: 'vote',
  Html: 'html',
  Markdown: 'markdown',
} as const;
export type RICH_TEXT_TYPE_ENUM = typeof RICH_TEXT_TYPE_ENUM[keyof typeof RICH_TEXT_TYPE_ENUM];
export type MOMENT_TYPE = 'post' | 'vote' | string;
export const MOMENT_TYPE = { Post: 'post', Vote: 'vote', Image: 'image', Feeling: 'feeling' } as const;
export const MomentTypeOptionsData = [{ label: '帖子', value: 'post' }, { label: '投票', value: 'vote' }];
export const MomentFilterOptionsData = [{ label: '全部', value: '' }, ...MomentTypeOptionsData];

// Banner
export interface BannerListResponse { id: number; title: string; imageUrl: string; status: number; [k: string]: any }
export const BannerAuditOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];
export const BannerAuditOptionsData = BannerAuditOptions;
export const BannerRecordOptionsData = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];
export const BANNER_IMAGEURL_VISIBLE = { Show: 1, Hide: 0, Open: 1, Close: 0 } as const;

// Pedia / Encyclopedia
export type PEDIA_TYPE = 'common' | 'game' | string;
export const PEDIA_TYPE = { Common: 'common', Game: 'game' } as const;
export interface PediaListResponse { id: number; name: string; type: string; status: number; [k: string]: any }
export const PediaAuditOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];
export const PediaAuditOptionsData = PediaAuditOptions;
export const PediaRecordOptionsData = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];

// Lottery
export interface LotteryListResponse { id: number; title: string; status: number; [k: string]: any }
export const LOTTERY_STATUS = { Enable: 1, Disable: 0, Pending: 2, Approved: 1, Rejected: 3, Over: 0 } as const;
export const CONDITIONENUM = {
  Attention: 'attention',
  Discuss: 'discuss',
  Upvote: 'upvote',
  Collect: 'collect',
  Vote: 'vote',
} as const;
export const LotteryConditonConstant: Record<string, string> = {
  [CONDITIONENUM.Attention]: '关注作者',
  [CONDITIONENUM.Discuss]: '评论互动',
  [CONDITIONENUM.Upvote]: '点赞内容',
  [CONDITIONENUM.Collect]: '收藏内容',
  [CONDITIONENUM.Vote]: '参与投票',
};
export const FLOOR_RULE_ENUM = { Random: 1, Assign: 2 } as const;
export const KEYWORD_ENABLE_ENUM = { Open: 1, Close: 0 } as const;
export const KEYWORD_MODE_ENUM = { Exact: 1, Unlimt: 0 } as const;
export const KeywordModeOptions = [
  { label: '指定关键词', value: KEYWORD_MODE_ENUM.Exact },
  { label: '不限关键词', value: KEYWORD_MODE_ENUM.Unlimt },
];
export const VOTE_MODE_ENUM = { None: 0, Fixed: 1 } as const;
export const LotteryAuditOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];
export const LotteryRecordOptionsData = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];
export interface ActivityPrizeItem { id: number; name: string; type: number; [k: string]: any }
export const PRIZEENUM = {
  Prop: 1,
  Entity: 2,
  EmpiricalValue: 3,
  MemberPoint: 4,
  Dressup: 5,
  Gold: 1,
  Goods: 2,
  Coupon: 3,
} as const;
export type PRIZEENUM = typeof PRIZEENUM[keyof typeof PRIZEENUM];
export const PrizeConstant: Record<number, string> = { 1: '道具', 2: '实物', 3: '经验', 4: '会员积分', 5: '个性装扮' };
export const PrizeFieldConstant: Record<string | number, string> = {
  1: '道具',
  2: '实物',
  3: '经验',
  4: '会员积分',
  5: '个性装扮',
  num: '数量',
  name: '奖品名',
};
export const PrizeFieldType: Record<string, number> = {
  道具: PRIZEENUM.Prop,
  实物: PRIZEENUM.Entity,
  经验: PRIZEENUM.EmpiricalValue,
  会员积分: PRIZEENUM.MemberPoint,
  个性装扮: PRIZEENUM.Dressup,
};
export interface LotteryAuthorSearchItem { id: number; name: string }
export interface VoteItem { id: number; content: string; name?: string; [k: string]: any }
export interface LotteryPostResponse {
  id: number;
  title?: string;
  content?: string;
  type?: number | string;
  lotteryId?: number;
  votes?: VoteItem[];
  [k: string]: any;
}
export interface LotteryUserResponse {
  id?: number;
  userId: number;
  userName?: string;
  nickName?: string;
  value?: number;
  label?: string;
  [k: string]: any;
}
export interface LotteryRewardsType {
  rewardEnum: number;
  name: string;
  id?: number | string;
  number?: number;
  childType?: string | number;
  [k: string]: any;
}
export interface LotteryProvideItem {
  id?: number;
  status?: number;
  userId?: number;
  nickName?: string;
  postId?: number;
  rewardTime?: string;
  lotteryRewards?: LotteryRewardsType[];
  followConditionList?: LotteryUserResponse[];
  voteOption?: VoteItem[];
  commentFloor?: number[];
  [k: string]: any;
}
export interface LotteryCreateParams { [k: string]: any }
export interface LotteryEditParams extends LotteryCreateParams { id?: number; status?: number }
export type PrizeFieldValuesType = string;

// Push
export interface PushMessageItem { id: number; title: string; status: number; [k: string]: any }
export const PUSH_STATUS_TYPE = { Draft: 0, Sent: 1, Pending: 2 } as const;
export const PushAuditOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }];
export const MAX_PUSH_TITLE = 50;
export const MAX_PUSH_CONTENT = 500;

// Statistics
export interface StatisticsSummaryRes { totalPost: number; totalUser: number; [k: string]: any }
export interface StatisticsDailyItem { date: string; postCount: number; userCount: number }

// User
export interface UserinfoListResponse { id: number; name: string; status: number; [k: string]: any }
export interface NicknameListType { id: number; nickname: string; userId: number; status: number; [k: string]: any }
export interface AvatarListType { id: number; userId: number; avatar: string; status: number; [k: string]: any }
export interface UserTag { id: number; name: string; color?: string }
export interface LikeListItem { id: number; postId: number; userId: number }
export interface ChangerUsersType { id: number; name: string }
export const UesrsexConstant: Record<number, string> = { 0: '未知', 1: '男', 2: '女' };
export const USER_LOG_TYPE = { Login: 'login', Audit: 'audit', Forbid: 'forbid' } as const;
export const NickNameAuditFilterOptionsData = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];
export const NickNameRecordFilterOptionsData = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];
export const MAX_MACHINE_AUDIT_NUMS = 100;

// AI / Model
export interface ModelSetting { modelId: string; params: Record<string, any> }
export interface ConversationMessageItem { id: number; content: string; role: string; createdAt: string }
export interface MessageAuditOptions { label: string; value: string | number }
export const MessageRecordOptions = [{ label: '全部', value: '' }];
export interface CheckSenderList { id: number; name: string }
export interface SenderList { id: number; name: string }
export const EMOTICON_STATUS = { Enable: 1, Disable: 0 } as const;
export interface EmoticonItem { id: number; name: string; url: string; status: number; [k: string]: any }
export const EmoticonAuditOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];

// User status
export const UESRSTATUS = { Normal: 1, Forbidden: 0, Banned: 2 } as const;
export type UESRSTATUS = typeof UESRSTATUS[keyof typeof UESRSTATUS];
export const UesrstatusConstant: Record<number, string> = { 1: '正常', 0: '封禁', 2: '永久封禁' };
export const UesrstatusColorConstant: Record<number, string> = { 1: 'success', 0: 'error', 2: 'error' };
export const UesrstatusOptionsData = [
  { label: '全部', value: '' },
  { label: '正常', value: 1 },
  { label: '封禁', value: 0 },
  { label: '永久封禁', value: 2 },
];
export const UesrNickNameOptionsData = [
  { label: '全部', value: '' },
  { label: '已设置', value: 1 },
  { label: '未设置', value: 0 },
];
export const AvatarRecordFilterOptionsData = [
  { label: '全部', value: '' },
  { label: '待审核', value: 0 },
  { label: '已通过', value: 1 },
  { label: '已拒绝', value: 2 },
];

// Date filters
export const DATE_TYPE = { Day: 'day', Week: 'week', Month: 'month', Custom: 'custom', Forever: 'forever' } as const;
export type DATE_TYPE = typeof DATE_TYPE[keyof typeof DATE_TYPE];
export const DateTypeConstant: Record<string, string> = { day: '按日', week: '按周', month: '按月', custom: '自定义' };
export const DateTypeOptionsData = [
  { label: '按日', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按月', value: 'month' },
  { label: '自定义', value: 'custom' },
];
export const DATE_VALUE = { Today: 'today', Yesterday: 'yesterday', Last7: 'last7', Last30: 'last30', Forever: 'forever' } as const;
export type DATE_VALUE = typeof DATE_VALUE[keyof typeof DATE_VALUE];
export const DateValueOptionsData = [
  { label: '今日', value: 'today' },
  { label: '昨日', value: 'yesterday' },
  { label: '近7天', value: 'last7' },
  { label: '近30天', value: 'last30' },
];

// Actions
export const ActionsKeys = { Edit: 'edit', Delete: 'delete', Audit: 'audit', View: 'view' } as const;

// Misc
export interface IdNameOptionsType { id: number; name: string }
export type VoteDetailItem = { id: number; option: string; count: number }
export interface VoteDetailResponse { items: VoteDetailItem[]; total: number }
export interface VoteRecordQuery { postId: number; page?: number }

export const BOARD_STATUS2 = { Enable: 1, Disable: 0 } as const;
export const BoardstatusConstant: Record<number, string> = { 1: '启用', 0: '禁用' };
export const ClubDeployVersionValues = ['zh', 'en'];

export const BATCH_OPERATE_POST_TYPE = { Delete: 'delete', Sink: 'sink', Revoke: 'revoke' } as const;
export const BatchOperateTypeConstants: Record<string, string> = { delete: '删除', sink: '沉帖', revoke: '撤销' };
export const BatchOperateTypeOptions = Object.entries(BatchOperateTypeConstants).map(([value, label]) => ({ label, value }));
export const PostOperationOptions = [{ label: '删除', value: 'delete' }, { label: '沉帖', value: 'sink' }];
export const PostOperationStatusConstants: Record<string, string> = { delete: '已删除', sink: '已沉帖' };
export const PostOperationStatusOptions = Object.entries(PostOperationStatusConstants).map(([value, label]) => ({ label, value }));
export const CancelPostOperationStatus = { Cancel: 'cancel' } as const;
export const CancelOperationStatusMap: Record<string, string> = { cancel: '已撤销' };
export const BatchCancelOperationStatusConstants = CancelOperationStatusMap;
export const AuditPostTypeOptions = [{ label: '通过', value: 1 }, { label: '拒绝', value: 2 }];
export const AuditPostTypeConstants: Record<number, string> = { 1: '通过', 2: '拒绝' };
export const POST_FILTER = { All: '', Pending: 0, Pass: 1, Reject: 2, ID: 'id', TITLE: 'title' } as const;
export const CLUB_FILTER = { All: '', PassportId: 'passportId', PassportName: 'passportName', NickName: 'nickName' } as const;
export const ClubFilterOptions = [
  { label: '通行证ID', value: CLUB_FILTER.PassportId },
  { label: '通行证名称', value: CLUB_FILTER.PassportName },
  { label: '昵称', value: CLUB_FILTER.NickName },
];
export const ClubFilterDataConstant: Record<string, string> = {
  [CLUB_FILTER.PassportId]: 'passportId',
  [CLUB_FILTER.PassportName]: 'passportName',
  [CLUB_FILTER.NickName]: 'nickName',
};
export const COMMENT_FILTER = { All: '', ID: 'id', POST: 'postId', TITLE: 'content' } as const;
export const CommentFilterData = [
  { label: '评论ID', value: COMMENT_FILTER.ID },
  { label: '帖子ID', value: COMMENT_FILTER.POST },
  { label: '评论内容', value: COMMENT_FILTER.TITLE },
];
export const CommentFilterDataConstant: Record<string, string> = {
  [COMMENT_FILTER.ID]: 'id',
  [COMMENT_FILTER.POST]: 'postId',
  [COMMENT_FILTER.TITLE]: 'content',
};
export const COMMENT_FILTER_AUDIT_OPTIONS = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];
export const COMMENT_FILTER_RECORD_OPTIONS = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];
export const MachineAuditIncludsStatus = [0, 1, 2];
export const auditIncludsStatus = [0, 1, 2];
export const recordIncludsStatus = [1];
export const postRecordIncludsStatus = [1];
export const postRecordStatusOptionsData = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];
export const ACTIVE_SOURCE = ['app', 'web', 'manual', 'machine'] as const;
export const SIMPLE_AUDIT_STATUS = {
  Pending: 0,
  PenddingReview: 0,
  Pass: 1,
  Rejected: 2,
  Reject: 2,
} as const;
export const SimpleAuditStatusOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }, { label: '已拒绝', value: 2 }];
export const SimpleAuditStatusConstants: Record<number, string> = { 0: '待审核', 1: '已通过', 2: '已拒绝' };
export const SimpleAuditStatusColor: Record<number, string> = { 0: 'default', 1: 'success', 2: 'error' };
export const MAX_AUDIT_NUMS = 50;
export interface GuessDataType {
  order: number;
  name: string;
  iconUrl: string;
  replyMode: string;
  prompts: string;
  [k: string]: any;
}
export const DEFALUT_GUESS_DATA: GuessDataType[] = [
  { order: 0, name: '玩法攻略', iconUrl: '', replyMode: 'auto', prompts: '围绕玩法攻略给玩家一个可继续追问的问题。' },
  { order: 1, name: '角色养成', iconUrl: '', replyMode: 'auto', prompts: '围绕角色养成给玩家一个可继续追问的问题。' },
  { order: 2, name: '活动奖励', iconUrl: '', replyMode: 'auto', prompts: '围绕活动奖励给玩家一个可继续追问的问题。' },
];
export const COORDINATOR_FILTER = {
  All: '',
  Id: 'id',
  ObjectId: 'objectId',
  Title: 'title',
  ChannelUserId: 'channelUserId',
  NickName: 'nickName',
} as const;
export const CoordinatorFilterConstant: Record<string, string> = {
  [COORDINATOR_FILTER.Id]: 'id',
  [COORDINATOR_FILTER.ObjectId]: 'objectId',
  [COORDINATOR_FILTER.Title]: 'title',
  [COORDINATOR_FILTER.ChannelUserId]: 'channelUserId',
  [COORDINATOR_FILTER.NickName]: 'nickName',
};
export const CoordinatorFilterOptions = [
  { label: '申请ID', value: COORDINATOR_FILTER.Id },
  { label: '内容ID', value: COORDINATOR_FILTER.ObjectId },
  { label: '内容关键词', value: COORDINATOR_FILTER.Title },
];
export const CoordinatorUserFilterOptions = [
  { label: '申请人账号ID', value: COORDINATOR_FILTER.ChannelUserId },
  { label: '申请人昵称', value: COORDINATOR_FILTER.NickName },
];
export const COMPLAINT_AUDIT_STATUS = { Pending: 0, OnAudit: 0, Pass: 1, Success: 1, Reject: 2, Fail: 2 } as const;
export const COMPLAINT_FILTER = { All: '', ID: 'id', PassportId: 'passportId', NickName: 'nickName' } as const;
export const COMPLAINT_SOURCE = { App: 'app', Web: 'web' } as const;
export const ComplaintAuditConstants: Record<number, string> = { 0: '待处理', 1: '已处理', 2: '已忽略' };
export const ComplaintConstants: Record<string, string> = {};
export const ComplaintOptions = [{ label: '全部', value: '' }];
export const ComplaintResultOptions = [{ label: '已处理', value: 1 }, { label: '已忽略', value: 2 }];
export const ComplaintRecordFilterConstants: Record<string, string> = {
  [COMPLAINT_FILTER.ID]: 'id',
  [COMPLAINT_FILTER.PassportId]: 'passportId',
  [COMPLAINT_FILTER.NickName]: 'nickName',
};
export const ComplaintRecordFilterOptions = [
  { label: '举报ID', value: COMPLAINT_FILTER.ID },
  { label: '通行证ID', value: COMPLAINT_FILTER.PassportId },
  { label: '昵称', value: COMPLAINT_FILTER.NickName },
];
export const ComplaintSourceConstants: Record<string, string> = { app: 'APP', web: 'Web' };
export const LogGetStatusConstant: Record<number, string> = { 1: '正常', 0: '异常' };
export const LogGetStatusColor: Record<number, string> = { 1: 'success', 0: 'error' };
export const BANNER_STATUS = { Enable: 1, Disable: 0, Approved: 1, Pending: 0, Rejected: 2 } as const;
export const BannerStatusConstant: Record<number, string> = { 1: '启用', 0: '禁用' };
export const BannerStatusColor: Record<number, string> = { 1: 'success', 0: 'error' };
export const EmoticonRecordOptions = [{ label: '全部', value: '' }, { label: '启用', value: 1 }, { label: '禁用', value: 0 }];
export const EmoticonStatusConstants: Record<number, string> = { 1: '启用', 0: '禁用' };
export const EmoticonsStatusColor: Record<number, string> = { 1: 'success', 0: 'error' };
export const PEDIA_AUDIT_TYPE = { Pass: 1, Reject: 2 } as const;
export const PEDIA_SHOW_TYPE = { All: '', Show: 1, Hide: 0 } as const;
export const ENCYCLOPEDIA_VISIBLE = { Show: 1, Hide: 0, Open: 1, Close: 0 } as const;
export const PediaAuditConstants: Record<number, string> = { 1: '通过', 2: '拒绝' };
export const PediaAuditStatusColor: Record<number, string> = { 0: 'default', 1: 'success', 2: 'error' };
export const PediaTypeConstants: Record<string, string> = { common: '普通', game: '游戏' };
export const PediaTypeOptions = [{ label: '全部', value: '' }, { label: '普通', value: 'common' }, { label: '游戏', value: 'game' }];
export const PediaShowTypeConstants: Record<number, string> = { 1: '显示', 0: '隐藏' };
export const PediaShowTypeOptions = [{ label: '全部', value: '' }, { label: '显示', value: 1 }, { label: '隐藏', value: 0 }];
export const UPDATE_LOTTERY_TYPE_ENUM = { Update: 'update', Create: 'create' } as const;
export const LotteryStatusConstant: Record<number, string> = { 1: '进行中', 0: '已结束', 2: '未开始' };
export const LotteryStatusColor: Record<number, string> = { 1: 'processing', 0: 'default', 2: 'warning' };
export const RANGE_PICKER_LIST = ['今日', '近7天', '近30天'];
export const TopDateValueOptionsData = [{ label: '今日', value: 'today' }, { label: '近7天', value: 'last7' }];
export const PUSH_RANGE_ENUM = { All: 'all', PART: 'part', Custom: 'part' } as const;
export const PushRangeOptions = [
  { label: '全部用户', value: PUSH_RANGE_ENUM.All },
  { label: '指定用户', value: PUSH_RANGE_ENUM.PART },
];
export const PushStatusConstants: Record<number, string> = { 0: '草稿', 1: '已发送', 2: '待审核' };
export const PushStatusColor: Record<number, string> = { 0: 'default', 1: 'success', 2: 'warning' };
export const PASSPORT_FILTER = {
  All: '',
  ID: 'passportId',
  TITLE: 'passportName',
  NICKNAME: 'nickName',
  USERLABEL: 'userLabelIds',
} as const;
export const PASSPORT_FILTER_VALUE_CONSTANT: Record<string, string> = {
  [PASSPORT_FILTER.ID]: 'passportId',
  [PASSPORT_FILTER.TITLE]: 'passportName',
  [PASSPORT_FILTER.NICKNAME]: 'nickName',
  [PASSPORT_FILTER.USERLABEL]: 'userLabelIds',
};
export const POST_MARK = { None: 0, Boutique: 1 } as const;
export const PostMarkConstants: Record<number, string> = { 0: '普通', 1: '精品' };
export const PostMarkOptions = [{ label: '全部', value: '' }, { label: '精品', value: 1 }, { label: '普通', value: 0 }];
export const PostRatingConstants: Record<number, string> = { 1: '好评', 0: '差评' };
export const MomentTypeConstant: Record<string, string> = { post: '帖子', vote: '投票' };
export const SECTION_ENUM = { Recommend: 0, Default: 0, Custom: 1 } as const;
export const SECTION_MODE = { IsGame: 0, IsBC: 1, IsTourist: 2, Normal: 0, Special: 1 } as const;
export const SECTION_TYPE = { Basic: 'basic', Independent: 'independent', Post: 'post', Topic: 'topic' } as const;
export const SectionConstant: Record<string | number, string> = {
  0: '推荐',
  1: '自定义',
  2: '游客',
  basic: '通用资讯栏',
  independent: '多语言独立资讯栏',
  post: '帖子',
  topic: '话题',
};
export const SectionTypeOptions = [
  { label: '通用资讯栏', value: 'basic' },
  { label: '多语言独立资讯栏', value: 'independent' },
];
export const SectionModeOptions = [
  { label: '游戏内', value: SECTION_MODE.IsGame },
  { label: 'BC', value: SECTION_MODE.IsBC },
  { label: '游客', value: SECTION_MODE.IsTourist },
];
export const OPEN_MODE = {
  Default: 'default',
  Global: 'global',
  Adopt: 'adopt',
  NewTab: 'newTab',
  Current: 'current',
} as const;
export const OpenModeOptions = [
  { label: '全局开放', value: OPEN_MODE.Global },
  { label: '领养制', value: OPEN_MODE.Adopt },
];
export const CLUB_AI_CHAT_VERIFY_CATEGORY = { Chat: 'chat', Post: 'post' } as const;
export const CLUB_AI_CHAT_VERIFY_RESULT = { Pass: 1, Reject: 0 } as const;
export const CLUB_AI_DIAGNOSIS_RESULT = { Normal: 0, Abnormal: 1 } as const;
export const CLUB_AI_VERIFY_REASON = { Auto: 'auto', Manual: 'manual' } as const;
export const CLUB_AI_VERIFY_RESULT = { Pass: 1, Reject: 0 } as const;
export const ClubAiChatVerifyCategoryOptions = [{ label: '聊天', value: 'chat' }, { label: '帖子', value: 'post' }];
export const ClubAiChatVerifyCategoryLabelMap: Record<string, string> = { chat: '聊天', post: '帖子' };
export const ClubAiChatVerifyResultOptions = [{ label: '通过', value: 1 }, { label: '拒绝', value: 0 }];
export const ClubAiDiagnosisResultLabelMap: Record<number, string> = { 0: '正常', 1: '异常' };
export const ClubAiVerifyReasonOptions = [{ label: '自动', value: 'auto' }, { label: '人工', value: 'manual' }];
export const ClubAiVerifyResultOptions = [{ label: '通过', value: 1 }, { label: '拒绝', value: 0 }];
export const ClubAiVerifyResultLabelMap: Record<number, string> = { 1: '通过', 0: '拒绝' };
export const PUBLICITYVISIBILE = { Show: 1, Hide: 0, Open: 1, Close: 0 } as const;
export const MAX_PUBLICITYLABEL_LEN = 20;
export const TopHomeRecommend = { Yes: 1, No: 0 } as const;
export const FormOnlyVisiable = { Show: true, Hide: false } as const;
export const PROMPT_TYPE = { Post: 0, Game: 1, Content: 2, Dynamic: 3, System: 'system', User: 'user' } as const;
export type PROMPT_TYPE = typeof PROMPT_TYPE[keyof typeof PROMPT_TYPE];
export const PromptTypeConstant: Record<string | number, string> = {
  [PROMPT_TYPE.Post]: '发帖',
  [PROMPT_TYPE.Game]: '游戏',
  [PROMPT_TYPE.Content]: '内容',
  [PROMPT_TYPE.Dynamic]: '动态',
  system: '系统',
  user: '用户',
};
export const PromptTypeOptions = [
  { label: '发帖', value: PROMPT_TYPE.Post },
  { label: '游戏', value: PROMPT_TYPE.Game },
  { label: '内容', value: PROMPT_TYPE.Content },
  { label: '动态', value: PROMPT_TYPE.Dynamic },
];
export const PromptValues: Record<string | number, string> = {
  [PROMPT_TYPE.Post]: 'postPrompt',
  [PROMPT_TYPE.Game]: 'gamePrompt',
  [PROMPT_TYPE.Content]: 'contentPrompt',
  [PROMPT_TYPE.Dynamic]: 'dynamicPrompt',
};
export const VoiceRoleOptions = [{ label: '角色1', value: '1' }, { label: '角色2', value: '2' }];
export const ReplyTypeOptions = [{ label: '自动', value: 'auto' }, { label: '手动', value: 'manual' }];
export const USERLABEL_FILTER_AUDIT_OPTIONS = [
  { label: '通行证ID', value: PASSPORT_FILTER.ID },
  { label: '通行证名称', value: PASSPORT_FILTER.TITLE },
  { label: '昵称', value: PASSPORT_FILTER.NICKNAME },
];
export const USERLABEL_FILTER_RECORD_OPTIONS = [
  ...USERLABEL_FILTER_AUDIT_OPTIONS,
  { label: '用户标签', value: PASSPORT_FILTER.USERLABEL },
];
export const QUALITY_QUERY_TYPE = { Chat: 'chat', Post: 'post' } as const;
export const QUALITY_TYPE = { Chat: 'chat', Post: 'post' } as const;
export const QualityQueryTypeMap: Record<string, string> = { chat: '聊天', post: '帖子' };

export enum TABLE_TYPE { Record = 'Record', Audit = 'Audit' }
export const TableTypeValues = [TABLE_TYPE.Record, TABLE_TYPE.Audit] as const;
