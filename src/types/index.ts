export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: PaginatedMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

export interface DropDownOption {
  value: string;
  label: string;
}

export type SortDir = "asc" | "desc";