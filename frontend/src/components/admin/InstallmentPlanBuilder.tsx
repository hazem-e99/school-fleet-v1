'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff, X, Info, AlertTriangle } from 'lucide-react';
import { installmentPlansAPI, subscriptionPlansAPI, academicTermsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import { InstallmentPlanViewModel, CreateInstallmentPlanDTO, UpdateInstallmentPlanDTO } from '@/types/installment';
import { SubscriptionPlanViewModel } from '@/types/subscription';
import { AcademicTermViewModel } from '@/types/academicTerm';

const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

/** Percentages are compared to 100 with the same tolerance the server uses. */
const PERCENT_TOLERANCE = 0.01;

interface RowForm {
  percentage: string;
  amount: string;
  dueType: string;
  dueDate: string;
  offsetDays: string;
  termDueDateIndex: string;
  gracePeriodDays: string;
}

interface PlanForm {
  name: string;
  allocationType: 'Percentage' | 'Fixed';
  applicablePlanIds: number[];
  activateOnFirstInstallment: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  rows: RowForm[];
}

const emptyRow = (): RowForm => ({
  percentage: '',
  amount: '',
  dueType: 'OffsetDays',
  dueDate: '',
  offsetDays: '0',
  termDueDateIndex: '0',
  gracePeriodDays: '0',
});

const emptyForm = (): PlanForm => ({
  name: '',
  allocationType: 'Percentage',
  applicablePlanIds: [],
  activateOnFirstInstallment: true,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  isActive: true,
  rows: [emptyRow(), emptyRow()],
});

/**
 * Admin builder for instalment schedules.
 *
 * The two things this needs that a plain CRUD panel does not: a repeating-row
 * editor with a live "percentages total 100%" check, and a per-row due-date
 * rule that can be absolute, relative to the purchase, or anchored to an
 * academic term.
 */
export default function InstallmentPlanBuilder() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<InstallmentPlanViewModel[]>([]);
  const [subPlans, setSubPlans] = useState<SubscriptionPlanViewModel[]>([]);
  const [terms, setTerms] = useState<AcademicTermViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<InstallmentPlanViewModel | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const { showToast } = useToast();
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    id?: number;
    action?: 'delete' | 'activate' | 'deactivate';
    title?: string;
    description?: string;
  }>({ open: false });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [planData, subPlanData, termData] = await Promise.all([
        installmentPlansAPI.getAll(),
        subscriptionPlansAPI.getAll(),
        academicTermsAPI.getActive(),
      ]);
      setPlans(planData || []);
      setSubPlans(subPlanData || []);
      setTerms(termData || []);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err);
      setError(message);
      showToast({ type: 'error', title: t('common.error', 'Error'), message });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const percentTotal = useMemo(
    () => form.rows.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0),
    [form.rows],
  );
  const percentagesBalance = Math.abs(percentTotal - 100) <= PERCENT_TOLERANCE;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (plan: InstallmentPlanViewModel) => {
    setEditing(plan);
    setForm({
      name: plan.name || '',
      allocationType: plan.allocationType === 'Fixed' ? 'Fixed' : 'Percentage',
      applicablePlanIds: plan.applicablePlanIds || [],
      activateOnFirstInstallment: plan.activateOnFirstInstallment,
      effectiveFrom: toDateInput(plan.effectiveFrom),
      effectiveTo: toDateInput(plan.effectiveTo),
      isActive: plan.isActive,
      rows: (plan.installments || []).map(row => ({
        percentage: row.percentage != null ? String(row.percentage) : '',
        amount: row.amount != null ? String(row.amount) : '',
        dueType: row.dueRule?.type || 'OffsetDays',
        dueDate: toDateInput(row.dueRule?.date),
        offsetDays: row.dueRule?.offsetDays != null ? String(row.dueRule.offsetDays) : '0',
        termDueDateIndex: row.dueRule?.termDueDateIndex != null ? String(row.dueRule.termDueDateIndex) : '0',
        gracePeriodDays: String(row.gracePeriodDays ?? 0),
      })),
    });
    setShowModal(true);
  };

  const updateRow = (index: number, patch: Partial<RowForm>) => {
    setForm(prev => ({ ...prev, rows: prev.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  };
  const addRow = () => setForm(prev => ({ ...prev, rows: [...prev.rows, emptyRow()] }));
  const removeRow = (index: number) =>
    setForm(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }));

  /** Spreads 100% evenly across the current rows, absorbing rounding in the last. */
  const splitEvenly = () => {
    setForm(prev => {
      const n = prev.rows.length;
      if (!n) return prev;
      const each = Math.floor((100 / n) * 100) / 100;
      const last = Math.round((100 - each * (n - 1)) * 100) / 100;
      return {
        ...prev,
        rows: prev.rows.map((r, i) => ({ ...r, percentage: String(i === n - 1 ? last : each) })),
      };
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.rows.length === 0) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.installments.errors.noRows', 'Add at least one instalment.') });
      return;
    }
    if (form.allocationType === 'Percentage' && !percentagesBalance) {
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: t('pages.admin.installments.errors.percentTotal', 'Instalment percentages must total 100%.'),
      });
      return;
    }
    if (form.effectiveTo && new Date(form.effectiveTo).getTime() <= new Date(form.effectiveFrom).getTime()) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.installments.errors.dateOrder', 'The effective-to date must be after the effective-from date.') });
      return;
    }

    setSaving(true);
    try {
      const payload: CreateInstallmentPlanDTO = {
        name: form.name.trim(),
        applicablePlanIds: form.applicablePlanIds,
        allocationType: form.allocationType,
        installments: form.rows.map((row, i) => ({
          index: i + 1,
          ...(form.allocationType === 'Percentage'
            ? { percentage: parseFloat(row.percentage) || 0 }
            : { amount: parseFloat(row.amount) || 0 }),
          dueRule: {
            type: row.dueType,
            // Each rule type carries only the field it uses; sending the
            // others empty would fail the server's date/number validation.
            ...(row.dueType === 'FixedDate' && row.dueDate
              ? { date: new Date(row.dueDate).toISOString() }
              : {}),
            ...(row.dueType === 'TermDueDate'
              ? { termDueDateIndex: parseInt(row.termDueDateIndex, 10) || 0 }
              : {}),
            ...(row.dueType !== 'FixedDate' ? { offsetDays: parseInt(row.offsetDays, 10) || 0 } : {}),
          },
          gracePeriodDays: parseInt(row.gracePeriodDays, 10) || 0,
        })),
        activateOnFirstInstallment: form.activateOnFirstInstallment,
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        ...(form.effectiveTo ? { effectiveTo: new Date(form.effectiveTo).toISOString() } : {}),
        isActive: form.isActive,
      };

      const response = editing
        ? await installmentPlansAPI.update(editing.id, payload as UpdateInstallmentPlanDTO)
        : await installmentPlansAPI.create(payload);

      if (response.success) {
        await load();
        setShowModal(false);
        showToast({ type: 'success', title: t('common.saved', 'Saved'), message: response.message || '' });
      } else {
        showToast({ type: 'error', title: t('common.error', 'Error'), message: response.message || t('common.saveFailed', 'Save failed') });
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const runConfirmedAction = async () => {
    const { id, action } = confirmState;
    if (!id || !action) return;
    try {
      const response =
        action === 'delete'
          ? await installmentPlansAPI.delete(id)
          : action === 'activate'
            ? await installmentPlansAPI.activate(id)
            : await installmentPlansAPI.deactivate(id);

      if (response.success) {
        await load();
        showToast({ type: 'success', title: t('common.done', 'Done'), message: response.message || '' });
      } else {
        showToast({ type: 'error', title: t('common.error', 'Error'), message: response.message || '' });
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setConfirmState({ open: false });
    }
  };

  const askToggle = (plan: InstallmentPlanViewModel) =>
    setConfirmState({
      open: true,
      id: plan.id,
      action: plan.isActive ? 'deactivate' : 'activate',
      title: plan.isActive
        ? t('pages.admin.installments.confirm.deactivateTitle', 'Deactivate plan')
        : t('pages.admin.installments.confirm.activateTitle', 'Activate plan'),
      description: plan.isActive
        ? t('pages.admin.installments.confirm.deactivateBody', 'It will no longer be offered at checkout. Schedules already agreed are unaffected.')
        : t('pages.admin.installments.confirm.activateBody', 'Guardians will be able to choose this schedule at checkout.'),
    });

  const askDelete = (plan: InstallmentPlanViewModel) =>
    setConfirmState({
      open: true,
      id: plan.id,
      action: 'delete',
      title: t('pages.admin.installments.confirm.deleteTitle', 'Delete instalment plan'),
      description: t('pages.admin.installments.confirm.deleteBody', 'Plans that subscriptions are already paying on cannot be deleted — deactivate them instead.'),
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t('pages.admin.installments.title', 'Instalment plans')}</CardTitle>
          <CardDescription>
            {t(
              'pages.admin.installments.description',
              'Payment schedules a guardian can choose at checkout. Each child gets their own schedule, so a family paying for three children has three.',
            )}
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 me-2" />
          {t('pages.admin.installments.add', 'Add plan')}
        </Button>
      </CardHeader>

      <CardContent>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
        ) : plans.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              {t(
                'pages.admin.installments.empty',
                'No instalment plans yet. Guardians currently pay the full price in one go.',
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.installments.columns.name', 'Plan')}</TableHead>
                  <TableHead>{t('pages.admin.installments.columns.count', 'Instalments')}</TableHead>
                  <TableHead>{t('pages.admin.installments.columns.allocation', 'Split by')}</TableHead>
                  <TableHead>{t('pages.admin.installments.columns.plans', 'Subscription plans')}</TableHead>
                  <TableHead>{t('pages.admin.installments.columns.activation', 'Activates on')}</TableHead>
                  <TableHead>{t('pages.admin.installments.columns.window', 'Effective')}</TableHead>
                  <TableHead>{t('pages.admin.installments.columns.status', 'Status')}</TableHead>
                  <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map(plan => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{plan.installmentCount}</TableCell>
                    <TableCell>{plan.allocationType}</TableCell>
                    <TableCell className="text-sm">
                      {plan.applicablePlanNames.length
                        ? plan.applicablePlanNames.join(', ')
                        : t('pages.admin.installments.allPlans', 'All plans')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {plan.activateOnFirstInstallment
                        ? t('pages.admin.installments.onFirst', 'First payment')
                        : t('pages.admin.installments.onFull', 'Full payment')}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {toDateInput(plan.effectiveFrom) || '—'}
                      {' → '}
                      {toDateInput(plan.effectiveTo) || t('pages.admin.installments.openEnded', 'open')}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${plan.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {plan.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} aria-label={t('common.edit', 'Edit')}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => askToggle(plan)} aria-label={plan.isActive ? t('common.deactivate', 'Deactivate') : t('common.activate', 'Activate')}>
                          {plan.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => askDelete(plan)} aria-label={t('common.delete', 'Delete')}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('pages.admin.installments.editTitle', 'Edit instalment plan') : t('pages.admin.installments.addTitle', 'Add instalment plan')}
        size="lg"
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.installments.fields.name', 'Plan name')}
            </label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.installments.fields.allocation', 'Split instalments by')}
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.allocationType}
                onChange={e => setForm({ ...form, allocationType: e.target.value as 'Percentage' | 'Fixed' })}
              >
                <option value="Percentage">{t('pages.admin.installments.percentage', 'Percentage')}</option>
                <option value="Fixed">{t('pages.admin.installments.fixed', 'Fixed amounts')}</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {form.allocationType === 'Percentage'
                  ? t('pages.admin.installments.hints.percentage', 'Percentages must total 100%.')
                  : t('pages.admin.installments.hints.fixed', 'The last instalment takes whatever remains, since each child’s price differs by grade and discount.')}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.installments.fields.activation', 'Activate the subscription on')}
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.activateOnFirstInstallment ? 'first' : 'full'}
                onChange={e => setForm({ ...form, activateOnFirstInstallment: e.target.value === 'first' })}
              >
                <option value="first">{t('pages.admin.installments.onFirst', 'First payment')}</option>
                <option value="full">{t('pages.admin.installments.onFull', 'Full payment')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.installments.fields.plans', 'Offered for')}
            </label>
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2">
              {subPlans.map(plan => (
                <label key={plan.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.applicablePlanIds.includes(plan.id)}
                    onChange={() => setForm(prev => ({
                      ...prev,
                      applicablePlanIds: prev.applicablePlanIds.includes(plan.id)
                        ? prev.applicablePlanIds.filter(x => x !== plan.id)
                        : [...prev.applicablePlanIds, plan.id],
                    }))}
                  />
                  {plan.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t('pages.admin.installments.hints.plans', 'Leave all unticked to offer this schedule for every plan.')}
            </p>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">
                {t('pages.admin.installments.fields.rows', 'Instalments')}
              </label>
              <div className="flex gap-2">
                {form.allocationType === 'Percentage' && (
                  <Button type="button" variant="outline" size="sm" onClick={splitEvenly}>
                    {t('pages.admin.installments.splitEvenly', 'Split evenly')}
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-3 w-3 me-1" />
                  {t('pages.admin.installments.addRow', 'Add instalment')}
                </Button>
              </div>
            </div>

            {/* Live total, so the admin sees the 100% rule being met or missed
                as they type rather than on a failed save. */}
            {form.allocationType === 'Percentage' && (
              <div
                className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  percentagesBalance ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {!percentagesBalance && <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
                {t('pages.admin.installments.percentTotal', 'Total')}: {percentTotal.toFixed(2)}%
                {!percentagesBalance && ` — ${t('pages.admin.installments.mustBe100', 'must be 100%')}`}
              </div>
            )}

            <div className="space-y-3">
              {form.rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t('pages.admin.installments.rowLabel', 'Instalment')} {i + 1}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)} aria-label={t('common.remove', 'Remove')}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        {form.allocationType === 'Percentage'
                          ? t('pages.admin.installments.fields.percent', 'Percentage')
                          : t('pages.admin.installments.fields.amount', 'Amount')}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.allocationType === 'Percentage' ? row.percentage : row.amount}
                        onChange={e =>
                          updateRow(i, form.allocationType === 'Percentage'
                            ? { percentage: e.target.value }
                            : { amount: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        {t('pages.admin.installments.fields.dueType', 'Due date')}
                      </label>
                      <select
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={row.dueType}
                        onChange={e => updateRow(i, { dueType: e.target.value })}
                      >
                        <option value="OffsetDays">{t('pages.admin.installments.due.offset', 'Days after purchase')}</option>
                        <option value="FixedDate">{t('pages.admin.installments.due.fixed', 'A fixed date')}</option>
                        <option value="TermStartOffset">{t('pages.admin.installments.due.termStart', 'Days after term starts')}</option>
                        <option value="TermDueDate">{t('pages.admin.installments.due.termDue', 'A term payment date')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-gray-600">
                        {t('pages.admin.installments.fields.grace', 'Grace days')}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={row.gracePeriodDays}
                        onChange={e => updateRow(i, { gracePeriodDays: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    {row.dueType === 'FixedDate' && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-600">
                          {t('pages.admin.installments.fields.date', 'Date')}
                        </label>
                        <Input type="date" value={row.dueDate} onChange={e => updateRow(i, { dueDate: e.target.value })} />
                      </div>
                    )}

                    {(row.dueType === 'OffsetDays' || row.dueType === 'TermStartOffset') && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-600">
                          {t('pages.admin.installments.fields.offsetDays', 'Days')}
                        </label>
                        <Input
                          type="number"
                          step="1"
                          value={row.offsetDays}
                          onChange={e => updateRow(i, { offsetDays: e.target.value })}
                        />
                      </div>
                    )}

                    {row.dueType === 'TermDueDate' && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-600">
                          {t('pages.admin.installments.fields.termDueDateIndex', 'Which term payment date')}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={row.termDueDateIndex}
                          onChange={e => updateRow(i, { termDueDateIndex: e.target.value })}
                        />
                        {/* Terms carry their own list of payment dates; this
                            picks one by position, so moving a deadline is an
                            edit of the term rather than of every plan. */}
                        <p className="mt-1 text-xs text-gray-500">
                          {terms.length
                            ? `${t('pages.admin.installments.hints.termDue', 'Position in the term’s payment dates, starting at 0.')} ${terms[0]?.name ?? ''}: ${(terms[0]?.dueDateRules || []).map(d => d.label).join(', ') || t('pages.admin.installments.noTermDates', 'no dates configured')}`
                            : t('pages.admin.installments.hints.noTerms', 'No academic terms are configured yet — this will fall back to days after purchase.')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.installments.fields.effectiveFrom', 'Effective from')}
              </label>
              <Input type="date" value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.installments.fields.effectiveTo', 'Effective to (optional)')}
              </label>
              <Input type="date" value={form.effectiveTo} onChange={e => setForm({ ...form, effectiveTo: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            {t('common.active', 'Active')}
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto">
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title || ''}
        description={confirmState.description}
        onCancel={() => setConfirmState({ open: false })}
        onConfirm={runConfirmedAction}
      />
    </Card>
  );
}
