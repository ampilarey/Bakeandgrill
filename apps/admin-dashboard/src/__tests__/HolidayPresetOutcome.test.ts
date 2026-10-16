import { describe, expect, it } from 'vitest';
import { presetOutcome } from '../pages/OnlineOrderingPage';

const ok: PromiseSettledResult<unknown> = { status: 'fulfilled', value: undefined };
const failed = (msg: string): PromiseSettledResult<unknown> => ({ status: 'rejected', reason: new Error(msg) });

// Audit, 2026-10-16: one tap saves business hours and the online schedule; a
// failure used to say only "Failed" while the other half may have saved.
describe('Ramadan / Eid preset says which half saved', () => {
  it('both saved', () => {
    expect(presetOutcome('Ramadan', ok, ok)).toEqual({
      ok: true, message: 'Ramadan hours saved to business hours and online ordering schedule.',
    });
  });

  it('business hours failed, schedule saved', () => {
    expect(presetOutcome('Ramadan', failed('Network error'), ok)).toEqual({
      ok: false,
      message: 'Ramadan hours saved to the online ordering schedule, but business hours did not save: Network error. Tap again to retry.',
    });
  });

  it('schedule failed, business hours saved', () => {
    expect(presetOutcome('Eid', ok, failed('Server busy'))).toEqual({
      ok: false,
      message: 'Eid hours saved to business hours, but the online ordering schedule did not save: Server busy. Tap again to retry.',
    });
  });

  it('both failed', () => {
    expect(presetOutcome('Eid', failed('Offline'), failed('Offline')).message)
      .toBe('Eid hours did not save: Offline. Nothing changed. Tap again to retry.');
  });
});
