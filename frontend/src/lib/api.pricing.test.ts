import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pricingAPI } from './api';

/**
 * The quote client is the only route by which a price reaches the UI.
 *
 * What matters is that it POSTs the basket and returns the server's numbers
 * untouched — the client must never derive, adjust or total anything itself.
 */

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const quote = {
  subscriptionPlanId: 1,
  planName: 'Standard',
  subscriptionType: 'Monthly',
  lines: [
    { childId: 11, childName: 'Sara', basePrice: 500, discountAmount: 0, finalPrice: 500, siblingPosition: 1 },
    { childId: 12, childName: 'Omar', basePrice: 500, discountAmount: 100, finalPrice: 400, siblingPosition: 2 },
  ],
  totals: { base: 1000, discount: 100, final: 900 },
};

describe('pricingAPI.quote', () => {
  it('POSTs the basket to /Pricing/quote', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: quote, success: true }));

    await pricingAPI.quote(1, [11, 12]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/Pricing/quote');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ subscriptionPlanId: 1, childIds: [11, 12] });
  });

  it('returns the server totals verbatim, deriving nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: quote, success: true }));

    const result = await pricingAPI.quote(1, [11, 12]);

    expect(result?.totals).toEqual({ base: 1000, discount: 100, final: 900 });
    // Notably NOT basePrice * lines.length, which is what the UI used to do.
    expect(result?.totals.final).not.toBe(result!.lines[0].basePrice * result!.lines.length);
  });

  it('omits installmentPlanId when none was requested', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: quote, success: true }));
    await pricingAPI.quote(1, [11]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('installmentPlanId');
  });

  it('sends installmentPlanId when a schedule is being previewed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { ...quote, installment: { installmentPlanId: 90, amountDueNow: 450, installmentCount: 2, perChild: [] } },
        success: true,
      }),
    );

    const result = await pricingAPI.quote(1, [11, 12], 90);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).installmentPlanId).toBe(90);
    // The amount charged now is the server's figure, not a share of the total.
    expect(result?.installment?.amountDueNow).toBe(450);
  });

  it('returns null when the response carries no data', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null, success: false }));
    await expect(pricingAPI.quote(1, [11])).resolves.toBeNull();
  });
});
