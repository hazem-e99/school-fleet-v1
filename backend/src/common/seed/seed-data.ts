/**
 * Business seed data.
 *
 * Kept as plain constants, separate from the seeding logic, so the values a
 * school actually operates on are reviewable in one place without reading
 * control flow.
 *
 * Everything here is a DEFAULT. Once seeded, each record is admin-managed:
 * the seeder creates what is missing and never rewrites what exists.
 */

/** Route codes are the stable identity. They are assigned once and never renumbered. */
export interface SeedRoute {
  code: string;
  name: string;
}

/**
 * The school's lines. `code` — not the name — is the identity used on re-runs,
 * so an admin renaming a route in the dashboard does not cause the seeder to
 * recreate it under the old name.
 *
 * Deliberately no startLocation / endLocation / distance / estimatedTime: none
 * were supplied, and inventing them would put fabricated operational data in
 * front of drivers. DbMigrationService.reportIncompleteRoutes already logs
 * routes missing those fields on every boot, so seeded lines surface there
 * until an admin fills them in.
 */
export const SEED_ROUTES: SeedRoute[] = [
  { code: 'RT-01', name: 'النميس' },
  { code: 'RT-02', name: 'مصنع سيد' },
  { code: 'RT-03', name: 'سيتي' },
  { code: 'RT-04', name: 'السادات' },
  { code: 'RT-05', name: 'الهلالي' },
  { code: 'RT-06', name: 'الجمهورية' },
  { code: 'RT-07', name: 'فريال — محمود رشوان' },
  { code: 'RT-08', name: 'فريال — شارع الجلاء / جودة' },
  { code: 'RT-09', name: 'تقسيم البترول' },
  { code: 'RT-10', name: 'أبراج القضاة' },
  { code: 'RT-11', name: 'أبراج النصر' },
  { code: 'RT-12', name: 'أبراج الإبراهيمية' },
  { code: 'RT-13', name: 'تقسيم الحقوقيين' },
  { code: 'RT-14', name: 'دار المناسبات' },
  { code: 'RT-15', name: 'فريال — الجمهورية' },
  { code: 'RT-16', name: 'المعلمين' },
  { code: 'RT-17', name: 'خط 1 سمارت' },
  { code: 'RT-18', name: 'خط 2 مسارت' },
];

export interface SeedGradeLevel {
  name: string;
  order: number;
}

/**
 * Order values step by 10 so an admin can insert a grade between two seeded
 * ones without renumbering the whole catalogue.
 */
export const SEED_GRADE_LEVELS: SeedGradeLevel[] = [
  { name: 'KG1', order: 10 },
  { name: 'KG2', order: 20 },
  { name: 'الصف الأول الابتدائي', order: 30 },
  { name: 'الصف الثاني الابتدائي', order: 40 },
  { name: 'الصف الثالث الابتدائي', order: 50 },
  { name: 'الصف الرابع الابتدائي', order: 60 },
  { name: 'الصف الخامس الابتدائي', order: 70 },
  { name: 'الصف السادس الابتدائي', order: 80 },
  { name: 'الصف الأول الإعدادي', order: 90 },
  { name: 'الصف الثاني الإعدادي', order: 100 },
  { name: 'الصف الثالث الإعدادي', order: 110 },
  { name: 'الصف الأول الثانوي', order: 120 },
  { name: 'الصف الثاني الثانوي', order: 130 },
  { name: 'الصف الثالث الثانوي', order: 140 },
];

export interface SeedGradeGroup {
  /** Stable business key. Not stored — GradeGroup has no key field and adding
   *  one would be a schema change for no runtime benefit — but it pins which
   *  display name each group is, so renaming the constant is a deliberate act. */
  key: 'KG1_TO_GRADE_2' | 'GRADE_3_AND_ABOVE';
  name: string;
  memberGradeNames: string[];
}

export const SEED_GRADE_GROUPS: SeedGradeGroup[] = [
  {
    key: 'KG1_TO_GRADE_2',
    name: 'KG1 حتى الصف الثاني الابتدائي',
    memberGradeNames: ['KG1', 'KG2', 'الصف الأول الابتدائي', 'الصف الثاني الابتدائي'],
  },
  {
    key: 'GRADE_3_AND_ABOVE',
    name: 'من الصف الثالث الابتدائي فما فوق',
    memberGradeNames: [
      'الصف الثالث الابتدائي',
      'الصف الرابع الابتدائي',
      'الصف الخامس الابتدائي',
      'الصف السادس الابتدائي',
      'الصف الأول الإعدادي',
      'الصف الثاني الإعدادي',
      'الصف الثالث الإعدادي',
      'الصف الأول الثانوي',
      'الصف الثاني الثانوي',
      'الصف الثالث الثانوي',
    ],
  },
];

export interface SeedSubscriptionPlan {
  name: string;
  subscriptionType: 'Monthly' | 'Term' | 'Annual';
  /** Fallback price on the plan itself. Admin-editable; never reset by the seeder. */
  price: number;
  durationInDays: number;
  /**
   * Which grade group the school intends this package for.
   *
   * Recorded here for traceability only — it is NOT written to the database.
   * SubscriptionPlan has no grade-group field, and the only mechanism that
   * ties a plan to a group is PricingRule, which *prices* rather than
   * restricts. Creating a rule whose price equals the plan's own price would
   * add no behaviour and would make later edits to SubscriptionPlan.price
   * ineffective for exactly those children — the footgun the brief rules out.
   * See SeedDefaultsService.seedSubscriptionPlans.
   */
  intendedGradeGroupKey: 'KG1_TO_GRADE_2' | 'GRADE_3_AND_ABOVE';
}

/**
 * `durationInDays` is required by the schema, so every plan needs one.
 *
 *  - Monthly 30  — the value the system already falls back to.
 *  - Annual 365  — definitionally a year.
 *  - Term 182    — a PLACEHOLDER. A term's real length comes from an
 *                  AcademicTerm, and no real term dates were supplied, so this
 *                  is only the fallback used until an admin defines the
 *                  calendar. Flagged at boot rather than passed off as fact.
 */
export const SEED_TERM_DURATION_IS_PLACEHOLDER = true;

export const SEED_SUBSCRIPTION_PLANS: SeedSubscriptionPlan[] = [
  {
    name: 'كبار - سنوي',
    subscriptionType: 'Annual',
    price: 12000,
    durationInDays: 365,
    intendedGradeGroupKey: 'GRADE_3_AND_ABOVE',
  },
  {
    name: 'كبار - ترم',
    subscriptionType: 'Term',
    price: 6000,
    durationInDays: 182,
    intendedGradeGroupKey: 'GRADE_3_AND_ABOVE',
  },
  {
    name: 'كبار - شهري',
    subscriptionType: 'Monthly',
    price: 1500,
    durationInDays: 30,
    intendedGradeGroupKey: 'GRADE_3_AND_ABOVE',
  },
  {
    name: 'KG1 - الصف الثاني - سنوي',
    subscriptionType: 'Annual',
    price: 10500,
    durationInDays: 365,
    intendedGradeGroupKey: 'KG1_TO_GRADE_2',
  },
  {
    name: 'KG1 - الصف الثاني - ترم',
    subscriptionType: 'Term',
    price: 5250,
    durationInDays: 182,
    intendedGradeGroupKey: 'KG1_TO_GRADE_2',
  },
];

/**
 * `maxNumberOfRides` is required by the schema but has no input anywhere in
 * the admin UI, which posts a fixed 1. Seeded plans use the same value so they
 * are indistinguishable from admin-created ones.
 */
export const SEED_PLAN_MAX_RIDES = 1;

export interface SeedDiscountRule {
  name: string;
  discountType: 'Fixed';
  /** Currency amount off, per qualifying child. */
  value: number;
  startingSiblingPosition: number;
  /** Plan this applies to, by name — resolved to a numericId at seed time. */
  applicablePlanName: string;
}

/**
 * The school's sibling rule for the monthly package: 1500 for the first child,
 * 1450 for each subsequent one.
 *
 * Expressed as "50 off from the second child onwards" rather than as a 1450
 * literal, so the engine keeps deriving the result. Changing the plan price to
 * 1600 then yields 1550 for siblings with no further edit — a hardcoded 1450
 * would silently stop tracking.
 */
export const SEED_SIBLING_DISCOUNT: SeedDiscountRule = {
  name: 'خصم الأخوة - كبار شهري',
  discountType: 'Fixed',
  value: 50,
  startingSiblingPosition: 2,
  applicablePlanName: 'كبار - شهري',
};

/** Collapses runs of whitespace so comparison ignores incidental spacing. Display text is never changed. */
export function normaliseName(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
