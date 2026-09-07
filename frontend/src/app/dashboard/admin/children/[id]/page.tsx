'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/format';
import { childrenAPI } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  ArrowLeft, RefreshCw, AlertCircle, Users, Route as RouteIcon,
  Bus as BusIcon, CreditCard, CalendarClock, History, GraduationCap, Mail,
} from 'lucide-react';
import type { ChildDetailViewModel } from '@/types/childDetail';

/**
 * Admin detail view for a Child — the rider, not the legacy Student User
 * record. Child is the source of truth throughout.
 *
 * All of it arrives from one aggregated endpoint, and every monetary figure is
 * a stored snapshot: this page performs no arithmetic of its own, the same
 * rule the guardian purchase flow follows.
 *
 * Direction: layout uses logical properties (`ms-`/`me-`/`text-start`) and
 * `gap-*` rather than physical `ml-`/`mr-`/`space-x-*`, so it mirrors
 * correctly in Arabic without a second code path.
 */

const dash = '—';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString() : dash;

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : dash;

/** One label/value row. Values are pre-formatted by the caller. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-sm text-text-primary break-words">{children ?? dash}</div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function ChildDetailPage() {
  const params = useParams();
  const childId = params?.id as string;
  const { t, lang } = useI18n();

  const [detail, setDetail] = useState<ChildDetailViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const money = (amount: number | null | undefined) =>
    amount === null || amount === undefined ? dash : formatCurrency(lang, amount);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await childrenAPI.getDetail(childId);
      if (!data) throw new Error('Not found');
      setDetail(data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="py-12 text-center text-sm text-text-secondary">
          {t('common.loading', 'Loading...')}
        </p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Link href="/dashboard/admin/students-overview">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 me-2 rtl:rotate-180" />
            {t('common.back', 'Back')}
          </Button>
        </Link>
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p>{error || t('pages.admin.childDetail.notFound', 'This child could not be found.')}</p>
            <Button variant="outline" className="mt-3" onClick={load}>
              <RefreshCw className="h-4 w-4 me-2" />
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { child, guardian, siblings, assignment, subscriptions, payments, routeChangeRequests, assignmentHistory } = detail;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/dashboard/admin/students-overview" className="mb-2 inline-block">
            <Button variant="outline" size="sm">
              {/* rotate-180 in RTL so the arrow points back, not forward. */}
              <ArrowLeft className="h-4 w-4 me-2 rtl:rotate-180" />
              {t('pages.admin.childDetail.backToOverview', 'Back to children')}
            </Button>
          </Link>
          <h1 className="truncate text-2xl font-bold text-text-primary sm:text-3xl">{child.name}</h1>
          <p className="text-sm text-text-secondary">
            {child.schoolName ?? dash}
            {child.gradeLevelName ? ` · ${child.gradeLevelName}` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Badge variant={child.status === 'Active' ? 'default' : 'secondary'}>{child.status}</Badge>
          <Button variant="outline" onClick={load} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 me-2" />
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t('pages.admin.childDetail.profile', 'Profile')} icon={<GraduationCap className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('pages.admin.childDetail.fields.name', 'Name')}>{child.name}</Field>
            <Field label={t('pages.admin.childDetail.fields.email', 'Email')}>
              {child.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-text-muted" />
                  {child.email}
                </span>
              ) : null}
            </Field>
            <Field label={t('pages.admin.childDetail.fields.grade', 'Grade')}>{child.gradeLevelName}</Field>
            <Field label={t('pages.admin.childDetail.fields.school', 'School')}>{child.schoolName}</Field>
            <Field label={t('pages.admin.childDetail.fields.pickupArea', 'Pickup area')}>{child.pickupAreaName}</Field>
            <Field label={t('pages.admin.childDetail.fields.gender', 'Gender')}>{child.gender}</Field>
            <Field label={t('pages.admin.childDetail.fields.dateOfBirth', 'Date of birth')}>{fmtDate(child.dateOfBirth)}</Field>
            <Field label={t('pages.admin.childDetail.fields.registered', 'Registered')}>{fmtDate(child.registeredAt)}</Field>
          </div>
        </SectionCard>

        <SectionCard title={t('pages.admin.childDetail.family', 'Guardian and family')} icon={<Users className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('pages.admin.childDetail.fields.guardian', 'Guardian')}>{guardian?.name}</Field>
            <Field label={t('pages.admin.childDetail.fields.phone', 'Phone')}>{guardian?.phoneNumber}</Field>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs text-text-muted">
              {t('pages.admin.childDetail.siblings', 'Children in this family')}
            </div>
            {siblings.length <= 1 ? (
              <p className="text-sm text-text-secondary">
                {t('pages.admin.childDetail.onlyChild', 'No siblings registered. A family of one pays full price.')}
              </p>
            ) : (
              <ul className="space-y-1">
                {siblings.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">
                    <span className="min-w-0">
                      {s.isSelf ? (
                        <span className="font-medium">{s.name}</span>
                      ) : (
                        <Link href={`/dashboard/admin/children/${s.id}`} className="text-primary underline">
                          {s.name}
                        </Link>
                      )}
                      {s.gradeLevelName && <span className="text-text-muted"> · {s.gradeLevelName}</span>}
                      {s.routeName && <span className="text-text-muted"> · {s.routeName}</span>}
                    </span>
                    <Badge variant={s.hasActiveSubscription ? 'default' : 'secondary'}>
                      {s.hasActiveSubscription
                        ? t('pages.admin.childDetail.subscribed', 'Subscribed')
                        : t('pages.admin.childDetail.notSubscribed', 'No plan')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t('pages.admin.childDetail.assignment', 'Route and bus')} icon={<RouteIcon className="h-4 w-4" />}>
        {assignment.routeId === null && assignment.busId === null ? (
          <p className="text-sm text-text-secondary">
            {t('pages.admin.childDetail.noAssignment', 'This child is not assigned to a route or bus yet.')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('pages.admin.childDetail.fields.route', 'Route')}>
              <span className="inline-flex flex-wrap items-center gap-2">
                {assignment.routeName ?? dash}
                {/* A child already on a route that was since disabled keeps
                    their place — surfaced rather than silently normal. */}
                {assignment.routeIsActive === false && (
                  <Badge variant="outline">{t('pages.admin.childDetail.routeDisabled', 'Route disabled')}</Badge>
                )}
              </span>
            </Field>
            <Field label={t('pages.admin.childDetail.fields.bus', 'Bus')}>
              <span className="inline-flex flex-wrap items-center gap-2">
                <BusIcon className="h-3.5 w-3.5 text-text-muted" />
                {assignment.busNumber ?? dash}
                {assignment.busStatus && assignment.busStatus !== 'Active' && (
                  <Badge variant="outline">{assignment.busStatus}</Badge>
                )}
              </span>
            </Field>
            <Field label={t('pages.admin.childDetail.fields.capacity', 'Bus occupancy')}>
              {assignment.busCapacity === null
                ? dash
                : `${assignment.busAssignedStudents ?? 0} / ${assignment.busCapacity}`}
            </Field>
            <Field label={t('pages.admin.childDetail.fields.freeSeats', 'Free seats')}>
              {assignment.busAvailableSeats === null ? dash : assignment.busAvailableSeats}
            </Field>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('pages.admin.childDetail.subscriptions', 'Subscriptions and pricing')} icon={<CreditCard className="h-4 w-4" />}>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('pages.admin.childDetail.noSubscriptions', 'This child has never had a subscription.')}
          </p>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">
                      {sub.subscriptionPlanName ?? dash}
                      {sub.subscriptionType && (
                        <span className="ms-2 text-xs font-normal text-text-muted">{sub.subscriptionType}</span>
                      )}
                    </div>
                    <div className="text-sm text-text-secondary">
                      {fmtDate(sub.startDate)} → {fmtDate(sub.endDate)}
                      {sub.termName && <span className="text-text-muted"> · {sub.termName}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={sub.status === 'Active' ? 'default' : 'secondary'}>{sub.status}</Badge>
                    {sub.cancellationStatus !== 'None' && (
                      <Badge variant="outline">
                        {t('pages.admin.childDetail.cancellation', 'Cancellation')}: {sub.cancellationStatus}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Pricing snapshot, frozen at purchase. */}
                <div className="mt-3 grid grid-cols-1 gap-4 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Field label={t('pages.admin.childDetail.fields.basePrice', 'Base price')}>{money(sub.basePrice)}</Field>
                  <Field label={t('pages.admin.childDetail.fields.pricingRule', 'Pricing rule')}>
                    {sub.pricingRuleName ?? t('pages.admin.childDetail.planPrice', 'Plan price')}
                  </Field>
                  <Field label={t('pages.admin.childDetail.fields.siblingPosition', 'Sibling position')}>
                    {sub.siblingPosition === null ? dash : `#${sub.siblingPosition}`}
                  </Field>
                  <Field label={t('pages.admin.childDetail.fields.discount', 'Sibling discount')}>
                    {sub.discountAmount > 0 ? (
                      <span className="text-green-700">
                        -{money(sub.discountAmount)}
                        {sub.discountType === 'Percentage' && sub.discountValue !== null && (
                          <span className="text-text-muted"> ({sub.discountValue}%)</span>
                        )}
                      </span>
                    ) : null}
                  </Field>
                  <Field label={t('pages.admin.childDetail.fields.finalPrice', 'Charged')}>
                    <span className="font-semibold text-primary">{money(sub.finalPrice ?? sub.price)}</span>
                  </Field>
                </div>

                {sub.discountReason && (
                  <p className="mt-2 text-xs text-text-muted">{sub.discountReason}</p>
                )}

                {!sub.hasSnapshot && (
                  // Legacy rows predate snapshots and fall back to the live
                  // plan price, which may have changed since. Say so rather
                  // than presenting it as the price that was charged.
                  <p className="mt-2 text-xs text-amber-700">
                    {t(
                      'pages.admin.childDetail.legacyPricing',
                      'This subscription predates pricing snapshots — the figure shown is the plan’s current price, not necessarily what was charged.',
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('pages.admin.childDetail.installments', 'Instalments')} icon={<CalendarClock className="h-4 w-4" />}>
        {subscriptions.every((s) => s.installments.length === 0) ? (
          <p className="text-sm text-text-secondary">
            {t('pages.admin.childDetail.noInstallments', 'No instalment schedule — subscriptions were paid in full.')}
          </p>
        ) : (
          <div className="space-y-4">
            {subscriptions
              .filter((sub) => sub.installments.length > 0)
              .map((sub) => (
                <div key={sub.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary">
                        {sub.installmentPlanName ?? t('pages.admin.childDetail.schedule', 'Schedule')}
                      </div>
                      <div className="text-xs text-text-muted">
                        {sub.subscriptionPlanName} · {fmtDate(sub.startDate)}
                        {sub.activateOnFirstInstallment === false && (
                          <> · {t('pages.admin.childDetail.activatesOnFull', 'activates on full payment')}</>
                        )}
                      </div>
                    </div>
                    {sub.paymentState && (
                      <Badge
                        variant={
                          sub.paymentState === 'Overdue'
                            ? 'destructive'
                            : sub.paymentState === 'Paid'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {sub.paymentState}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 border-t border-border pt-3 sm:grid-cols-3">
                    <Field label={t('pages.admin.childDetail.fields.paid', 'Paid')}>{money(sub.paidAmount)}</Field>
                    <Field label={t('pages.admin.childDetail.fields.remaining', 'Remaining')}>{money(sub.remainingAmount)}</Field>
                    <Field label={t('pages.admin.childDetail.fields.nextDue', 'Next due')}>{fmtDate(sub.nextDueDate)}</Field>
                  </div>

                  <div className="mt-3 space-y-1">
                    {sub.installments.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm"
                      >
                        <span className="text-text-secondary">
                          {t('pages.admin.childDetail.instalment', 'Instalment')} {row.index} · {fmtDate(row.dueDate)}
                          {row.gracePeriodDays > 0 && (
                            <span className="text-text-muted">
                              {' '}(+{row.gracePeriodDays} {t('pages.admin.childDetail.graceDays', 'grace days')})
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <span>
                            {money(row.paidAmount)} / {money(row.amount)}
                          </span>
                          <Badge variant={row.isOverdue ? 'destructive' : row.status === 'Paid' ? 'default' : 'secondary'}>
                            {row.status}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('pages.admin.childDetail.payments', 'Payment history')} icon={<CreditCard className="h-4 w-4" />}>
        {payments.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('pages.admin.childDetail.noPayments', 'No payments recorded for this child.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm sm:min-w-0">
              <thead>
                <tr className="border-b border-border text-start text-xs text-text-muted">
                  <th className="py-2 text-start">{t('pages.admin.childDetail.fields.date', 'Date')}</th>
                  <th className="py-2 text-start">{t('pages.admin.childDetail.fields.plan', 'Plan')}</th>
                  <th className="py-2 text-start">{t('pages.admin.childDetail.fields.amount', 'Amount')}</th>
                  <th className="py-2 text-start">{t('pages.admin.childDetail.fields.method', 'Method')}</th>
                  <th className="py-2 text-start">{t('pages.admin.childDetail.fields.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2 align-top text-text-secondary">{fmtDate(p.createdAt)}</td>
                    <td className="py-2 align-top">
                      {p.subscriptionPlanName ?? dash}
                      {p.childCount > 1 && (
                        <div className="text-xs text-text-muted">
                          {t('pages.admin.childDetail.sharedPayment', 'Shared across')} {p.childCount}{' '}
                          {t('pages.admin.childDetail.children', 'children')}
                        </div>
                      )}
                    </td>
                    <td className="py-2 align-top">
                      {money(p.amount)}
                      {(p.discountAmount ?? 0) > 0 && (
                        <div className="text-xs text-green-700">-{money(p.discountAmount)}</div>
                      )}
                      {(p.refundAmount ?? 0) > 0 && (
                        <div className="text-xs text-red-700">
                          {t('pages.admin.childDetail.refunded', 'Refunded')} {money(p.refundAmount)}
                        </div>
                      )}
                    </td>
                    <td className="py-2 align-top text-text-secondary">
                      {p.paymentMethod ?? dash}
                      {p.paymentChannel && <div className="text-xs text-text-muted">{p.paymentChannel}</div>}
                    </td>
                    <td className="py-2 align-top">
                      <Badge variant={p.status === 'Accepted' ? 'default' : p.status === 'Rejected' ? 'destructive' : 'secondary'}>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t('pages.admin.childDetail.routeRequests', 'Route change requests')} icon={<RouteIcon className="h-4 w-4" />}>
          {routeChangeRequests.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {t('pages.admin.childDetail.noRouteRequests', 'No route changes have been requested for this child.')}
            </p>
          ) : (
            <ul className="space-y-2">
              {routeChangeRequests.map((r) => (
                <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      {r.currentRouteName ?? t('pages.admin.childDetail.unassigned', 'Unassigned')}
                      {' → '}
                      {r.requestedRouteName ?? dash}
                    </span>
                    <Badge variant={r.status === 'Approved' ? 'default' : r.status === 'Pending' ? 'secondary' : 'outline'}>
                      {r.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-text-muted">{fmtDateTime(r.createdAt)}</div>
                  {r.reason && <div className="mt-1 text-text-secondary">{r.reason}</div>}
                  {/* An approval may land on a different bus than the guardian
                      asked for, so what was applied is shown separately. */}
                  {r.status === 'Approved' && (
                    <div className="mt-1 text-xs text-text-muted">
                      {t('pages.admin.childDetail.placedOn', 'Placed on')} {r.appliedRouteName ?? dash}
                      {r.appliedBusNumber ? ` · ${r.appliedBusNumber}` : ''}
                    </div>
                  )}
                  {r.adminNotes && <div className="mt-1 text-xs text-text-secondary">{r.adminNotes}</div>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={t('pages.admin.childDetail.history', 'Assignment history')} icon={<History className="h-4 w-4" />}>
          {assignmentHistory.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {t(
                'pages.admin.childDetail.noHistory',
                'No recorded changes. Assignments made before the audit log existed do not appear here.',
              )}
            </p>
          ) : (
            <ul className="space-y-2">
              {assignmentHistory.map((entry, i) => (
                <li key={`${entry.action}-${entry.at}-${i}`} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-text-primary">{entry.action}</span>
                    <span className="text-xs text-text-muted">{fmtDateTime(entry.at)}</span>
                  </div>
                  {(entry.before || entry.after) && (
                    <div className="mt-1 text-xs text-text-secondary">
                      {t('pages.admin.childDetail.routeShort', 'Route')} {entry.before?.routeId ?? dash} → {entry.after?.routeId ?? dash}
                      {' · '}
                      {t('pages.admin.childDetail.busShort', 'Bus')} {entry.before?.busId ?? dash} → {entry.after?.busId ?? dash}
                    </div>
                  )}
                  {entry.note && <div className="mt-1 text-xs text-amber-700">{entry.note}</div>}
                  {entry.actorRole && (
                    <div className="mt-1 text-xs text-text-muted">
                      {t('pages.admin.childDetail.by', 'by')} {entry.actorRole}
                      {entry.actorId != null ? ` #${entry.actorId}` : ''}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
