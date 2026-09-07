import { describe, it, expect, beforeEach, vi } from 'vitest';
import { settingsAPI } from './api';

/**
 * Regression guard against the stub these three functions used to be.
 *
 * `get()` returned a hardcoded object, `update()` was a no-op that reported
 * success, and `getMaintenanceMode()` always answered `false`. The admin
 * Settings page therefore appeared to save and never did, and the
 * maintenance-mode login block could never fire.
 *
 * These tests assert at the network boundary — that a real request is issued
 * — because that is precisely what the stub did not do. A component-level test
 * would have passed against the stub.
 */

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // apiRequest logs each request; keep the test output readable.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settingsAPI.get', () => {
  it('issues a real GET to /Settings instead of returning a fixed object', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        systemName: 'School Fleet',
        logo: '/logo.png',
        primaryColor: '#111111',
        secondaryColor: '#222222',
        maintenanceMode: true,
        maintenanceMessage: null,
        language: 'ar',
      }),
    );

    const result = await settingsAPI.get();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/Settings');
    // The stub always answered "El Renad"; persisted values must come through.
    expect(result?.systemName).toBe('School Fleet');
    expect(result?.maintenanceMode).toBe(true);
    expect(result?.language).toBe('ar');
  });

  it('resolves to null rather than throwing when the request fails', async () => {
    // Branding is read on every dashboard load; a settings outage must not
    // take the dashboard down with it.
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(settingsAPI.get()).resolves.toBeNull();
  });
});

describe('settingsAPI.update', () => {
  it('PUTs the payload to /Settings instead of silently succeeding', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, message: 'Settings saved.' }));

    const result = await settingsAPI.update({ systemName: 'School Fleet', maintenanceMode: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/Settings');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ systemName: 'School Fleet', maintenanceMode: true });
    expect(result.success).toBe(true);
  });

  it('propagates a failure rather than reporting success', async () => {
    // The stub returned { success: true } unconditionally, which is how the
    // page came to lie about saving.
    fetchMock.mockRejectedValue(new Error('server rejected'));
    await expect(settingsAPI.update({ systemName: 'x' })).rejects.toBeTruthy();
  });
});

describe('settingsAPI.getMaintenanceMode', () => {
  it('reads the real flag from the backend', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ maintenanceMode: true }));

    const result = await settingsAPI.getMaintenanceMode();

    expect(String(fetchMock.mock.calls[0][0])).toContain('/Settings/maintenance-mode');
    // The stub hardcoded false, which is why the login block never fired.
    expect(result.maintenanceMode).toBe(true);
  });

  it('fails open when the endpoint is unreachable', async () => {
    // Called from the login page BEFORE authenticating: a settings lookup
    // failing must not lock everyone out.
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(settingsAPI.getMaintenanceMode()).resolves.toEqual({ maintenanceMode: false });
  });
});
