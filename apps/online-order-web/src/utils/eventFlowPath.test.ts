import { describe, expect, it } from 'vitest';
import { isEventFlowPath } from './eventFlowPath';

describe('isEventFlowPath', () => {
  it('matches event wizard and quote routes', () => {
    expect(isEventFlowPath('/events')).toBe(true);
    expect(isEventFlowPath('/events/')).toBe(true);
    expect(isEventFlowPath('/events/mine')).toBe(true);
    expect(isEventFlowPath('/pre-order')).toBe(true);
    expect(isEventFlowPath('/quote/abc123')).toBe(true);
  });

  it('does not match immediate-order routes', () => {
    expect(isEventFlowPath('/')).toBe(false);
    expect(isEventFlowPath('/menu')).toBe(false);
    expect(isEventFlowPath('/checkout')).toBe(false);
    expect(isEventFlowPath('/account')).toBe(false);
    expect(isEventFlowPath('/catering')).toBe(false);
  });
});
