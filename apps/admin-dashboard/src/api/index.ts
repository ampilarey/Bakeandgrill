// Central barrel — import from '../api' as before; this re-exports every domain slice.
// To import from a specific slice directly, use e.g. '../api/finance'.

export * from './client';
export * from './auth';
export * from './orders';
export * from './menu';
export * from './finance';
export * from './staff';
export * from './customers';
export * from './marketing';
export * from './operations';
export * from './settings';
export * from './sms-module';
export * from './pos-admin';

// Re-export shared types that were previously re-exported from the monolithic api.ts
export type { StaffUser } from '@shared/types';
