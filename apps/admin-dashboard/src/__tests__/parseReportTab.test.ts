import { describe, expect, it } from 'vitest';
import { parseReportTab } from '../pages/ReportsPage/reportsShared';

describe('parseReportTab', () => {
  it('resolves exact tab labels', () => {
    expect(parseReportTab('Spend Hub')).toBe('Spend Hub');
    expect(parseReportTab('Summary')).toBe('Summary');
  });

  it('resolves case-insensitive and slug forms', () => {
    expect(parseReportTab('spend hub')).toBe('Spend Hub');
    expect(parseReportTab('spend-hub')).toBe('Spend Hub');
    expect(parseReportTab('Spend_by_Item')).toBe('Spend by Item');
  });

  it('returns null for unknown tabs', () => {
    expect(parseReportTab(null)).toBeNull();
    expect(parseReportTab('')).toBeNull();
    expect(parseReportTab('not-a-tab')).toBeNull();
  });
});
