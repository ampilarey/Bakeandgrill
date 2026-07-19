// Central barrel — import from '../api' as before; this re-exports every domain slice.
// To import from a specific slice directly, use e.g. '../api/finance'.

export * from './client';
export * from './auth';
export * from './orders';
export * from './menu';
export * from './finance';
export * from './gst';
export * from './staff';
export * from './customers';
export * from './customer-growth';
export * from './catering';
export * from './marketing';
export * from './discount-cards';
export * from './operations';
export * from './settings';
export * from './sms-module';
export * from './pos-admin';
export * from './system';
export * from './procurement';
export * from './kitchen-production';

// Re-export shared types that were previously re-exported from the monolithic api.ts
export type { StaffUser } from '@shared/types';
