/**
 * A sibling discount rule.
 *
 * Rank is family-level, ordered by enrolment, and permanent: a child who has
 * ever held a paid subscription keeps their position, so an expired
 * subscription never costs a younger sibling their discount.
 */
export interface DiscountRuleViewModel {
  id: number;
  name: string | null;
  kind: string;
  discountType: 'Fixed' | 'Percentage' | string;
  /** Currency amount for Fixed, a 0-100 percentage for Percentage. */
  value: number;
  /** 2 means "the second and every later child". The eldest always pays full. */
  startingSiblingPosition: number;
  maxDiscountAmount: number | null;
  /** Empty means every plan. */
  applicablePlanIds: number[];
  applicablePlanNames: string[];
  /** Empty means every grade group, including children with no grade. */
  applicableGradeGroupIds: number[];
  applicableGradeGroupNames: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface CreateDiscountRuleDTO {
  name: string;
  discountType: string;
  value: number;
  startingSiblingPosition?: number;
  maxDiscountAmount?: number;
  applicablePlanIds?: number[];
  applicableGradeGroupIds?: number[];
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface UpdateDiscountRuleDTO {
  name?: string;
  discountType?: string;
  value?: number;
  startingSiblingPosition?: number;
  maxDiscountAmount?: number;
  applicablePlanIds?: number[];
  applicableGradeGroupIds?: number[];
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface DiscountRuleViewModelApiResponse {
  data: DiscountRuleViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface DiscountRuleViewModelIEnumerableApiResponse {
  data: DiscountRuleViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
