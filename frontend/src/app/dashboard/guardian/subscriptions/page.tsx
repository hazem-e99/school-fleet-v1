'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/contexts/LanguageContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { studentSubscriptionAPI, installmentsAPI } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { StudentSubscriptionViewModel } from '@/types/subscription';
import type { StudentInstallmentViewModel } from '@/types/installment';

export default function GuardianSubscriptionsPage() {
  const { t, lang } = useI18n();
  const { showToast } = useToast();

  const [subs, setSubs] = useState<StudentSubscriptionViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<StudentSubscriptionViewModel | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Schedules are fetched only for the subscription the guardian expands —
  // loading every schedule up front would be N requests for data most people
  // never open.
  const [openSchedule, setOpenSchedule] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<StudentInstallmentViewModel[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const toggleSchedule = async (subscriptionId: number) => {
    if (openSchedule === subscriptionId) {
      setOpenSchedule(null);
      return;
    }
    setOpenSchedule(subscriptionId);
    setSchedule([]);
    setScheduleLoading(true);
    try {
      setSchedule(await installmentsAPI.forSubscription(subscriptionId));
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
      setOpenSchedule(null);
    } finally {
      setScheduleLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await studentSubscriptionAPI.getChildrenSubscriptions();
      setSubs(data);
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCancellation = async () => {
    if (!cancelTarget || reason.trim().length < 3) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.student.subscription.cancel.reasonMin', 'Please give a reason (at least 3 characters).') });
      return;
    }
    setSubmitting(true);
    try {
      await studentSubscriptionAPI.requestCancellation({
        childId: Number(cancelTarget.childId ?? cancelTarget.studentId),
        reason: reason.trim(),
      });
      showToast({ type: 'success', title: t('common.success', 'Success'), message: t('pages.student.subscription.cancel.submitted', 'Cancellation request submitted.') });
      setCancelTarget(null);
      setReason('');
      await load();
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 sm:p-6">{t('common.loading', 'Loading...')}</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('pages.guardian.subscriptions.title', 'Children Subscriptions')}</CardTitle>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <p className="text-text-secondary text-sm py-6 text-center">
              {t('pages.guardian.subscriptions.empty', 'No subscriptions yet.')}
            </p>
          ) : (
            <div className="space-y-3">
              {subs.map((s) => (
                <div key={s.id} className="rounded-xl border border-border p-4">
                 <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-text-primary">{s.childName || s.studentName}</div>
                    <div className="text-sm text-text-secondary">
                      {/* The price shown is the one frozen at purchase, so a
                          later plan-price change never rewrites this row. */}
                      {s.subscriptionPlanName} · {formatCurrency(lang, s.subscriptionPlanPrice)} ·{' '}
                      {t('pages.guardian.subscriptions.until', 'until')}{' '}
                      {s.endDate ? new Date(s.endDate).toLocaleDateString() : '—'}
                    </div>
                    {(s.gradeLevelName || s.termName || (s.discountAmount ?? 0) > 0) && (
                      <div className="text-xs text-text-muted mt-0.5">
                        {s.gradeLevelName}
                        {s.gradeLevelName && s.termName ? ' · ' : ''}
                        {s.termName}
                        {(s.discountAmount ?? 0) > 0 && (
                          <span className="text-green-700">
                            {(s.gradeLevelName || s.termName) ? ' · ' : ''}
                            {t('pages.guardian.subscriptions.discountApplied', 'Discount')}{' '}
                            -{formatCurrency(lang, s.discountAmount ?? 0)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === 'Active' ? 'default' : 'secondary'}>{s.status}</Badge>
                    {s.cancellationStatus === 'Pending' ? (
                      <Badge variant="outline">{t('pages.guardian.subscriptions.cancelPending', 'Cancellation pending')}</Badge>
                    ) : (
                      s.status === 'Active' && (
                        <Button variant="outline" className="h-8 rounded-lg" onClick={() => setCancelTarget(s)}>
                          {t('pages.guardian.subscriptions.requestCancel', 'Request cancellation')}
                        </Button>
                      )
                    )}
                  </div>
                 </div>

                 {/* Instalment state, shown only for a subscription that has a
                     schedule. paidAmount / remaining / nextDue are rolled up
                     server-side from the rows, never computed here. */}
                 {s.paymentState && (
                   <div className="mt-3 border-t border-border pt-3 text-sm">
                     <div className="flex flex-wrap items-center justify-between gap-2">
                       <div className="flex flex-wrap items-center gap-3">
                         <Badge variant={s.paymentState === 'Overdue' ? 'destructive' : s.paymentState === 'Paid' ? 'default' : 'secondary'}>
                           {t(`pages.guardian.subscriptions.paymentState.${s.paymentState.toLowerCase()}`, s.paymentState)}
                         </Badge>
                         <span className="text-text-secondary">
                           {t('pages.guardian.subscriptions.paid', 'Paid')}: {formatCurrency(lang, s.paidAmount ?? 0)}
                           {(s.remainingAmount ?? 0) > 0 && (
                             <>
                               {' · '}
                               {t('pages.guardian.subscriptions.remaining', 'Remaining')}:{' '}
                               {formatCurrency(lang, s.remainingAmount ?? 0)}
                             </>
                           )}
                         </span>
                         {s.nextDueDate && (
                           <span className="text-text-secondary">
                             {t('pages.guardian.subscriptions.nextDue', 'Next due')}:{' '}
                             {new Date(s.nextDueDate).toLocaleDateString()}
                           </span>
                         )}
                       </div>
                       <Button variant="outline" className="h-8 rounded-lg" onClick={() => toggleSchedule(s.id)}>
                         {openSchedule === s.id
                           ? t('pages.guardian.subscriptions.hideSchedule', 'Hide schedule')
                           : t('pages.guardian.subscriptions.showSchedule', 'View schedule')}
                       </Button>
                     </div>

                     {openSchedule === s.id && (
                       <div className="mt-3 space-y-1">
                         {scheduleLoading ? (
                           <p className="text-text-muted">{t('common.loading', 'Loading...')}</p>
                         ) : schedule.length === 0 ? (
                           <p className="text-text-muted">
                             {t('pages.guardian.subscriptions.noSchedule', 'No instalments recorded for this subscription.')}
                           </p>
                         ) : (
                           schedule.map((row) => (
                             <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2">
                               <span className="text-text-secondary">
                                 {t('pages.guardian.subscriptions.installment', 'Instalment')} {row.index}
                                 {' · '}
                                 {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}
                               </span>
                               <span className="flex items-center gap-2">
                                 <span>{formatCurrency(lang, row.amount)}</span>
                                 <Badge variant={row.isOverdue ? 'destructive' : row.status === 'Paid' ? 'default' : 'secondary'}>
                                   {t(`pages.guardian.subscriptions.installmentStatus.${String(row.status).toLowerCase()}`, row.status)}
                                 </Badge>
                               </span>
                             </div>
                           ))
                         )}
                       </div>
                     )}
                   </div>
                 )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={t('pages.guardian.subscriptions.requestCancel', 'Request cancellation')}
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {cancelTarget?.childName || cancelTarget?.studentName} — {cancelTarget?.subscriptionPlanName}
          </p>
          <label className="block text-sm font-medium">{t('pages.student.subscription.cancel.reason', 'Reason')}</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={submitCancellation} disabled={submitting}>
              {submitting ? t('common.submitting', 'Submitting...') : t('common.submit', 'Submit')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
