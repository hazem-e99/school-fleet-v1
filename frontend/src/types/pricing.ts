/**
 * A single cell of the admin pricing matrix.
 *
 * Rules OVERRIDE the plan's own price; they never replace it. A plan with no
 * matching rule still sells at `SubscriptionPlan.price`, which is why an empty
 * rules table is a valid state rather than a broken one.
 */
export interface PricingRuleViewModel {
  id: number;
  name: string | null;
  subscriptionPlanId: number;
  subscriptionPlanName: string | null;
  subscriptionType: string | null;
  /** The plan's fallback price, shown alongside so the override is legible. */
  planPrice: number | null;
  /** Null means "every grade", including children with no grade set. */
  gradeGroupId: number | null;
  gradeGroupName: string | null;
  /** Only ever set for Term/Annual plans. */
  academicTermId: number | null;
  academicTermName: string | null;
  price: number;
  effectiveFrom: string | null;
  /** Null means open-ended. */
  effectiveTo: string | null;
  isActive: boolean;
}

export interface CreatePricingRuleDTO {
  name: string;
  subscriptionPlanId: number;
  gradeGroupId?: number;
  academicTermId?: number;
  price: number;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface UpdatePricingRuleDTO {
  name?: string;
  subscriptionPlanId?: number;
  gradeGroupId?: number;
  academicTermId?: number;
  price?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface PricingRuleViewModelApiResponse {
  data: PricingRuleViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface PricingRuleViewModelIEnumerableApiResponse {
  data: PricingRuleViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

/** One child's price, fully explained by the server. */
export interface QuoteLine {
  childId: number;
  childName: string | null;
  gradeLevelId: number | null;
  gradeLevelName: string | null;
  gradeGroupId: number | null;
  gradeGroupName: string | null;
  basePrice: number;
  pricingRuleId: number | null;
  pricingRuleName: string | null;
  academicTermId: number | null;
  academicTermName: string | null;
  startDate: string;
  endDate: string;
  /** True when the dates came from an academic term rather than a day count. */
  datedFromTerm: boolean;
  siblingPosition: number | null;
  discountRuleId: number | null;
  discountType: string | null;
  discountValue: number | null;
  discountAmount: number;
  discountReason: string | null;
  finalPrice: number;
}

/**
 * The ONLY source of a displayed total. The frontend performs no price
 * arithmetic of its own — it renders these numbers verbatim.
 */
export interface QuoteInstallmentPreview {
  installmentPlanId: number;
  installmentPlanName: string;
  activateOnFirstInstallment: boolean;
  installmentCount: number;
  /** What the guardian pays now. Server-computed — never derived on the client. */
  amountDueNow: number;
  perChild: Array<{
    childId: number;
    childName: string | null;
    rows: Array<{ index: number; amount: number; dueDate: string }>;
  }>;
}

export interface QuoteViewModel {
  subscriptionPlanId: number;
  planName: string;
  subscriptionType: string;
  lines: QuoteLine[];
  totals: { base: number; discount: number; final: number };
  /** Present only when a payment schedule was requested. */
  installment?: QuoteInstallmentPreview | null;
}

export interface QuoteViewModelApiResponse {
  data: QuoteViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
