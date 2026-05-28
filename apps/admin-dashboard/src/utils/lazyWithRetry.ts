import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed')
  );
}

/**
 * Wraps React.lazy with retries — recovers from stale chunk hashes after deploys.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (!isChunkLoadError(error) || attempt >= retries - 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
    throw lastError;
  });
}

export { isChunkLoadError };
