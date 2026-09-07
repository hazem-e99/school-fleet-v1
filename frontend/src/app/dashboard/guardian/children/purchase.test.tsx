import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastSpy = vi.fn();
const quoteSpy = vi.fn();
const createPaymentSpy = vi.fn();

vi.mock('@/contexts/LanguageContext', () => ({
  useI18n: () => ({ t: (_k: string, f?: string) => f ?? _k, lang: 'en', isRTL: false }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: toastSpy }) }));
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (p: any) => <div {...p} /> }),
}));

const child = (id: number, name: string) => ({
  id, guardianId: 9, name, fullName: name, schoolName: 'A', pickupAreaName: 'B',
  status: 'Active', email: null, gradeLevelId: null, gradeLevelName: null,
  routeId: null, routeName: null, busId: null, busNumber: null, activeSubscription: null,
});

vi.mock('@/lib/api', () => ({
  childrenAPI: {
    getMyChildren: vi.fn(async () => [child(11, 'Sara'), child(12, 'Omar')]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  },
  subscriptionPlansAPI: {
    getActive: vi.fn(async () => [
      { id: 1, name: 'Standard', description: 'Daily', price: 500, durationInDays: 30, subscriptionType: 'Monthly', isActive: true },
    ]),
  },
  schoolsAPI: { getActive: vi.fn(async () => [{ name: 'A' }]) },
  preferredAreasAPI: { getActive: vi.fn(async () => [{ name: 'B' }]) },
  gradeLevelsAPI: { getActive: vi.fn(async () => []) },
  paymentAPI: { create: (...a: unknown[]) => createPaymentSpy(...a) },
  pricingAPI: { quote: (...a: unknown[]) => quoteSpy(...a) },
  installmentPlansAPI: { getActive: vi.fn(async () => []) },
  routeAPI: { getAll: vi.fn(async () => []) },
  routeChangeRequestAPI: { getMyRequests: vi.fn(async () => []), create: vi.fn(), cancel: vi.fn() },
}));

import GuardianChildrenPage from './page';

/**
 * The purchase flow's contract: the guardian is never shown a figure this app
 * invented. Before phase 4 the page multiplied `plan.price` by the number of
 * selected children — a number that is simply wrong once grade-based pricing
 * or sibling discounts exist.
 */
const quote = {
  subscriptionPlanId: 1,
  planName: 'Standard',
  subscriptionType: 'Monthly',
  lines: [
    { childId: 11, childName: 'Sara', basePrice: 500, discountAmount: 0, finalPrice: 500, siblingPosition: 1, gradeLevelName: null },
    { childId: 12, childName: 'Omar', basePrice: 500, discountAmount: 100, finalPrice: 400, siblingPosition: 2, gradeLevelName: null },
  ],
  totals: { base: 1000, discount: 100, final: 900 },
  installment: null,
};

async function selectBothAndOpenCheckout() {
  const user = userEvent.setup();
  render(<GuardianChildrenPage />);
  // The name appears in both the children grid and the subscribe-selection
  // list, so this waits for any occurrence rather than a unique one.
  await screen.findAllByText('Sara');

  // Selected by the name beside each box rather than by index: the list also
  // renders a select-all control, so positional indexes are not stable.
  const boxFor = (name: string) =>
    screen
      .getAllByRole('checkbox')
      .find((box) => box.closest('label')?.textContent?.includes(name))!;

  await user.click(boxFor('Sara'));
  await user.click(boxFor('Omar'));

  await user.click(screen.getAllByRole('button', { name: /choose this plan/i })[0]);
  return { user, dialog: await screen.findByRole('dialog') };
}

describe('Guardian purchase — the quote is the only source of price', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    quoteSpy.mockReset().mockResolvedValue(quote);
    createPaymentSpy.mockReset().mockResolvedValue({ success: true });
  });

  it('asks the server for a quote when a plan is chosen', async () => {
    await selectBothAndOpenCheckout();
    // No instalment plan argument on the initial quote — one is passed only
    // when the guardian picks a payment schedule.
    await waitFor(() => expect(quoteSpy).toHaveBeenCalledWith(1, [11, 12]));
  });

  it('renders the server total, not price × children', async () => {
    const { dialog } = await selectBothAndOpenCheckout();
    // 900, not 1000 — the discount is the server's and the client cannot know it.
    expect(await within(dialog).findByText(/\$900\.00/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/\$1,000\.00/)).not.toBeInTheDocument();
  });

  it('renders the per-child sibling discount breakdown', async () => {
    const { dialog } = await selectBothAndOpenCheckout();
    await within(dialog).findByText('Sara');
    // The discounted child shows the struck-through base and the final price.
    expect(within(dialog).getByText(/\$400\.00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Discount/)).toBeInTheDocument();
  });

  it('keeps submit disabled until the quote resolves', async () => {
    let release: (v: unknown) => void = () => {};
    quoteSpy.mockReturnValue(new Promise((res) => { release = res; }));

    const { dialog } = await selectBothAndOpenCheckout();
    const submit = within(dialog).getByRole('button', { name: /submit payment/i });
    // A guardian must never be able to confirm an amount that never loaded.
    expect(submit).toBeDisabled();

    release(quote);
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it('leaves submit disabled and shows the error when the quote fails', async () => {
    quoteSpy.mockRejectedValue(new Error('quote unavailable'));

    const { dialog } = await selectBothAndOpenCheckout();

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /submit payment/i })).toBeDisabled(),
    );
    // Submitting would still price correctly server-side, but the guardian is
    // not asked to confirm a total the page could not obtain.
    expect(createPaymentSpy).not.toHaveBeenCalled();
  });
});
