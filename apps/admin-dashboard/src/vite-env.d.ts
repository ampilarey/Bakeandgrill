/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Minimal Node builtins for vitest source-file assertions (no @types/node). */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}
declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
