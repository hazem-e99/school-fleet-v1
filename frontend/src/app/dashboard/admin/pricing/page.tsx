'use client';

import PricingRulesPanel from '@/components/admin/PricingRulesPanel';

/**
 * Pricing gets its own page rather than a Settings tab: unlike the grade and
 * term catalogues, a rule is a decision about money, and it needs room for the
 * plan / grade-group / term / window matrix.
 */
export default function PricingPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PricingRulesPanel />
    </div>
  );
}
