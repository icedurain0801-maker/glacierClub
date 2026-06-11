export interface ExchangeItem {
  id: number; name: string; [k: string]: any;
}
export function initCouponItem() {
  return { id: 0, name: '', type: 0 };
}
