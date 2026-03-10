// ── Shared types — single source of truth for all apps ───────────────────────

export * from './product';
export * from './order';
export * from './customer';
export * from './payment';
export * from './reservation';
export * from './review';

// ── Generic API response wrappers ─────────────────────────────────────────────

export type ApiResponse<T> = {
  data: T;
  message?: string;
  errors?: string[];
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};
