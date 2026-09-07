# Follow-up: DST-sensitive subscription date arithmetic

**Status:** Documented only. **Not fixed** — deliberately excluded from the
current release at the request of the product owner, because it changes
historical subscription date semantics.

**Severity:** Medium. Silent, data-visible, and seasonal.

---

## Current behaviour

`resolveSubscriptionDates` computes a subscription's end date by adding
`plan.durationInDays` to its start date using **local-time** arithmetic:

```ts
// backend/src/common/subscription/subscription-dates.ts
const startDate = new Date(now);
const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + durationDays);   // <-- local time
```

`Date.prototype.setDate` operates in the host's local timezone. When the
interval being added crosses a daylight-saving transition, the resulting
instant shifts by the offset change — typically one hour.

## Affected function

- **File:** `backend/src/common/subscription/subscription-dates.ts`
- **Function:** `resolveSubscriptionDates`
- **Line:** the `endDate.setDate(endDate.getDate() + durationDays)` call
- **Callers:** `PaymentService.activateSubscriptionForRider` (the only
  subscription-dating path), reached on every accepted payment.

Only the `durationInDays` fallback path is affected. Subscriptions dated from
an `AcademicTerm` take the term's stored dates verbatim and are unaffected.

## Exact risk

Egypt observes DST, and the production deployment runs in a DST-observing
zone. For a subscription whose window crosses a transition:

- the stored `endDate` lands one hour earlier or later than the intended
  midnight boundary;
- rendered with `toLocaleDateString()`, an end date that should read as the
  30th can display as the **29th**, because the instant falls at 23:00 the
  previous day;
- a guardian therefore sees a subscription expiring a day sooner than they
  bought, and any comparison of "is this subscription still active" near the
  boundary can disagree with the displayed date.

This is not a crash and no money is miscalculated — the price is snapshotted
separately and is unaffected. It is a display and boundary-comparison defect.

**Precedent:** the identical bug existed in the instalment scheduler
(`modules/installment/schedule.ts`) and was caught by a unit test during
implementation; adding 60 days to a UTC-midnight instant across the
March→April transition produced the previous day. That occurrence was fixed
with UTC arithmetic. This one was left alone.

## Recommended fix

Switch to UTC day arithmetic, matching the fix already applied in
`schedule.ts`:

```ts
const endDate = new Date(startDate);
endDate.setUTCDate(endDate.getUTCDate() + durationDays);
```

Add a regression test asserting that a 30-day subscription starting at
`2026-03-01T00:00:00Z` ends at `2026-03-31T00:00:00Z` regardless of the
`TZ` the suite runs under (the existing suite already runs under a UTC+2/+3
host, which is what surfaced the instalment case).

## Migration and backward-compatibility implications

1. **Existing rows are not corrected by the code change.** Subscriptions
   already written keep their stored `endDate`. A separate one-off migration
   would be needed to normalise historical rows, and that migration would
   *change historical records* — which is precisely why this is gated behind
   explicit approval.

2. **New subscriptions would date differently from old ones.** After the fix,
   two subscriptions of the same plan bought either side of the deploy could
   differ by an hour at the boundary. This is invisible except at the exact
   expiry instant.

3. **No API contract change.** `startDate`/`endDate` remain ISO strings; no
   field is added, removed or retyped.

4. **Interaction with phase 2's commitment.** Phase 2 deliberately preserved
   the pre-existing dating behaviour byte-for-byte, including the legacy
   30-day default for a plan with no duration. Fixing this breaks that
   guarantee intentionally, so it should ship as its own change with its own
   verification rather than inside a feature release.

5. **Suggested sequencing:** deploy the code fix alone first (affects new
   subscriptions only, low blast radius), observe one renewal cycle, then
   decide separately whether historical rows are worth migrating. In most
   cases they are not — the affected subscriptions will have expired.
