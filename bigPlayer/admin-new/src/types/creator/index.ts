export interface CreatorListItem {
  id: number; userId: number; userName: string; avatar?: string;
  status: number; createdAt: string; [k: string]: any;
}
export interface GetCreatorDataResponse {
  id: number; userId: number; [k: string]: any;
}
export interface CreateEditDataType {
  id?: number; userId?: number; [k: string]: any;
}

export const CREATOR_STATUS_ENUM = { Enable: 1, Disable: 0 } as const;
export const CreatorStatusConstant: Record<number, string> = { 1: '正常', 0: '禁用' };
export const CreatorStatusColorConstant: Record<number, string> = { 1: 'success', 0: 'error' };
export const CreatorStatusSelections = [
  { label: '全部', value: '' },
  { label: '正常', value: 1 },
  { label: '禁用', value: 0 },
];

export const CREATOR_AUDIT_TYPE = { Pass: 1, Reject: 2 } as const;
export const CreatorAuditOptions = [
  { label: '通过', value: 1 },
  { label: '拒绝', value: 2 },
];
export const CreatorFilterTypeOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 1 },
  { label: '禁用', value: 0 },
];

export const CREATOR_TASK_ENUM = { Enable: 1, Disable: 0 } as const;
export const TASK_STATUS_ENUM = { Pending: 0, Done: 1, Rejected: 2 } as const;
export const TaskSelection = [
  { label: '全部', value: '' },
  { label: '进行中', value: 0 },
  { label: '已完成', value: 1 },
];
export const TaskStatusConstant: Record<number, string> = { 0: '进行中', 1: '已完成', 2: '已拒绝' };
export const TaskStatusColorConstant: Record<number, string> = { 0: 'processing', 1: 'success', 2: 'error' };
export const CreatorTaskFilterTypeOptions = [
  { label: '全部', value: '' },
  { label: '进行中', value: 0 },
  { label: '已完成', value: 1 },
];
export const CreatorTaskStatusFilterTypeOptions = CreatorTaskFilterTypeOptions;
