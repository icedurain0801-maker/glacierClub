export enum AuditStatus {
  PendingReview = 0,
  Pass = 1,
  Rejected = 2,
}

export const AuditStatusConstants: Record<number, string> = {
  [AuditStatus.PendingReview]: '待审核',
  [AuditStatus.Pass]: '通过',
  [AuditStatus.Rejected]: '已拒绝',
};

export const AuditStatusClassNameConstants: Record<number, string> = {
  [AuditStatus.PendingReview]: 'audit-status-pending',
  [AuditStatus.Pass]: 'audit-status-pass',
  [AuditStatus.Rejected]: 'audit-status-rejected',
};

export const PassAndRejectedOptions = [
  { label: '通过', value: AuditStatus.Pass },
  { label: '已拒绝', value: AuditStatus.Rejected },
];

export enum BatchAuditStatus {
  Pass = 1,
  Rejected = 2,
}

export const BatchAuditOptions = [
  { label: '通过', value: BatchAuditStatus.Pass },
  { label: '拒绝', value: BatchAuditStatus.Rejected },
];

export interface OptionType {
  label: string;
  value: string | number;
}

export const IS_ENABLE = { Enable: 1, Disable: 0, Open: 1, Close: 0, Unable: 0 } as const;
export const EnabledOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];
