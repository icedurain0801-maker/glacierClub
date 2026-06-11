export interface Attachment {
  id?: string | number;
  name?: string;
  url?: string;
  size?: number;
  goodId?: string;
  num?: number;
  goodsType?: number;
}

export const maxEmailGoodsNum = 5;

export const GOODID_KEY_COMBINATION: Record<string, string[]> = {};
export const GOODID_KEY_DICT: Record<string, string> = {
  default: 'GoodsId',
};
export const GOODID_VALUE_SEPARATE = '||';

export const GOODNAME_KEY_DICT: Record<string, string> = {
  default: 'Name',
};

export const GOODS_KEY_MAX_DICT: Record<string, string> = {
  default: 'Max',
};

export const GOODS_MAX_DEFAULT = 999;

export type GoodIdKeyCombitDictType = keyof typeof GOODID_KEY_COMBINATION;
export type GoodIdKeyDictType = keyof typeof GOODID_KEY_DICT;
export type GoodNameKeyDictType = keyof typeof GOODNAME_KEY_DICT;
export type GoodsKeyMaxDictType = keyof typeof GOODS_KEY_MAX_DICT;
