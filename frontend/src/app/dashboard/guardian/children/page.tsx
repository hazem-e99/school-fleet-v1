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
  gradeLevelsAPI,
  pricingAPI,
  installmentPlansAPI,
  routeAPI,
  routeChangeRequestAPI,
} from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { Child, CreateChildDTO } from '@/types/user';
import type { GradeLevelViewModel } from '@/types/grade';
import type { QuoteViewModel } from '@/types/pricing';
import type { InstallmentPlanViewModel } from '@/types/installment';
import type { RouteChangeRequestViewModel } from '@/types/routeChangeRequest';
import {
  PaymentMethod,
  PaymentChannel,
  type CreatePaymentDTO,
  type SubscriptionPlanViewModel,
} from '@/types/subscription';
import { GraduationCap, MapPin, Plus, Pencil, Trash2, CheckCircle, Route as RouteIcon } from 'lucide-react';

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
  const [grades, setGrades] = useState<GradeLevelViewModel[]>([]);
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
      const [kids, activePlans, schoolList, areaList, gradeList] = await Promise.all([
        childrenAPI.getMyChildren(),
        subscriptionPlansAPI.getActive().catch(() => []),
        schoolsAPI.getActive().catch(() => []),
        preferredAreasAPI.getActive().catch(() => []),
        // Grades are optional for a child, so an empty list must not block the
        // page — same defensive .catch as the other lookups.
        gradeLevelsAPI.getActive().catch(() => []),
      ]);
      setChildren(kids as Child[]);
      setPlans(activePlans as SubscriptionPlanViewModel[]);
      setSchools((schoolList as any[]).map((s) => s.name).filter(Boolean));
      setAreas((areaList as any[]).map((a) => a.name).filter(Boolean));
      setGrades(gradeList as GradeLevelViewModel[]);
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadRouteData();
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
      email: child.email ?? '',
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      gender: (child.gender as any) || undefined,
      gradeLevelId: child.gradeLevelId ?? undefined,
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

  // No price is computed here any more. The server's pricing engine owns every
  // figure — grade-based rules (and, from the next phase, sibling discounts)
  // mean a client-side `price * childCount` would show a number the guardian
  // will not actually be charged.
  const [quote, setQuote] = useState<QuoteViewModel | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  // Instalment schedules offered for the chosen plan. Empty is the normal
  // state until an admin creates one, in which case the selector is hidden
  // entirely rather than shown with a single "pay in full" option.
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlanViewModel[]>([]);
  const [selectedInstallmentPlanId, setSelectedInstallmentPlanId] = useState<string>('');

  // Route change requests. A guardian asks for a ROUTE only; the admin picks
  // the bus at approval, which is why there is no bus picker here — bus
  // occupancy is fleet information guardians have no need to see.
  const [routes, setRoutes] = useState<Array<{ id: number; name: string | null }>>([]);
  const [myRequests, setMyRequests] = useState<RouteChangeRequestViewModel[]>([]);
  const [routeTarget, setRouteTarget] = useState<Child | null>(null);
  const [routeForm, setRouteForm] = useState<{ requestedRouteId: string; reason: string }>({ requestedRouteId: '', reason: '' });
  const [routeSubmitting, setRouteSubmitting] = useState(false);

  const pendingRequestFor = (childId: number) =>
    myRequests.find((r) => r.childId === childId && r.status === 'Pending') ?? null;

  const loadRouteData = async () => {
    try {
      const [routeList, requests] = await Promise.all([
        routeAPI.getAll({ isActive: true }),
        routeChangeRequestAPI.getMyRequests(),
      ]);
      setRoutes(routeList);
      setMyRequests(requests);
    } catch {
      // Non-fatal: the rest of the page works without the route section.
    }
  };

  const openRouteRequest = (child: Child) => {
    setRouteTarget(child);
    setRouteForm({ requestedRouteId: '', reason: '' });
  };

  const submitRouteRequest = async () => {
    if (!routeTarget || !routeForm.requestedRouteId) return;
    setRouteSubmitting(true);
    try {
      const res = await routeChangeRequestAPI.create({
        childId: routeTarget.id,
        requestedRouteId: Number(routeForm.requestedRouteId),
        reason: routeForm.reason.trim() || undefined,
      });
      if (!res?.success) throw new Error(res?.message || 'Failed');
      setRouteTarget(null);
      await loadRouteData();
      showToast({
        type: 'success',
        title: t('pages.guardian.children.requestSent', 'Request sent'),
        message: res.message || '',
      });
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setRouteSubmitting(false);
    }
  };

  const withdrawRequest = async (requestId: number) => {
    try {
      const res = await routeChangeRequestAPI.cancel(requestId);
      if (!res?.success) throw new Error(res?.message || 'Failed');
      await loadRouteData();
      showToast({ type: 'success', title: t('common.done', 'Done'), message: res.message || '' });
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    }
  };

  /** Always re-asks the server; the client never derives an amount itself. */
  const refreshQuote = async (planId: number, installmentPlanId?: number) => {
    setQuoteError('');
    setQuoteLoading(true);
    try {
      const result = await pricingAPI.quote(planId, selectedChildIds, installmentPlanId);
      if (!result) throw new Error('No quote returned');
      setQuote(result);
    } catch (err: unknown) {
      setQuoteError(getApiErrorMessage(err));
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const onInstallmentPlanChange = async (value: string) => {
    setSelectedInstallmentPlanId(value);
    if (selectedPlan) await refreshQuote(selectedPlan.id, value ? Number(value) : undefined);
  };

  const openMethodModal = async (plan: SubscriptionPlanViewModel) => {
    if (selectedChildIds.length === 0) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.guardian.children.pickChild', 'Select at least one child first.') });
      return;
    }
    setSelectedPlan(plan);
    setPaymentRef('');
    setMethodModalOpen(true);

    setQuote(null);
    setQuoteError('');
    setQuoteLoading(true);
    setInstallmentPlans([]);
    setSelectedInstallmentPlanId('');
    try {
      const [result, schedules] = await Promise.all([
        pricingAPI.quote(plan.id, selectedChildIds),
        // A failure here must not block checkout — the guardian can still pay
        // in full, which is what an empty list means.
        installmentPlansAPI.getActive(plan.id).catch(() => []),
      ]);
      if (!result) throw new Error('No quote returned');
      setQuote(result);
      setInstallmentPlans(schedules);
    } catch (err: unknown) {
      // Show the failure rather than a locally invented total: submitting
      // would still price correctly server-side, but the guardian must not be
      // asked to confirm an amount this page made up.
      setQuoteError(getApiErrorMessage(err));
    } finally {
      setQuoteLoading(false);
    }
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
        // Omitted when paying in full: the server treats an absent plan as a
        // one-shot payment, exactly as before instalments existed.
        ...(selectedInstallmentPlanId ? { installmentPlanId: Number(selectedInstallmentPlanId) } : {}),
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
                    {/* Assignment is read-only here by design: a guardian asks,
                        an admin applies. */}
                    <div className="text-sm text-text-secondary flex items-center gap-1">
                      <RouteIcon className="h-4 w-4" />
                      {child.routeName ?? t('pages.guardian.children.noRoute', 'No route assigned')}
                      {child.busNumber && <span className="text-text-muted">· {child.busNumber}</span>}
                    </div>

                    {pendingRequestFor(child.id) ? (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <div>
                          {t('pages.guardian.children.requestPending', 'Awaiting approval to move to')}{' '}
                          <span className="font-medium">{pendingRequestFor(child.id)?.requestedRouteName}</span>
                        </div>
                        <button
                          type="button"
                          className="mt-1 underline"
                          onClick={() => withdrawRequest(pendingRequestFor(child.id)!.id)}
                        >
                          {t('pages.guardian.children.withdrawRequest', 'Withdraw request')}
                        </button>
                      </div>
                    ) : (
                      routes.length > 0 && (
                        <Button
                          variant="outline"
                          className="h-8 rounded-lg w-full"
                          onClick={() => openRouteRequest(child)}
                        >
                          <RouteIcon className="h-3.5 w-3.5 mr-1" />
                          {t('pages.guardian.children.requestRouteChange', 'Request route change')}
                        </Button>
                      )
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
                          {t(
                            'pages.guardian.children.totalAtCheckout',
                            'Your total is confirmed on the next step — it can differ from the list price by grade.',
                          )}
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
          {/* Optional contact address. Sign-in is by phone, so this creates no
              credential, and siblings may share one — it is not unique. */}
          <Input
            type="email"
            placeholder={t('pages.guardian.children.emailOptional', 'Email (optional)')}
            value={form.email ?? ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            maxLength={120}
          />
          <Select value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })}>
            <option value="">{t('pages.auth.register.placeholders.selectSchool', 'Select school')}</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={form.pickupAreaName} onChange={(e) => setForm({ ...form, pickupAreaName: e.target.value })}>
            <option value="">{t('pages.auth.register.placeholders.selectPickupArea', 'Select pickup area')}</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          {grades.length > 0 && (
            <Select
              value={form.gradeLevelId != null ? String(form.gradeLevelId) : ''}
              onChange={(e) =>
                setForm({ ...form, gradeLevelId: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">{t('pages.guardian.children.selectGrade', 'Select grade (optional)')}</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}
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
          {/* Every figure below comes from POST /Pricing/quote. */}
          <div className="rounded-xl border border-border p-3 text-sm">
            <div className="text-text-secondary">
              {selectedPlan?.name} · {selectedChildIds.length}{' '}
              {t('pages.guardian.children.childrenWord', 'child(ren)')}
            </div>

            {quoteLoading ? (
              <div className="mt-2 text-text-muted">{t('pages.guardian.children.pricing', 'Calculating your total...')}</div>
            ) : quoteError ? (
              <div className="mt-2 text-red-600">{quoteError}</div>
            ) : quote ? (
              <>
                <div className="mt-2 space-y-1">
                  {quote.lines.map((line) => (
                    <div key={line.childId} className="flex items-baseline justify-between gap-3">
                      <span className="text-text-secondary">
                        {line.childName}
                        {line.gradeLevelName && (
                          <span className="text-text-muted"> · {line.gradeLevelName}</span>
                        )}
                      </span>
                      <span className="text-text-primary">
                        {line.discountAmount > 0 && (
                          <span className="text-text-muted line-through me-2">
                            {formatCurrency(lang, line.basePrice)}
                          </span>
                        )}
                        {formatCurrency(lang, line.finalPrice)}
                      </span>
                    </div>
                  ))}
                </div>
                {quote.totals.discount > 0 && (
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-green-700">
                    <span>{t('pages.guardian.children.discount', 'Discount')}</span>
                    <span>-{formatCurrency(lang, quote.totals.discount)}</span>
                  </div>
                )}
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2">
                  <span className="font-medium">{t('pages.guardian.children.total', 'Total')}</span>
                  <span className={quote.installment ? 'text-text-secondary' : 'font-semibold text-primary'}>
                    {formatCurrency(lang, quote.totals.final)}
                  </span>
                </div>
                {/* On a schedule the headline figure is what is due NOW, not
                    the full price — the guardian is about to be charged this. */}
                {quote.installment && (
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {t('pages.guardian.children.dueNow', 'Due now')}
                      <span className="text-text-muted font-normal">
                        {' '}({t('pages.guardian.children.firstOf', 'instalment 1 of')} {quote.installment.installmentCount})
                      </span>
                    </span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(lang, quote.installment.amountDueNow)}
                    </span>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Hidden entirely when no schedules are configured, rather than
              shown as a selector with only "pay in full" in it. */}
          {quote && installmentPlans.length > 0 && (
            <div className="rounded-xl border border-border p-3 text-sm">
              <label className="block font-medium mb-1">
                {t('pages.guardian.children.howToPay', 'How would you like to pay?')}
              </label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={selectedInstallmentPlanId}
                onChange={(e) => onInstallmentPlanChange(e.target.value)}
                disabled={quoteLoading}
              >
                <option value="">{t('pages.guardian.children.payInFull', 'Pay in full now')}</option>
                {installmentPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.installmentCount}{' '}
                    {t('pages.guardian.children.installments', 'instalments')}
                  </option>
                ))}
              </select>
              {selectedInstallmentPlanId && (
                <p className="mt-2 text-text-muted text-xs">
                  {t(
                    'pages.guardian.children.installmentNote',
                    'You pay the first instalment now. The remaining schedule is set up for each child once your payment is approved, and you can see it on your subscriptions page.',
                  )}
                </p>
              )}
            </div>
          )}
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
            <Button onClick={submitSubscription} disabled={submitting || quoteLoading || !quote}>
              {submitting ? t('common.submitting', 'Submitting...') : t('pages.guardian.children.submitPayment', 'Submit payment')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!routeTarget}
        onClose={() => setRouteTarget(null)}
        title={t('pages.guardian.children.requestRouteChange', 'Request route change')}
      >
        <div className="space-y-4">
          <div className="text-sm text-text-secondary">
            {routeTarget?.fullName} ·{' '}
            {routeTarget?.routeName ?? t('pages.guardian.children.noRoute', 'No route assigned')}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('pages.guardian.children.moveTo', 'Move to route')}
            </label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={routeForm.requestedRouteId}
              onChange={(e) => setRouteForm({ ...routeForm, requestedRouteId: e.target.value })}
            >
              <option value="">{t('common.select', 'Select...')}</option>
              {routes
                .filter((r) => r.id !== routeTarget?.routeId)
                .map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('pages.guardian.children.requestReason', 'Reason (optional)')}
            </label>
            <textarea
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              rows={3}
              maxLength={500}
              value={routeForm.reason}
              onChange={(e) => setRouteForm({ ...routeForm, reason: e.target.value })}
            />
          </div>

          {/* Set expectations: nothing changes until an admin acts, and they
              choose the bus. */}
          <p className="text-xs text-text-muted">
            {t(
              'pages.guardian.children.requestNote',
              'An administrator will review your request and place your child on a suitable bus for that route. Nothing changes until it is approved.',
            )}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRouteTarget(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={submitRouteRequest} disabled={routeSubmitting || !routeForm.requestedRouteId}>
              {routeSubmitting ? t('common.submitting', 'Submitting...') : t('common.submit', 'Submit')}
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
