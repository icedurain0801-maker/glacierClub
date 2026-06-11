import type { BadgeCategoryListItem, BadgeListItem } from '@ts/clubBadge';
import { BadgeLevelEnum, BadgeConditionTypeEnum } from '@ts/clubBadge';
import { AuditStatus } from '@ts/enum/enum';

const badgeIcon =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%2212%22 fill=%22%23f6ffed%22/%3E%3Ctext x=%2224%22 y=%2229%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%233895e3%22%3EBadge%3C/text%3E%3C/svg%3E';

const mockCategories: BadgeCategoryListItem[] = [
  {
    id: 1,
    name: '活跃徽章',
    description: '活跃度相关徽章',
    badgeCount: 3,
    sort: 1,
    boardId: '1',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    nameMultiLang: {
      'zh-CN': { name: '活跃徽章', sort: 0 },
      'en-US': { name: 'Active Badge', sort: 1 },
    },
  },
  {
    id: 2,
    name: '贡献徽章',
    description: '贡献度相关',
    badgeCount: 0,
    sort: 2,
    boardId: '1',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    nameMultiLang: {
      'zh-CN': { name: '贡献徽章', sort: 0 },
    },
  },
];

const mockBadges: BadgeListItem[] = [
  {
    id: 1,
    name: '发帖达人',
    level: BadgeLevelEnum.Rare,
    iconUrl: badgeIcon,
    description: '累计发帖 100 篇',
    categoryId: 1,
    conditionType: BadgeConditionTypeEnum.PostCount,
    conditionValue: 100,
    receiveCount: 256,
    status: AuditStatus.Pass,
    auditBy: 'admin',
    auditAt: new Date().toISOString(),
    auditRemark: 'Approved for preview',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    sort: 1,
    boardId: '1',
  },
  {
    id: 2,
    name: '评论新星',
    level: BadgeLevelEnum.Normal,
    iconUrl: badgeIcon,
    description: '累计评论 50 条',
    categoryId: 1,
    conditionType: BadgeConditionTypeEnum.CommentCount,
    conditionValue: 50,
    receiveCount: 0,
    status: AuditStatus.PendingReview,
    auditBy: 'reviewer',
    auditAt: new Date().toISOString(),
    auditRemark: 'Waiting for final review',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    sort: 2,
    boardId: '1',
  },
];

export const getBadgeList = (_query: any, _ver?: string) =>
  Promise.resolve({ data: mockBadges, total: mockBadges.length, code: 0 });

export const getBadgeCategoryList = (_query: any, _ver?: string) =>
  Promise.resolve({ data: mockCategories, total: mockCategories.length, code: 0 });

export const getBadgeCategoryAllList = (_query: any, _ver?: string) =>
  Promise.resolve({ data: mockCategories, total: mockCategories.length, code: 0 });

export const removeBadge = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '删除成功' });

export const removeBadgeCategory = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '删除成功' });

export const createBadgeCategory = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '创建成功' });

export const updateBadgeCategory = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '更新成功' });

export const batchAuditBadge = (_query: any, _payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, message: '审核成功' });

export const createBadge = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '创建成功' });

export const updateBadge = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '更新成功' });

export const verifyBadge = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '校验通过' });

export const createBadgeName = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, data: { id: 999 } });

export const getBadgeNamesList = (_query: any, _ver?: string) =>
  Promise.resolve({ data: [] as Array<{ id: number; name: string }>, code: 0 });

export const removeBadgeName = (_payload: any, _ver?: string) =>
  Promise.resolve({ code: 0, msg: '删除成功' });
