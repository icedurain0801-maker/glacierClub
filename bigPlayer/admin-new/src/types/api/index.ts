export interface FeedbackResponseType2<T> {
  data: T;
  total?: number;
  code?: number;
  msg?: string;
  message?: string;
}

export interface BaseResponse {
  code: number;
  msg?: string;
  message?: string;
}

export const DOWNLOAD_PAGESIZE = 10000;
