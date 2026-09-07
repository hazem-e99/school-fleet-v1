import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastSpy = vi.fn();
const getSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en', isRTL: false, setLanguage: vi.fn() }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: toastSpy }) }));
// The admin reference-data panels each fetch their own lists; they are not
// what these tests are about.
vi.mock('@/components/admin/SchoolsPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/admin/PreferredAreasPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/admin/GradeLevelsPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/admin/GradeGroupsPanel', () => ({ default: () => <div /> }));
vi.mock('@/components/admin/AcademicTermsPanel', () => ({ default: () => <div /> }));
vi.mock('@/lib/api', () => ({
  settingsAPI: {
    get: (...a: unknown[]) => getSpy(...a),
    update: (...a: unknown[]) => updateSpy(...a),
    getMaintenanceMode: vi.fn(async () => ({ maintenanceMode: false })),
  },
  adminSystemAPI: { purgeDatabase: vi.fn() },
}));

import SettingsPage from './page';

const persisted = {
  systemName: 'School Fleet',
  logo: '/logo.png',
  primaryColor: '#111111',
  secondaryColor: '#222222',
  maintenanceMode: true,
  maintenanceMessage: null,
  language: 'en' as const,
};

/**
 * The page used to lie about saving: settingsAPI was a stub whose update() was
 * a no-op returning success. These tests pin the two halves of the fix — that
 * persisted values are read back, and that saving reaches the client.
 */
describe('Admin Settings page', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    getSpy.mockReset().mockResolvedValue(persisted);
    updateSpy.mockReset().mockResolvedValue({ success: true, message: 'Settings saved.' });
  });

  it('loads persisted values from the backend rather than showing defaults', async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    // The old stub always answered with its own hardcoded object.
    expect(await screen.findByDisplayValue('School Fleet')).toBeInTheDocument();
  });

  it('reflects the persisted maintenance flag in the toggle', async () => {
    render(<SettingsPage />);
    // maintenanceMode was missing from the backend response entirely, so this
    // used to read back as false after every save.
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /maintenance/i }));
    // Switch renders a visually-hidden <input type="checkbox">, so its role is
    // checkbox rather than switch.
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  });

  it('saves through the API client with only server-stored fields', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue('School Fleet');

    await user.click(screen.getByRole('button', { name: /^Save Changes$/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const payload = updateSpy.mock.calls[0][0];
    expect(payload).toMatchObject({ systemName: 'School Fleet', maintenanceMode: true, language: 'en' });
    // `id` and `updatedAt` are local bookkeeping; the endpoint validates its
    // body now and would reject them.
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('updatedAt');
  });

  it('reports a save failure instead of claiming success', async () => {
    updateSpy.mockRejectedValue(new Error('server rejected'));
    const user = userEvent.setup();
    render(<SettingsPage />);
    await screen.findByDisplayValue('School Fleet');

    await user.click(screen.getByRole('button', { name: /^Save Changes$/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })),
    );
  });
});
