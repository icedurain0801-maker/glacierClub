export interface NameMultiLangItem {
  name: string;
  sort: number;
}

export type NameMultiLangType = Record<string, NameMultiLangItem>;

export interface BadgeCategoryListItem {
  id: number;
  name: string;
  description?: string;
  badgeCount: number;
  sort: number;
  boardId: string;
  createdBy: string;
  createdAt: string;
  nameMultiLang?: NameMultiLangType;
  descriptionMultiLang?: NameMultiLangType;
}

export interface EditBadgeCategoryData extends Partial<BadgeCategoryListItem> {
  boardId: string;
  boardName?: string;
}

export interface MultiLang {
  language: string;
  name: string;
  description?: string;
}

export enum BadgeLevelEnum {
  Normal = 1,
  Rare = 2,
  Epic = 3,
  Legendary = 4,
}

export const BadgeLevelMap: Record<BadgeLevelEnum, string> = {
  [BadgeLevelEnum.Normal]: '普通',
  [BadgeLevelEnum.Rare]: '稀有',
  [BadgeLevelEnum.Epic]: '史诗',
  [BadgeLevelEnum.Legendary]: '传说',
};

export const BadgeLevelColorMap: Record<BadgeLevelEnum, string> = {
  [BadgeLevelEnum.Normal]: 'default',
  [BadgeLevelEnum.Rare]: 'blue',
  [BadgeLevelEnum.Epic]: 'purple',
  [BadgeLevelEnum.Legendary]: 'gold',
};

export enum BadgeConditionTypeEnum {
  PostCount = 1,
  CommentCount = 2,
  LikeCount = 3,
  LoginDays = 4,
}

export const BadgeConditionTypeMap: Record<BadgeConditionTypeEnum, string> = {
  [BadgeConditionTypeEnum.PostCount]: '发帖数',
  [BadgeConditionTypeEnum.CommentCount]: '评论数',
  [BadgeConditionTypeEnum.LikeCount]: '点赞数',
  [BadgeConditionTypeEnum.LoginDays]: '登录天数',
};

export const BadgeConditionTypeSuffixMap: Record<BadgeConditionTypeEnum, string> = {
  [BadgeConditionTypeEnum.PostCount]: '帖',
  [BadgeConditionTypeEnum.CommentCount]: '条',
  [BadgeConditionTypeEnum.LikeCount]: '个',
  [BadgeConditionTypeEnum.LoginDays]: '天',
};

export interface BadgeListItem {
  id: number;
  name: string;
  level: BadgeLevelEnum;
  iconUrl: string;
  description?: string;
  categoryId: number;
  conditionType: BadgeConditionTypeEnum;
  conditionValue: number;
  receiveCount?: number;
  status: number;
  auditBy?: string;
  auditAt?: string;
  auditRemark?: string;
  createdBy: string;
  createdAt: string;
  sort: number;
  boardId: string;
  nameMultiLang?: NameMultiLangType;
}

export interface EditBadgeData extends Partial<BadgeListItem> {
  boardId: string;
  boardName?: string;
}

export const BadgeLevelOptions = [
  { label: '普通', value: BadgeLevelEnum.Normal },
  { label: '稀有', value: BadgeLevelEnum.Rare },
  { label: '史诗', value: BadgeLevelEnum.Epic },
  { label: '传说', value: BadgeLevelEnum.Legendary },
];

export const BadgeConditionTypeOptions = [
  { label: '发帖数', value: BadgeConditionTypeEnum.PostCount },
  { label: '评论数', value: BadgeConditionTypeEnum.CommentCount },
  { label: '点赞数', value: BadgeConditionTypeEnum.LikeCount },
  { label: '登录天数', value: BadgeConditionTypeEnum.LoginDays },
];

export enum REWARD_ENUM {
  None = 0,
  Gold = 1,
  Goods = 2,
}

export interface BadgeRewardItem {
  type: REWARD_ENUM;
  amount?: number;
  goodsId?: string | number;
  name?: string;
}

export type BadgeRewardMultiLangType = Record<string, BadgeRewardItem[]>;
