import { describe, expect, it } from 'vitest';
import account from './AccountPage/AccountChromeBlocks.tsx?raw';
import checkout from './CheckoutPage.tsx?raw';

describe('44px tap targets', () => {
  it('keeps checkout remove and chat buttons at least 44px tall', () => {
    expect(checkout).toMatch(/removeBtn:\s*\{[\s\S]*?minHeight:\s*44/);
    expect(checkout).toMatch(/chatBtnWa:\s*\{[\s\S]*?minHeight:\s*44/);
    expect(checkout).toMatch(/chatBtnViber:\s*\{[\s\S]*?minHeight:\s*44/);
  });

  it('keeps the account language pill at least 44px tall', () => {
    expect(account).toMatch(/data-testid=\{`account-lang-\$\{option\}`\}[\s\S]*?minHeight:\s*44/);
  });
});
