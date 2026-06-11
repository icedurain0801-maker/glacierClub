export function tryToParseJson<T = any>(str: string, fallback?: T): T | undefined {
  try { return JSON.parse(str); } catch { return fallback; }
}

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface paginationType {
  page: number;
  pageSize: number;
  total?: number;
}
