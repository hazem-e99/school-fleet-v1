'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/contexts/LanguageContext';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  childrenAPI,
  schoolsAPI,
  preferredAreasAPI,
  subscriptionPlansAPI,
  paymentAPI,
} from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { Child, CreateChildDTO } from '@/types/user';
import {
  PaymentMethod,
  PaymentChannel,
  type CreatePaymentDTO,
  type SubscriptionPlanViewModel,
} from '@/types/subscription';
import { GraduationCap, MapPin, Plus, Pencil, Trash2, CheckCircle } from 'lucide-react';

const emptyForm: CreateChildDTO = {
  name: '',
  schoolName: '',
  pickupAreaName: '',
};

export default function GuardianChildrenPage() {
  const { t, lang } = useI18n();
  const { showToast } = useToast();

  const [children, setChildren] = useState<Child[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanViewModel[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // add / edit child modal
  const [childModalOpen, setChildModalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [form, setForm] = useState<CreateChildDTO>(emptyForm);
  const [savingChild, setSavingChild] = useState(false);

  // remove confirm
  const [removeTarget, setRemoveTarget] = useState<Child | null>(null);

  // subscribe flow
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanViewModel | null>(null);
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [onlineChannel, setOnlineChannel] = useState<'instapay' | 'vodafone'>('instapay');
  const [offlineChannel, setOfflineChannel] = useState<'cash' | 'visa'>('cash');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.Online);
  const [paymentRef, setPaymentRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [kids, activePlans, schoolList, areaList] = await Promise.all([
        childrenAPI.getMyChildren(),
        subscriptionPlansAPI.getActive().catch(() => []),
        schoolsAPI.getActive().catch(() => []),
        preferredAreasAPI.getActive().catch(() => []),
      ]);
      setChildren(kids as Child[]);
      setPlans(activePlans as SubscriptionPlanViewModel[]);
      setSchools((schoolList as any[]).map((s) => s.name).filter(Boolean));
      setAreas((areaList as any[]).map((a) => a.name).filter(Boolean));
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

  const subscribableChildren = useMemo(
    () => children.filter((c) => !c.activeSubscription),
    [children],
  );

  const openAdd = () => {
    setEditingChild(null);
    setForm(emptyForm);
    setChildModalOpen(true);
  };
  const openEdit = (child: Child) => {
    setEditingChild(child);
    setForm({
      name: child.name,
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      gender: (child.gender as any) || undefined,
    });
    setChildModalOpen(true);
  };

  const saveChild = async () => {
    if (!form.name.trim() || form.name.trim().length < 2 || !form.schoolName || !form.pickupAreaName) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.guardian.children.fillAll', 'Please fill in all fields.') });
      return;
    }
    setSavingChild(true);
    try {
      if (editingChild) {
        await childrenAPI.update(editingChild.id, form as any);
        showToast({ type: 'success', title: t('common.success', 'Success'), message: t('pages.guardian.children.updated', 'Child updated.') });
      } else {
        await childrenAPI.create(form as any);
        showToast({ type: 'success', title: t('common.success', 'Success'), message: t('pages.guardian.children.added', 'Child added.') });
      }
      setChildModalOpen(false);
      await load();
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setSavingChild(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await childrenAPI.remove(removeTarget.id);
      showToast({ type: 'success', title: t('common.success', 'Success'), message: t('pages.guardian.children.removed', 'Child removed.') });
      setRemoveTarget(null);
      await load();
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    }
  };

  const toggleChild = (id: number) => {
    setSelectedChildIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleAll = () => {
    const ids = subscribableChildren.map((c) => c.id);
    setSelectedChildIds((prev) => (prev.length === ids.length ? [] : ids));
  };

  const total = selectedPlan ? (selectedPlan.price || 0) * selectedChildIds.length : 0;

  const openMethodModal = (plan: SubscriptionPlanViewModel) => {
    if (selectedChildIds.length === 0) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.guardian.children.pickChild', 'Select at least one child first.') });
      return;
    }
    setSelectedPlan(plan);
    setPaymentRef('');
    setMethodModalOpen(true);
  };

  const submitSubscription = async () => {
    if (!selectedPlan) return;
    if (paymentMethod === PaymentMethod.Online && onlineChannel === 'instapay' && paymentRef.trim().length < 3) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.student.subscription.refMin', 'Payment reference code must be at least 3 characters long') });
      return;
    }
    setSubmitting(true);
    try {
      const resolvedChannel: PaymentChannel =
        paymentMethod === PaymentMethod.Online
          ? (onlineChannel === 'vodafone' ? PaymentChannel.Vodafone : PaymentChannel.InstaPay)
          : (offlineChannel === 'visa' ? PaymentChannel.Visa : PaymentChannel.Cash);

      const payload: CreatePaymentDTO = {
        subscriptionPlanId: selectedPlan.id,
        childIds: selectedChildIds,
        paymentMethod,
        paymentChannel: resolvedChannel,
        paymentReferenceCode:
          paymentMethod === PaymentMethod.Online && onlineChannel === 'instapay' ? paymentRef.trim() : null,
      };
      const res = await paymentAPI.create(payload);
      if (!res?.success) throw new Error(res?.message || 'Failed');

      showToast({
        type: 'success',
        title: t('common.success', 'Success'),
        message: t('pages.guardian.children.paymentSubmitted', 'Payment submitted — pending admin approval.'),
      });
      setMethodModalOpen(false);
      setSelectedChildIds([]);
      setSelectedPlan(null);
      await load();
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 sm:p-6">{t('common.loading', 'Loading...')}</div>;

  return (
    <div className="p-4 sm:p-6 space-y-8">
      {/* Children list */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('pages.guardian.children.title', 'My Children')}</CardTitle>
            <Button onClick={openAdd} className="h-9 rounded-lg">
              <Plus className="h-4 w-4 mr-1" />
              {t('pages.guardian.children.add', 'Add child')}
            </Button>
          </CardHeader>
          <CardContent>
            {children.length === 0 ? (
              <p className="text-text-secondary text-sm py-6 text-center">
                {t('pages.guardian.children.empty', 'No children yet. Add your first child to get started.')}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {children.map((child) => (
                  <div key={child.id} className="rounded-2xl border border-border p-4 space-y-3 bg-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-text-primary">{child.fullName}</div>
                        <div className="text-sm text-text-secondary flex items-center gap-1 mt-1">
                          <GraduationCap className="h-4 w-4" /> {child.schoolName}
                        </div>
                        <div className="text-sm text-text-secondary flex items-center gap-1">
                          <MapPin className="h-4 w-4" /> {child.pickupAreaName}
                        </div>
                      </div>
                      {child.activeSubscription ? (
                        <Badge variant="default">{t('pages.guardian.children.subscribed', 'Subscribed')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('pages.guardian.children.noPlan', 'No plan')}</Badge>
                      )}
                    </div>
                    {child.activeSubscription && (
                      <div className="text-xs text-text-muted">
                        {child.activeSubscription.subscriptionPlanName} ·{' '}
                        {t('pages.guardian.children.until', 'until')}{' '}
                        {child.activeSubscription.endDate
                          ? new Date(child.activeSubscription.endDate).toLocaleDateString()
                          : '—'}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="h-8 rounded-lg flex-1" onClick={() => openEdit(child)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> {t('common.edit', 'Edit')}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 rounded-lg text-red-600 hover:text-red-700"
                        onClick={() => setRemoveTarget(child)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Subscribe section */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle>{t('pages.guardian.children.subscribeTitle', 'Subscribe children to a plan')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {subscribableChildren.length === 0 ? (
              <p className="text-text-secondary text-sm">
                {t('pages.guardian.children.allSubscribed', 'All your children already have an active subscription.')}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t('pages.guardian.children.selectChildren', 'Select children')}
                    </span>
                    <button className="text-xs text-primary hover:underline" onClick={toggleAll} type="button">
                      {selectedChildIds.length === subscribableChildren.length
                        ? t('common.clear', 'Clear')
                        : t('pages.guardian.children.selectAll', 'Select all')}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {subscribableChildren.map((child) => (
                      <label
                        key={child.id}
                        className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer text-sm ${
                          selectedChildIds.includes(child.id) ? 'border-primary bg-primary-light' : 'border-border'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedChildIds.includes(child.id)}
                          onChange={() => toggleChild(child.id)}
                        />
                        <span>{child.fullName}</span>
                        <span className="text-text-muted">· {child.schoolName}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plans.map((plan) => (
                    <div key={plan.id} className="rounded-2xl border border-border p-4 flex flex-col">
                      <div className="font-semibold text-text-primary">{plan.name}</div>
                      <div className="text-sm text-text-secondary mt-1 flex-1">{plan.description}</div>
                      <div className="mt-3 text-lg font-bold text-primary">
                        {formatCurrency(lang, plan.price)}{' '}
                        <span className="text-xs font-normal text-text-muted">
                          / {plan.durationInDays} {t('pages.guardian.children.days', 'days')} · {t('pages.guardian.children.perChild', 'per child')}
                        </span>
                      </div>
                      {selectedChildIds.length > 0 && (
                        <div className="text-sm text-text-secondary mt-1">
                          {t('pages.guardian.children.total', 'Total')}: {formatCurrency(lang, (plan.price || 0) * selectedChildIds.length)}{' '}
                          ({selectedChildIds.length} × {formatCurrency(lang, plan.price)})
                        </div>
                      )}
                      <Button className="mt-3 h-9 rounded-lg" onClick={() => openMethodModal(plan)}>
                        {t('pages.guardian.children.choosePlan', 'Choose this plan')}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Add / edit child modal */}
      <Modal
        isOpen={childModalOpen}
        onClose={() => setChildModalOpen(false)}
        title={editingChild ? t('pages.guardian.children.editChild', 'Edit child') : t('pages.guardian.children.add', 'Add child')}
        size="lg"
      >
        <div className="space-y-3">
          <Input placeholder={t('pages.auth.register.fields.childName', 'Child Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={2} maxLength={60} />
          <Select value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })}>
            <option value="">{t('pages.auth.register.placeholders.selectSchool', 'Select school')}</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={form.pickupAreaName} onChange={(e) => setForm({ ...form, pickupAreaName: e.target.value })}>
            <option value="">{t('pages.auth.register.placeholders.selectPickupArea', 'Select pickup area')}</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setChildModalOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={saveChild} disabled={savingChild}>
              {savingChild ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment method modal */}
      <Modal
        isOpen={methodModalOpen}
        onClose={() => setMethodModalOpen(false)}
        title={t('pages.student.subscription.choosePaymentMethod', 'Choose a payment method')}
        size="lg"
      >
        <div className="space-y-4">
          <div className="text-sm text-text-secondary">
            {selectedPlan?.name} · {selectedChildIds.length} {t('pages.guardian.children.childrenWord', 'child(ren)')} ·{' '}
            <span className="font-semibold text-primary">{formatCurrency(lang, total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['online-instapay', PaymentMethod.Online, 'instapay', 'InstaPay'],
              ['online-vodafone', PaymentMethod.Online, 'vodafone', 'Vodafone Cash'],
              ['offline-cash', PaymentMethod.Offline, 'cash', t('pages.student.subscription.methodOffline', 'Cash')],
              ['offline-visa', PaymentMethod.Offline, 'visa', 'Visa'],
            ] as const).map(([key, method, channel, label]) => {
              const active =
                paymentMethod === method &&
                (method === PaymentMethod.Online ? onlineChannel === channel : offlineChannel === channel);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(method);
                    if (method === PaymentMethod.Online) setOnlineChannel(channel as 'instapay' | 'vodafone');
                    else setOfflineChannel(channel as 'cash' | 'visa');
                  }}
                  className={`rounded-xl border p-3 text-sm text-left ${active ? 'border-primary bg-primary-light' : 'border-border'}`}
                >
                  {active && <CheckCircle className="h-4 w-4 text-primary inline mr-1" />}
                  {label}
                </button>
              );
            })}
          </div>

          {paymentMethod === PaymentMethod.Online && onlineChannel === 'instapay' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('pages.student.subscription.refRequired', 'Payment reference code')} *
              </label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} minLength={3} />
              <p className="text-xs text-text-muted mt-1">{t('pages.student.subscription.refMin', 'At least 3 characters')}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setMethodModalOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={submitSubscription} disabled={submitting}>
              {submitting ? t('common.submitting', 'Submitting...') : t('pages.guardian.children.submitPayment', 'Submit payment')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        title={t('pages.guardian.children.removeTitle', 'Remove child?')}
        description={t('pages.guardian.children.removeDesc', 'This will deactivate the child and cancel any active subscription.')}
        confirmText={t('common.remove', 'Remove')}
        cancelText={t('common.cancel', 'Cancel')}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
