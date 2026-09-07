import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastSpy = vi.fn();
const reviewSpy = vi.fn();
const eligibleBusesSpy = vi.fn();

vi.mock('@/contexts/LanguageContext', () => ({
  useI18n: () => ({ t: (_k: string, f?: string) => f ?? _k, lang: 'en', isRTL: false }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: toastSpy }) }));
vi.mock('@/lib/api', () => ({
  routeChangeRequestAPI: {
    getAll: vi.fn(async () => [
      {
        id: 100, childId: 11, childName: 'Sara', guardianId: 9, guardianName: 'Hala',
        guardianPhone: '0100', currentRouteId: 5, currentRouteName: 'South', currentBusId: null,
        currentBusNumber: null, requestedRouteId: 10, requestedRouteName: 'North',
        preferredBusId: null, preferredBusNumber: null, reason: 'Moved house',
        status: 'Pending', adminNotes: null, reviewedById: null, reviewedAt: null,
        appliedRouteId: null, appliedRouteName: null, appliedBusId: null,
        appliedBusNumber: null, createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]),
    getEligibleBuses: (...a: unknown[]) => eligibleBusesSpy(...a),
    review: (...a: unknown[]) => reviewSpy(...a),
  },
}));

import RouteChangeRequestsPanel from './RouteChangeRequestsPanel';
import { ApiError } from '@/lib/apiError';

const buses = [
  { id: 30, busNumber: 'B-1', capacity: 30, status: 'Active', assignedStudents: 10, availableSeats: 20, isEligible: true, ineligibleReason: null },
  { id: 31, busNumber: 'B-2', capacity: 30, status: 'Active', assignedStudents: 30, availableSeats: 0, isEligible: false, ineligibleReason: 'Bus is full' },
];

describe('RouteChangeRequestsPanel — review', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    reviewSpy.mockReset().mockResolvedValue({ success: true, message: 'done' });
    eligibleBusesSpy.mockReset().mockResolvedValue(buses);
  });

  /**
   * Exact names, not regexes: the status filter row renders buttons labelled
   * "Approved" and "Rejected", which a loose /approve/i also matches. Modal
   * queries are scoped with `within(dialog)` because the row action and the
   * modal submit share a name.
   */
  const openApprove = async () => {
    const user = userEvent.setup();
    render(<RouteChangeRequestsPanel />);
    await screen.findByText('Sara');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    return { user, dialog: await screen.findByRole('dialog') };
  };

  it('lists full buses too, labelled with why they cannot take the child', async () => {
    // Hiding them would leave an admin using the override unable to find the
    // bus they mean to override onto.
    await openApprove();
    await waitFor(() => expect(eligibleBusesSpy).toHaveBeenCalledWith(100));
    expect(await within(await screen.findByRole('dialog')).findByRole('option', { name: /B-2.*Bus is full/ })).toBeInTheDocument();
  });

  it('refuses to approve without a bus, since the guardian named none', async () => {
    const { user, dialog } = await openApprove();
    await within(dialog).findByRole('combobox');

    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: expect.stringContaining('Choose a bus') }),
      ),
    );
    expect(reviewSpy).not.toHaveBeenCalled();
  });

  it('sends the chosen bus on approval', async () => {
    const { user, dialog } = await openApprove();
    const select = await within(dialog).findByRole('combobox');
    await user.selectOptions(select, '30');

    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(reviewSpy).toHaveBeenCalledWith(100, expect.objectContaining({ status: 'Approved', assignedBusId: 30 })),
    );
  });

  it('requires an over-capacity confirmation when the chosen bus is full', async () => {
    const { user, dialog } = await openApprove();
    const select = await within(dialog).findByRole('combobox');
    await user.selectOptions(select, '31');

    // The confirmation appears only for an ineligible bus.
    const confirm = await within(dialog).findByRole('checkbox');
    await user.click(confirm);
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(reviewSpy).toHaveBeenCalledWith(100, expect.objectContaining({ allowOverCapacity: true })),
    );
  });

  it('requires a reason when rejecting', async () => {
    const user = userEvent.setup();
    render(<RouteChangeRequestsPanel />);
    await screen.findByText('Sara');
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: expect.stringContaining('reason') }),
      ),
    );
    expect(reviewSpy).not.toHaveBeenCalled();
  });

  it('surfaces a server rejection verbatim instead of a generic failure', async () => {
    // The backend 409s with which rule failed — a route disabled since the
    // request was raised, or a bus that filled up.
    // An ApiError, which is what apiRequest actually throws — a plain Error
    // is normalised to a generic message, so this would not prove anything.
    reviewSpy.mockRejectedValue(
      new ApiError({ message: 'That route is disabled and cannot take new students.', status: 409 }),
    );
    const { user, dialog } = await openApprove();
    const select = await within(dialog).findByRole('combobox');
    await user.selectOptions(select, '30');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: expect.stringContaining('disabled') }),
      ),
    );
  });
});
