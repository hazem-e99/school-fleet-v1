import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastSpy = vi.fn();
const createSpy = vi.fn();

vi.mock('@/contexts/LanguageContext', () => ({
  useI18n: () => ({ t: (_k: string, f?: string) => f ?? _k, lang: 'en', isRTL: false }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: toastSpy }) }));
vi.mock('@/lib/api', () => ({
  installmentPlansAPI: {
    getAll: vi.fn(async () => []),
    create: (...args: unknown[]) => createSpy(...args),
    update: vi.fn(async () => ({ success: true })),
    delete: vi.fn(async () => ({ success: true })),
    activate: vi.fn(async () => ({ success: true })),
    deactivate: vi.fn(async () => ({ success: true })),
  },
  subscriptionPlansAPI: { getAll: vi.fn(async () => [{ id: 1, name: 'Standard' }]) },
  academicTermsAPI: { getActive: vi.fn(async () => []) },
}));

import InstallmentPlanBuilder from './InstallmentPlanBuilder';

/**
 * The 100% rule is the one that matters: a schedule whose parts do not add up
 * to the whole can never mark a subscription fully paid, and the failure only
 * surfaces months later when a guardian has paid everything asked of them and
 * still owes money.
 */
describe('InstallmentPlanBuilder — percentage validation', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    createSpy.mockReset();
    createSpy.mockResolvedValue({ success: true, message: 'saved' });
  });

  const openForm = async () => {
    const user = userEvent.setup();
    render(<InstallmentPlanBuilder />);
    await screen.findByText('Add plan');
    await user.click(screen.getByRole('button', { name: /add plan/i }));
    return user;
  };

  it('shows the running total and flags it when it is not 100%', async () => {
    const user = await openForm();

    // The form opens with two blank rows, so the total starts at 0%.
    expect(await screen.findByText(/Total: 0\.00%/)).toBeInTheDocument();
    expect(screen.getByText(/must be 100%/)).toBeInTheDocument();

    const amounts = screen.getAllByRole('spinbutton');
    await user.type(amounts[0], '50');
    await waitFor(() => expect(screen.getByText(/Total: 50\.00%/)).toBeInTheDocument());
  });

  it('refuses to submit a schedule that does not total 100%', async () => {
    const user = await openForm();

    // Queried by role, not by label: the panels render <label> elements with
    // no htmlFor/id association, so getByLabelText cannot find these inputs.
    // That is a real accessibility gap, recorded as follow-up rather than
    // worked around by loosening the assertion.
    await user.type(screen.getAllByRole('textbox')[0], 'Broken');
    const amounts = screen.getAllByRole('spinbutton');
    await user.type(amounts[0], '50');
    await user.type(amounts[3], '40');

    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: expect.stringContaining('100%') }),
      ),
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('clears the warning once the percentages balance', async () => {
    const user = await openForm();
    const amounts = screen.getAllByRole('spinbutton');
    await user.type(amounts[0], '50');
    await user.type(amounts[3], '50');

    await waitFor(() => expect(screen.getByText(/Total: 100\.00%/)).toBeInTheDocument());
    expect(screen.queryByText(/must be 100%/)).not.toBeInTheDocument();
  });

  it('splits evenly to exactly 100% via the helper', async () => {
    const user = await openForm();
    await user.click(screen.getByRole('button', { name: /split evenly/i }));
    await waitFor(() => expect(screen.getByText(/Total: 100\.00%/)).toBeInTheDocument());
  });
});
