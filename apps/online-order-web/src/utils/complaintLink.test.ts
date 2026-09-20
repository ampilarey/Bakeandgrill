import { describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({ API_ORIGIN: '' }));

import { complaintUrl } from './complaintLink';

describe('complaintUrl', () => {
  it('points at the site, one origin up from the app, and tags the source', () => {
    expect(complaintUrl('app')).toBe(`${window.location.origin}/complain?from=app`);
  });

  it('carries the order number so a complaint lands against the order', () => {
    expect(complaintUrl('order', ' BG-10042 ')).toBe(`${window.location.origin}/complain?from=order&order=BG-10042`);
    expect(complaintUrl('order', null)).toBe(`${window.location.origin}/complain?from=order`);
  });
});
