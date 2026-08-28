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
import { studentSubscriptionAPI } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { StudentSubscriptionViewModel } from '@/types/subscription';

export default function GuardianSubscriptionsPage() {
  const { t, lang } = useI18n();
  const { showToast } = useToast();

  const [subs, setSubs] = useState<StudentSubscriptionViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<StudentSubscriptionViewModel | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
                <div key={s.id} className="rounded-xl border border-border p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-text-primary">{s.childName || s.studentName}</div>
                    <div className="text-sm text-text-secondary">
                      {s.subscriptionPlanName} · {formatCurrency(lang, s.subscriptionPlanPrice)} ·{' '}
                      {t('pages.guardian.subscriptions.until', 'until')}{' '}
                      {s.endDate ? new Date(s.endDate).toLocaleDateString() : '—'}
                    </div>
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
