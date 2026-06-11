export interface TagListItem { id: number; name: string; type: number; status: number; createdAt: string }
export interface TagSettingItem { id: number; tagId: number; tagName: string; rule: string; status: number }
export interface TagSettingListItem { id: number; name: string; range: string; chargeType: number; status: number; [k: string]: any }

export const TagChargeType = { Free: 0, Paid: 1 } as const;
export type TagChargeType = typeof TagChargeType[keyof typeof TagChargeType];

export const TagChargeTypeOptions = [
  { label: '免费', value: 0 },
  { label: '付费', value: 1 },
];

export function getRechargeTypeStr(type: number): string {
  return type === 1 ? '付费' : '免费';
}
