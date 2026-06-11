export interface Appearance {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  status: 'active' | 'inactive';
  i18n?: Record<string, any>;
}

export enum DRESS_ENUM {
  Frame = 1,
  Avatar = 2,
  Background = 3,
}

export enum APPROVAL_STATUS {
  Pending = 0,
  Approved = 1,
  Rejected = 2,
}

export interface DressUpListItem {
  id: number;
  name: string;
  type: DRESS_ENUM;
  iconUrl?: string;
  status: APPROVAL_STATUS;
  [k: string]: any;
}

export const DressUpTypeOptions = [
  { label: '头像框', value: DRESS_ENUM.Frame },
  { label: '头像', value: DRESS_ENUM.Avatar },
  { label: '背景', value: DRESS_ENUM.Background },
];

export const DressTypeText: Record<number, string> = {
  [DRESS_ENUM.Frame]: '头像框',
  [DRESS_ENUM.Avatar]: '头像',
  [DRESS_ENUM.Background]: '背景',
};

export const ApprovalStatusColor: Record<number, string> = {
  [APPROVAL_STATUS.Pending]: 'default',
  [APPROVAL_STATUS.Approved]: 'success',
  [APPROVAL_STATUS.Rejected]: 'error',
};
export const ApprovalStatusText: Record<number, string> = {
  [APPROVAL_STATUS.Pending]: '待审核',
  [APPROVAL_STATUS.Approved]: '已通过',
  [APPROVAL_STATUS.Rejected]: '已拒绝',
};
export const ApprovalStatusSelections = [
  { label: '全部', value: '' },
  { label: '待审核', value: APPROVAL_STATUS.Pending },
  { label: '已通过', value: APPROVAL_STATUS.Approved },
  { label: '已拒绝', value: APPROVAL_STATUS.Rejected },
];

export const LISTING_STATUS = { Online: 1, Offline: 0 } as const;
export type LISTING_STATUS = typeof LISTING_STATUS[keyof typeof LISTING_STATUS];
export const ListingStateOptions = [
  { label: '全部', value: '' },
  { label: '上架', value: 1 },
  { label: '下架', value: 0 },
];
export const ListingStatusText: Record<number, string> = { 1: '上架', 0: '下架' };

export const EXPIRED_DAY = { Forever: -1, SevenDay: 7, ThirtyDay: 30, NinetyDay: 90 } as const;
export const ExpiredDatOptionsData = [
  { label: '永久', value: -1 },
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
];
export const ExpiredDatConstant: Record<number, string> = { [-1]: '永久', 7: '7天', 30: '30天', 90: '90天' };

export interface EditDressUpData {
  id?: number; name?: string; type?: number; iconUrl?: string; status?: number; [k: string]: any;
}
export interface DressUpInfos { [k: string]: any }
export const DressUpTypeOptions2 = DressUpTypeOptions;
export const ExpiredDayOptions = ExpiredDatOptionsData;
