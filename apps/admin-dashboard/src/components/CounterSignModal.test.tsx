import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CounterSignModal, counterSignUrl } from './CounterSignModal';

describe('CounterSignModal', () => {
  it('links the sign to the order app account page on this site', () => {
    expect(counterSignUrl('https://bakeandgrill.mv')).toBe('https://bakeandgrill.mv/order/account');
    expect(counterSignUrl('https://test.bakeandgrill.mv/')).toBe('https://test.bakeandgrill.mv/order/account');
  });

  it('renders a printable sign with a QR and the plain link', () => {
    render(<CounterSignModal onClose={() => {}} />);
    const sign = screen.getByTestId('counter-sign');
    expect(sign).toHaveTextContent('Earn points on every order');
    expect(sign).toHaveTextContent('/order/account');
    expect(sign.querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('counter-sign-print')).toBeInTheDocument();
  });
});
