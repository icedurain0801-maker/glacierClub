export interface ClubTopicItem {
  id: number; title: string; cover?: string; type: number;
  status: number; createdAt: string; [k: string]: any;
}
export interface EditClubTopicDataType {
  id?: number; title?: string; cover?: string; type?: number; [k: string]: any;
}

export const RULE_TYPE = { Normal: 0, Custom: 1 } as const;
export const RuleTypeOptions = [
  { label: '默认规则', value: 0 },
  { label: '自定义规则', value: 1 },
];

export const TOPIC_IMPORT_TYPE = { Single: 0, Batch: 1 } as const;
export const TopicImportTypeOptions = [
  { label: '单个导入', value: 0 },
  { label: '批量导入', value: 1 },
];

export const TOPIC_TYPE = { Normal: 0, Game: 1 } as const;
export const TopicTypeConstants: Record<number, string> = { 0: '普通', 1: '游戏' };
export const TopicTypeOptions = [
  { label: '全部', value: '' },
  { label: '普通', value: 0 },
  { label: '游戏', value: 1 },
];

export const TOPIC_STATUS = { Enable: 1, Disable: 0 } as const;
export type TOPIC_STATUS = typeof TOPIC_STATUS[keyof typeof TOPIC_STATUS];

export enum TABLE_TYPE {
  Record = 'Record',
  Audit = 'Audit',
}
export const TableTypeValues = [TABLE_TYPE.Record, TABLE_TYPE.Audit] as const;
export const IS_TOP = { Yes: 1, No: 0 } as const;
export const IsTopOptions = [{ label: '置顶', value: 1 }, { label: '不置顶', value: 0 }];
export const ClubTopicFilterTypeOptions = [{ label: '全部', value: '' }, ...TopicTypeOptions];
export const TOPIC_TOP_TYPE = { None: 0, Top: 1 } as const;

