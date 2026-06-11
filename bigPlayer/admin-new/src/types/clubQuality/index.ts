export const QUALITY_STATUS = { Pending: 0, Pass: 1, Reject: 2 } as const;

export const QualityTypeValues = [
  { label: '全部', value: '' },
  { label: '聊天', value: 1 },
  { label: '帖子', value: 2 },
];

export const VerifyLevelOptions = [
  { label: '全部', value: '' },
  { label: 'L1', value: 1 },
  { label: 'L2', value: 2 },
  { label: 'L3', value: 3 },
];

export const QUALITY_TYPE = { Chat: 'chat', Post: 'post' } as const;
export const QUALITY_QUERY_TYPE = { Chat: 'chat', Post: 'post' } as const;
export const QualityQueryTypeMap: Record<string, string> = { chat: '聊天', post: '帖子' };

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

export interface QualityListItem {
  id: number; content: string; userId: number; userName: string;
  status: number; auditResult?: string; createdAt: string; qualityType?: number;
}

