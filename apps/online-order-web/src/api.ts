// This file is intentionally a thin re-export shim.
// All API functions and types now live in src/api/ domain slices.
// Pages import from '../api' as before and get everything via this barrel.
export * from './api/index';
