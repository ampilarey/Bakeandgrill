import { createTokenStore } from '@shared/auth';

/**
 * The cashier's bearer token.
 *
 * Its own module rather than living in api/client.ts, because the offline
 * layer reads it too and must not have to import the network client to do so.
 *
 * The key is unchanged from when this was inline localStorage — renaming it
 * would sign every till out on the next deploy, mid-service.
 */
export const posToken = createTokenStore('pos_token');
