import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const loginSpy = vi.fn();
const maintenanceSpy = vi.fn();

vi.mock('@/lib/api', () => ({
  authAPI: { login: (...a: unknown[]) => loginSpy(...a) },
  settingsAPI: { getMaintenanceMode: (...a: unknown[]) => maintenanceSpy(...a) },
}));

import { AuthProvider, useAuth } from './useAuth';

/**
 * The maintenance-mode login gate.
 *
 * This gate could never fire before this release: the client it depends on
 * returned a hardcoded `false`. The behaviour it now has is worth pinning
 * down precisely, because the failure mode is a lockout.
 *
 * The subtle part is the role comparison. The backend returns `role: 'Admin'`
 * and the gate tests `role !== 'admin'` — lowercase. It works only because
 * the response is normalised through a role map first. If that map were
 * dropped, enabling maintenance mode would lock the admin out of the very
 * screen that turns it off.
 */
function LoginHarness({ onError }: { onError: (msg: string) => void }) {
  const { login, user } = useAuth();
  return (
    <div>
      <button
        onClick={async () => {
          try {
            await login('0100', 'pw');
          } catch (e: unknown) {
            onError((e as Error).message);
          }
        }}
      >
        sign in
      </button>
      <span data-testid="role">{user?.role ?? 'none'}</span>
    </div>
  );
}

const loginResponse = (role: string) => ({
  success: true,
  data: {
    id: 'abc', profileId: 1, fullName: 'Test User', role,
    token: 't', expiration: '', phoneNumber: '0100',
  },
});

async function attemptLogin(role: string, maintenanceMode: boolean) {
  loginSpy.mockResolvedValue(loginResponse(role));
  maintenanceSpy.mockResolvedValue({ maintenanceMode });

  const errors: string[] = [];
  render(
    <AuthProvider>
      <LoginHarness onError={(m) => errors.push(m)} />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('sign in')).toBeInTheDocument());
  screen.getByText('sign in').click();
  await waitFor(() => expect(loginSpy).toHaveBeenCalled());
  return errors;
}

describe('Maintenance mode — login gate', () => {
  beforeEach(() => {
    loginSpy.mockReset();
    maintenanceSpy.mockReset();
    localStorage.clear();
  });

  it('blocks a Guardian while maintenance mode is on', async () => {
    const errors = await attemptLogin('Guardian', true);
    await waitFor(() => expect(errors.join(' ')).toMatch(/under maintenance/i));
  });

  it('lets an Admin sign in while maintenance mode is on', async () => {
    // The lockout guard: the backend sends 'Admin', the gate compares against
    // 'admin', and only the role map makes those agree.
    const errors = await attemptLogin('Admin', true);
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
    expect(errors).toHaveLength(0);
  });

  it('lets a Guardian sign in once maintenance mode is off', async () => {
    const errors = await attemptLogin('Guardian', false);
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('guardian'));
    expect(errors).toHaveLength(0);
  });

  it('does not block anyone when the maintenance check itself fails', async () => {
    // Fail open. A settings outage must not become an outage for everyone.
    loginSpy.mockResolvedValue(loginResponse('Guardian'));
    maintenanceSpy.mockRejectedValue(new Error('network down'));

    const errors: string[] = [];
    render(
      <AuthProvider>
        <LoginHarness onError={(m) => errors.push(m)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('sign in')).toBeInTheDocument());
    screen.getByText('sign in').click();

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('guardian'));
    expect(errors).toHaveLength(0);
  });
});
