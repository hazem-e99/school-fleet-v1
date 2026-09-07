/**
 * Atlas demo dataset.
 *
 * Atlas is the development / demo / QA database. This layer sits ON TOP of the
 * master data (routes, grades, groups, plans, discount) and exists so the whole
 * system can be exercised end to end: guardians with siblings, children on
 * buses, subscriptions with real pricing snapshots, instalment schedules,
 * payments, a route-change queue, notifications and audit history.
 *
 * NONE of this may ever reach production. It is reachable only from
 * scripts/seed-atlas.js, which refuses any URI that is not MongoDB Atlas.
 *
 * Every record is identifiable as demo data:
 *   - users occupy a reserved phone block, 010990000xx
 *   - buses are numbered DEMO-B1..DEMO-B4
 *   - free-text records that an admin will see in a list are prefixed [DEMO]
 */

export const DEMO_MARKER = '[DEMO]';

/** Reserved phone block. Nothing real is issued in this range. */
export const DEMO_PHONE_PREFIX = '010990000';

/** One password for every demo account; printed once at the end of a run. */
export const DEMO_PASSWORD = 'Demo@1234';

export interface DemoUser {
  key: string;
  firstName: string;
  lastName: string;
  role: 'Admin' | 'MovementManager' | 'Driver' | 'Conductor' | 'Guardian';
  phoneNumber: string;
}

export const DEMO_USERS: DemoUser[] = [
  { key: 'admin',    firstName: 'مدير',  lastName: 'النظام (تجريبي)', role: 'Admin',           phoneNumber: '01099000001' },
  { key: 'movement', firstName: 'مدير',  lastName: 'الحركة (تجريبي)', role: 'MovementManager', phoneNumber: '01099000002' },
  { key: 'driver1',  firstName: 'سائق',  lastName: 'أول (تجريبي)',    role: 'Driver',          phoneNumber: '01099000003' },
  { key: 'driver2',  firstName: 'سائق',  lastName: 'ثانٍ (تجريبي)',   role: 'Driver',          phoneNumber: '01099000004' },
  { key: 'super1',   firstName: 'مشرف',  lastName: 'الرحلة (تجريبي)', role: 'Conductor',       phoneNumber: '01099000005' },
  { key: 'guard1',   firstName: 'أحمد',  lastName: 'عبد الله (تجريبي)', role: 'Guardian',      phoneNumber: '01099000006' },
  { key: 'guard2',   firstName: 'منى',   lastName: 'سيد (تجريبي)',     role: 'Guardian',       phoneNumber: '01099000007' },
  { key: 'guard3',   firstName: 'خالد',  lastName: 'حسن (تجريبي)',     role: 'Guardian',       phoneNumber: '01099000008' },
];

export interface DemoBus {
  busNumber: string;
  capacity: number;
  speed: number;
  status: string;
  /** Route seed code this bus serves. */
  routeCode: string;
  driverKey: string;
}

export const DEMO_BUSES: DemoBus[] = [
  { busNumber: 'DEMO-B1', capacity: 30, speed: 60, status: 'Active', routeCode: 'RT-01', driverKey: 'driver1' },
  { busNumber: 'DEMO-B2', capacity: 25, speed: 60, status: 'Active', routeCode: 'RT-02', driverKey: 'driver2' },
  { busNumber: 'DEMO-B3', capacity: 20, speed: 60, status: 'Active', routeCode: 'RT-03', driverKey: 'driver1' },
  // Deliberately out of service, so the eligible-bus picker has a labelled
  // ineligible option to show.
  { busNumber: 'DEMO-B4', capacity: 15, speed: 60, status: 'UnderMaintenance', routeCode: 'RT-04', driverKey: 'driver2' },
];

export interface DemoChild {
  key: string;
  name: string;
  guardianKey: string;
  gradeName: string;
  /** Route/bus the child is assigned to, by seed code / bus number. */
  routeCode: string;
  busNumber: string;
}

/**
 * Three families. The first has three children, which is what makes the
 * sibling discount visible (1500 / 1450 / 1450 on the monthly package); grades
 * are spread across both grade groups so each package has a plausible buyer.
 */
export const DEMO_CHILDREN: DemoChild[] = [
  { key: 'c1', name: 'سارة أحمد (تجريبي)',  guardianKey: 'guard1', gradeName: 'الصف الثالث الابتدائي', routeCode: 'RT-01', busNumber: 'DEMO-B1' },
  { key: 'c2', name: 'عمر أحمد (تجريبي)',   guardianKey: 'guard1', gradeName: 'الصف الخامس الابتدائي', routeCode: 'RT-01', busNumber: 'DEMO-B1' },
  { key: 'c3', name: 'ليلى أحمد (تجريبي)',  guardianKey: 'guard1', gradeName: 'KG2',                   routeCode: 'RT-01', busNumber: 'DEMO-B1' },
  { key: 'c4', name: 'يوسف منى (تجريبي)',   guardianKey: 'guard2', gradeName: 'الصف الأول الإعدادي',   routeCode: 'RT-02', busNumber: 'DEMO-B2' },
  { key: 'c5', name: 'نور منى (تجريبي)',    guardianKey: 'guard2', gradeName: 'الصف الأول الابتدائي',  routeCode: 'RT-02', busNumber: 'DEMO-B2' },
  { key: 'c6', name: 'مريم خالد (تجريبي)',  guardianKey: 'guard3', gradeName: 'الصف الثاني الثانوي',   routeCode: 'RT-03', busNumber: 'DEMO-B3' },
  { key: 'c7', name: 'زياد خالد (تجريبي)',  guardianKey: 'guard3', gradeName: 'KG1',                   routeCode: 'RT-03', busNumber: 'DEMO-B3' },
];

export interface DemoTerm {
  key: string;
  name: string;
  /** Month/day offsets resolved against the current school year at seed time. */
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  dueDateRules: Array<{ label: string; month: number; day: number }>;
}

/**
 * Academic terms exist ONLY in Atlas, and only because the brief allows them
 * there when clearly marked. Production seeds none — real term dates are
 * business data an admin enters.
 *
 * Dates are derived from the current school year rather than hardcoded, so a
 * demo database seeded next year is still coherent.
 */
export const DEMO_TERMS: DemoTerm[] = [
  {
    key: 'term1',
    name: `${DEMO_MARKER} الفصل الدراسي الأول`,
    startMonth: 9, startDay: 15, endMonth: 1, endDay: 25,
    dueDateRules: [
      { label: 'القسط الأول', month: 9, day: 20 },
      { label: 'القسط الثاني', month: 11, day: 20 },
    ],
  },
  {
    key: 'term2',
    name: `${DEMO_MARKER} الفصل الدراسي الثاني`,
    startMonth: 2, startDay: 10, endMonth: 6, endDay: 10,
    dueDateRules: [
      { label: 'القسط الأول', month: 2, day: 15 },
      { label: 'القسط الثاني', month: 4, day: 15 },
    ],
  },
];

export interface DemoInstallmentPlan {
  key: string;
  name: string;
  allocationType: 'Percentage';
  activateOnFirstInstallment: boolean;
  installments: Array<{ index: number; percentage: number; offsetDays: number; gracePeriodDays: number }>;
}

/**
 * Instalment templates, Atlas only. Percentage-allocated so the parts always
 * reconcile to whatever each child is actually charged, and purchase-relative
 * so they need no invented calendar.
 */
export const DEMO_INSTALLMENT_PLANS: DemoInstallmentPlan[] = [
  {
    key: 'annual2',
    name: `${DEMO_MARKER} سنوي - قسطين`,
    allocationType: 'Percentage',
    activateOnFirstInstallment: true,
    installments: [
      { index: 1, percentage: 50, offsetDays: 0, gracePeriodDays: 7 },
      { index: 2, percentage: 50, offsetDays: 150, gracePeriodDays: 7 },
    ],
  },
  {
    key: 'annual4',
    name: `${DEMO_MARKER} سنوي - 4 أقساط`,
    allocationType: 'Percentage',
    activateOnFirstInstallment: true,
    installments: [
      { index: 1, percentage: 25, offsetDays: 0, gracePeriodDays: 7 },
      { index: 2, percentage: 25, offsetDays: 90, gracePeriodDays: 7 },
      { index: 3, percentage: 25, offsetDays: 180, gracePeriodDays: 7 },
      { index: 4, percentage: 25, offsetDays: 270, gracePeriodDays: 7 },
    ],
  },
];

export interface DemoSubscription {
  childKey: string;
  /** Package name from the master seed. */
  planName: string;
  /** Set for the two children paying by instalments. */
  installmentPlanKey?: string;
  /** How far through the schedule this child is, for a realistic mix. */
  paidInstallments?: number;
  /** Backdates the purchase so one schedule contains an overdue row. */
  purchasedDaysAgo: number;
  status: 'Active' | 'Expired';
}

/**
 * One subscription per child, spread across all five packages so every price
 * band is exercised. Two are on instalment plans — one fully paid, one
 * deliberately behind, so the Overdue state is visible in the dashboard.
 */
export const DEMO_SUBSCRIPTIONS: DemoSubscription[] = [
  { childKey: 'c1', planName: 'كبار - شهري',              purchasedDaysAgo: 10,  status: 'Active' },
  { childKey: 'c2', planName: 'كبار - شهري',              purchasedDaysAgo: 10,  status: 'Active' },
  { childKey: 'c3', planName: 'KG1 - الصف الثاني - ترم',  purchasedDaysAgo: 40,  status: 'Active' },
  { childKey: 'c4', planName: 'كبار - سنوي',              purchasedDaysAgo: 200, status: 'Active',
    installmentPlanKey: 'annual4', paidInstallments: 1 },
  { childKey: 'c5', planName: 'KG1 - الصف الثاني - سنوي', purchasedDaysAgo: 60,  status: 'Active',
    installmentPlanKey: 'annual2', paidInstallments: 1 },
  { childKey: 'c6', planName: 'كبار - ترم',               purchasedDaysAgo: 30,  status: 'Active' },
  { childKey: 'c7', planName: 'KG1 - الصف الثاني - ترم',  purchasedDaysAgo: 400, status: 'Expired' },
];

export interface DemoRouteChangeRequest {
  key: string;
  childKey: string;
  requestedRouteCode: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  adminNotes?: string;
}

export const DEMO_ROUTE_CHANGE_REQUESTS: DemoRouteChangeRequest[] = [
  { key: 'rcr1', childKey: 'c4', requestedRouteCode: 'RT-03', reason: 'انتقلنا إلى سكن جديد', status: 'Pending' },
  { key: 'rcr2', childKey: 'c6', requestedRouteCode: 'RT-02', reason: 'أقرب لمحل العمل', status: 'Approved',
    adminNotes: 'تم النقل إلى الخط المطلوب' },
  { key: 'rcr3', childKey: 'c5', requestedRouteCode: 'RT-04', reason: 'تجربة', status: 'Rejected',
    adminNotes: 'لا توجد أماكن متاحة على هذا الخط حالياً' },
];
