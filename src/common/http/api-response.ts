export interface ApiResponse<T> {
  data: T;
  meta?: { stub: boolean };
}

export function stubResponse<T>(data: T): ApiResponse<T> {
  return { data, meta: { stub: true } };
}

