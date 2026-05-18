import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import * as api from '../api';

describe('LoginPage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('renders Mobile Number + Password fields and Sign In button', () => {
        render(
            <MemoryRouter>
                <LoginPage onLogin={vi.fn()} />
            </MemoryRouter>,
        );
        expect(screen.getByPlaceholderText(/\+960/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/your password/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    });

    it('disables Sign In until both fields are filled', () => {
        render(
            <MemoryRouter>
                <LoginPage onLogin={vi.fn()} />
            </MemoryRouter>,
        );
        const btn = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
        // Submit is the only `disabled`-capable button in the form
        expect(btn.disabled).toBe(true);

        fireEvent.change(screen.getByPlaceholderText(/\+960/i), { target: { value: '9609123456' } });
        expect(btn.disabled).toBe(true);

        fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: 'hunter2' } });
        expect(btn.disabled).toBe(false);
    });

    it('calls phoneLogin and invokes onLogin on success', async () => {
        const mockUser = { id: 1, name: 'Owner', email: 'o@t.com', role: { id: 1, name: 'Owner', slug: 'owner' } } as never;
        const phoneLoginSpy = vi.spyOn(api, 'phoneLogin').mockResolvedValue({ token: 'test-token', user: mockUser });
        const onLogin = vi.fn();

        render(
            <MemoryRouter>
                <LoginPage onLogin={onLogin} />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByPlaceholderText(/\+960/i), { target: { value: '9609123456' } });
        fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: 'hunter2' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => expect(phoneLoginSpy).toHaveBeenCalledWith('9609123456', 'hunter2'));
        expect(onLogin).toHaveBeenCalledWith('test-token', mockUser, undefined);
    });

    it('surfaces the server error message on failed login', async () => {
        vi.spyOn(api, 'phoneLogin').mockRejectedValue(new Error('Invalid credentials.'));

        render(
            <MemoryRouter>
                <LoginPage onLogin={vi.fn()} />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByPlaceholderText(/\+960/i), { target: { value: '9609123456' } });
        fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeTruthy());
    });
});

describe('admin_token lifecycle', () => {
    it('localStorage round-trips the token cleanly', () => {
        // Smoke test for the polyfill in setup.ts — vitest 4 + jsdom 28
        // dropped a working Storage global, which broke any test that
        // simply called localStorage.setItem. The setup file installs
        // a Map-backed polyfill; this test guards that contract.
        localStorage.setItem('admin_token', 'abc123');
        expect(localStorage.getItem('admin_token')).toBe('abc123');
        localStorage.removeItem('admin_token');
        expect(localStorage.getItem('admin_token')).toBeNull();
    });
});
