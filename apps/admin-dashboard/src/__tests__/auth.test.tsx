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

    it('renders mobile/email + password fields and Sign In button', () => {
        render(
            <MemoryRouter>
                <LoginPage onLogin={vi.fn()} />
            </MemoryRouter>,
        );
        expect(screen.getByPlaceholderText(/7820288 or you@example.com/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/your admin password/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    });

    it('disables Sign In until both fields are filled', () => {
        render(
            <MemoryRouter>
                <LoginPage onLogin={vi.fn()} />
            </MemoryRouter>,
        );
        const btn = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);

        fireEvent.change(screen.getByPlaceholderText(/7820288 or you@example.com/i), { target: { value: '9609123456' } });
        expect(btn.disabled).toBe(true);

        fireEvent.change(screen.getByPlaceholderText(/your admin password/i), { target: { value: 'hunter2' } });
        expect(btn.disabled).toBe(false);
    });

    it('calls phoneLogin and invokes onLogin on success', async () => {
        const mockUser = { id: 1, name: 'Owner', email: 'o@t.com', role: { id: 1, name: 'Owner', slug: 'owner' } } as never;
        const phoneLoginSpy = vi.spyOn(api, 'phoneLogin').mockResolvedValue({ user: mockUser });
        const onLogin = vi.fn();

        render(
            <MemoryRouter>
                <LoginPage onLogin={onLogin} />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByPlaceholderText(/7820288 or you@example.com/i), { target: { value: '9609123456' } });
        fireEvent.change(screen.getByPlaceholderText(/your admin password/i), { target: { value: 'hunter2' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => expect(phoneLoginSpy).toHaveBeenCalledWith('9609123456', 'hunter2'));
        expect(onLogin).toHaveBeenCalledWith(mockUser, undefined);
    });

    it('surfaces the server error message on failed login', async () => {
        vi.spyOn(api, 'phoneLogin').mockRejectedValue(new Error('Invalid credentials.'));

        render(
            <MemoryRouter>
                <LoginPage onLogin={vi.fn()} />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByPlaceholderText(/7820288 or you@example.com/i), { target: { value: '9609123456' } });
        fireEvent.change(screen.getByPlaceholderText(/your admin password/i), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeTruthy());
    });
});

describe('localStorage polyfill', () => {
    it('round-trips values cleanly', () => {
        localStorage.setItem('probe', 'abc123');
        expect(localStorage.getItem('probe')).toBe('abc123');
        localStorage.removeItem('probe');
        expect(localStorage.getItem('probe')).toBeNull();
    });
});
