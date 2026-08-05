import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlatterGroup, PlatterSelection } from '@shared/types';
import { PlatterPicker } from './PlatterPicker';
import { isPlatterSelectionValid, platterPickHint } from '../utils/platterRules';

const groups: PlatterGroup[] = [
  {
    id: 10,
    name: 'Short eats',
    rule_type: 'exactly',
    min_count: 6,
    max_count: 6,
    size_counts: null,
    items: [
      {
        item_id: 1,
        surcharge: 0,
        item: { id: 1, name: 'Bajiya', is_available: true, available_now: true, allow_pre_order: true },
      },
      {
        item_id: 2,
        surcharge: 5,
        item: { id: 2, name: 'Gulha', is_available: true, available_now: true, allow_pre_order: true },
      },
      {
        item_id: 3,
        surcharge: 0,
        item: {
          id: 3,
          name: 'Sold out',
          is_available: false,
          available_now: false,
          allow_pre_order: true,
          tomorrow_remaining: 0,
        },
      },
    ],
  },
];

describe('PlatterPicker', () => {
  it('blocks incomplete picks and shows Pick N more until exactly 6', () => {
    let selections: PlatterSelection[] = [];
    const onChange = vi.fn((next: PlatterSelection[]) => {
      selections = next;
    });

    const { rerender } = render(
      <PlatterPicker groups={groups} selections={selections} onChange={onChange} />,
    );

    expect(isPlatterSelectionValid(groups, selections)).toBe(false);
    expect(platterPickHint(groups, selections)).toBe('Pick 6 more');

    // Add 4 Bajiya
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId('platter-inc-1'));
      rerender(<PlatterPicker groups={groups} selections={selections} onChange={onChange} />);
    }
    expect(platterPickHint(groups, selections)).toBe('Pick 2 more');
    expect(isPlatterSelectionValid(groups, selections)).toBe(false);

    fireEvent.click(screen.getByTestId('platter-inc-2'));
    rerender(<PlatterPicker groups={groups} selections={selections} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('platter-inc-2'));
    rerender(<PlatterPicker groups={groups} selections={selections} onChange={onChange} />);

    expect(platterPickHint(groups, selections)).toBeNull();
    expect(isPlatterSelectionValid(groups, selections)).toBe(true);
  });

  it('does not allow selecting unavailable children', () => {
    const onChange = vi.fn();
    render(<PlatterPicker groups={groups} selections={[]} onChange={onChange} orderDay="today" />);
    expect(screen.getByTestId('platter-inc-3')).toBeDisabled();
    fireEvent.click(screen.getByTestId('platter-inc-3'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tomorrow: sold-out-today OK, tomorrow_remaining 0 not selectable', () => {
    const tomorrowGroups: PlatterGroup[] = [
      {
        ...groups[0],
        items: [
          {
            item_id: 1,
            surcharge: 0,
            item: {
              id: 1,
              name: 'Bajiya',
              is_available: false,
              available_now: false,
              allow_pre_order: true,
              tomorrow_remaining: 3,
            },
          },
          {
            item_id: 3,
            surcharge: 0,
            item: {
              id: 3,
              name: 'Full',
              is_available: true,
              available_now: true,
              allow_pre_order: true,
              tomorrow_remaining: 0,
            },
          },
        ],
      },
    ];
    const onChange = vi.fn();
    render(
      <PlatterPicker groups={tomorrowGroups} selections={[]} onChange={onChange} orderDay="tomorrow" />,
    );
    expect(screen.getByTestId('platter-inc-1')).not.toBeDisabled();
    expect(screen.getByTestId('platter-inc-3')).toBeDisabled();
  });
});
