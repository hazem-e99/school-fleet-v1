'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff, Info } from 'lucide-react';
import { pricingRulesAPI, subscriptionPlansAPI, gradeGroupsAPI, academicTermsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import { formatCurrency } from '@/lib/format';
import { PricingRuleViewModel, CreatePricingRuleDTO, UpdatePricingRuleDTO } from '@/types/pricing';
import { SubscriptionPlanViewModel } from '@/types/subscription';
import { GradeGroupViewModel } from '@/types/grade';
import { AcademicTermViewModel } from '@/types/academicTerm';

const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

/** Terms only apply to these plan tiers; Monthly plans stay rolling. */
const planUsesTerm = (type: string | null | undefined) => type === 'Term' || type === 'Annual';

interface RuleForm {
  name: string;
  subscriptionPlanId: string;
  gradeGroupId: string;
  academicTermId: string;
  price: string;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
}

const emptyForm: RuleForm = {
  name: '',
  subscriptionPlanId: '',
  gradeGroupId: '',
  academicTermId: '',
  price: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  isActive: true,
};

/**
 * Admin CRUD for the pricing matrix.
 *
 * A rule OVERRIDES a plan's price for one grade group over one date window.
 * Where no rule matches, the plan's own price still applies — so this table
 * starting empty is the normal state, not a misconfiguration, and the panel
 * says so rather than showing a bare "no data" row.
 */
export default function PricingRulesPanel() {
  const { t, lang } = useI18n();
  const [rules, setRules] = useState<PricingRuleViewModel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanViewModel[]>([]);
  const [groups, setGroups] = useState<GradeGroupViewModel[]>([]);
  const [terms, setTerms] = useState<AcademicTermViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PricingRuleViewModel | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
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
      const [ruleData, planData, groupData, termData] = await Promise.all([
        pricingRulesAPI.getAll(),
        subscriptionPlansAPI.getAll(),
        gradeGroupsAPI.getActive(),
        academicTermsAPI.getActive(),
      ]);
      setRules(ruleData || []);
      setPlans(planData || []);
      setGroups(groupData || []);
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

  const selectedPlan = useMemo(
    () => plans.find(p => String(p.id) === form.subscriptionPlanId) ?? null,
    [plans, form.subscriptionPlanId],
  );
  const termsAllowed = planUsesTerm(selectedPlan?.subscriptionType);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (rule: PricingRuleViewModel) => {
    setEditing(rule);
    setForm({
      name: rule.name || '',
      subscriptionPlanId: String(rule.subscriptionPlanId),
      gradeGroupId: rule.gradeGroupId != null ? String(rule.gradeGroupId) : '',
      academicTermId: rule.academicTermId != null ? String(rule.academicTermId) : '',
      price: String(rule.price ?? ''),
      effectiveFrom: toDateInput(rule.effectiveFrom),
      effectiveTo: toDateInput(rule.effectiveTo),
      isActive: rule.isActive,
    });
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.subscriptionPlanId) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.pricing.errors.planRequired', 'Choose a subscription plan.') });
      return;
    }
    if (form.effectiveTo && new Date(form.effectiveTo).getTime() <= new Date(form.effectiveFrom).getTime()) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.pricing.errors.dateOrder', 'The effective-to date must be after the effective-from date.') });
      return;
    }

    setSaving(true);
    try {
      // Optional ids are omitted rather than sent empty: the server's
      // validation pipe rejects unknown/blank fields outright, and an absent
      // gradeGroupId is what "all grades" means.
      const payload = {
        name: form.name.trim(),
        subscriptionPlanId: Number(form.subscriptionPlanId),
        ...(form.gradeGroupId ? { gradeGroupId: Number(form.gradeGroupId) } : {}),
        ...(termsAllowed && form.academicTermId ? { academicTermId: Number(form.academicTermId) } : {}),
        price: Number(form.price),
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        ...(form.effectiveTo ? { effectiveTo: new Date(form.effectiveTo).toISOString() } : {}),
        isActive: form.isActive,
      };

      const response = editing
        ? await pricingRulesAPI.update(editing.id, payload as UpdatePricingRuleDTO)
        : await pricingRulesAPI.create(payload as CreatePricingRuleDTO);

      if (response.success) {
        await load();
        setShowModal(false);
        showToast({
          type: 'success',
          title: t('common.saved', 'Saved'),
          message: response.message || t('pages.admin.pricing.toasts.saved', 'Pricing rule saved.'),
        });
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
          ? await pricingRulesAPI.delete(id)
          : action === 'activate'
            ? await pricingRulesAPI.activate(id)
            : await pricingRulesAPI.deactivate(id);

      if (response.success) {
        await load();
        showToast({ type: 'success', title: t('common.done', 'Done'), message: response.message || '' });
      } else {
        showToast({ type: 'error', title: t('common.error', 'Error'), message: response.message || '' });
      }
    } catch (err: unknown) {
      // A referenced rule returns 409 with a message telling the admin to
      // deactivate instead — surface it verbatim rather than a generic failure.
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setConfirmState({ open: false });
    }
  };

  const askDelete = (rule: PricingRuleViewModel) =>
    setConfirmState({
      open: true,
      id: rule.id,
      action: 'delete',
      title: t('pages.admin.pricing.confirm.deleteTitle', 'Delete pricing rule'),
      description: t(
        'pages.admin.pricing.confirm.deleteBody',
        'Rules that have already priced a subscription cannot be deleted — deactivate them instead.',
      ),
    });

  const askToggle = (rule: PricingRuleViewModel) =>
    setConfirmState({
      open: true,
      id: rule.id,
      action: rule.isActive ? 'deactivate' : 'activate',
      title: rule.isActive
        ? t('pages.admin.pricing.confirm.deactivateTitle', 'Deactivate pricing rule')
        : t('pages.admin.pricing.confirm.activateTitle', 'Activate pricing rule'),
      description: rule.isActive
        ? t('pages.admin.pricing.confirm.deactivateBody', 'New subscriptions will fall back to the plan price. Existing subscriptions keep the price they were sold at.')
        : t('pages.admin.pricing.confirm.activateBody', 'This rule will start pricing new subscriptions inside its date window.'),
    });

  const money = (amount: number | null | undefined) => formatCurrency(lang, amount ?? 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t('pages.admin.pricing.title', 'Pricing rules')}</CardTitle>
          <CardDescription>
            {t(
              'pages.admin.pricing.description',
              'Override a plan’s price for a grade group over a date window. Where no rule matches, the plan’s own price is charged.',
            )}
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 me-2" />
          {t('pages.admin.pricing.add', 'Add rule')}
        </Button>
      </CardHeader>

      <CardContent>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
        ) : rules.length === 0 ? (
          // An empty matrix is a valid state, so say what happens rather than
          // showing a bare "no data" row that reads like something is broken.
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              {t(
                'pages.admin.pricing.empty',
                'No pricing rules yet. Every plan is currently sold at its own price. Add a rule to charge a different price for a particular grade group or term.',
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.pricing.columns.name', 'Rule')}</TableHead>
                  <TableHead>{t('pages.admin.pricing.columns.plan', 'Plan')}</TableHead>
                  <TableHead>{t('pages.admin.pricing.columns.gradeGroup', 'Grade group')}</TableHead>
                  <TableHead>{t('pages.admin.pricing.columns.term', 'Term')}</TableHead>
                  <TableHead>{t('pages.admin.pricing.columns.price', 'Price')}</TableHead>
                  <TableHead>{t('pages.admin.pricing.columns.window', 'Effective')}</TableHead>
                  <TableHead>{t('pages.admin.pricing.columns.status', 'Status')}</TableHead>
                  <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <span>{rule.subscriptionPlanName ?? '—'}</span>
                      {rule.subscriptionType && (
                        <span className="ms-2 text-xs text-gray-500">{rule.subscriptionType}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {rule.gradeGroupName ?? (
                        <span className="text-gray-500">{t('pages.admin.pricing.allGrades', 'All grades')}</span>
                      )}
                    </TableCell>
                    <TableCell>{rule.academicTermName ?? '—'}</TableCell>
                    <TableCell>
                      <span className="font-medium">{money(rule.price)}</span>
                      {rule.planPrice != null && rule.planPrice !== rule.price && (
                        <span className="ms-2 text-xs text-gray-500 line-through">{money(rule.planPrice)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {toDateInput(rule.effectiveFrom) || '—'}
                      {' → '}
                      {toDateInput(rule.effectiveTo) || t('pages.admin.pricing.openEnded', 'open')}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          rule.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {rule.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(rule)} aria-label={t('common.edit', 'Edit')}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => askToggle(rule)} aria-label={rule.isActive ? t('common.deactivate', 'Deactivate') : t('common.activate', 'Activate')}>
                          {rule.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => askDelete(rule)} aria-label={t('common.delete', 'Delete')}>
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
        title={editing ? t('pages.admin.pricing.editTitle', 'Edit pricing rule') : t('pages.admin.pricing.addTitle', 'Add pricing rule')}
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.pricing.fields.name', 'Rule name')}
            </label>
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.pricing.fields.plan', 'Subscription plan')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.subscriptionPlanId}
              onChange={e => setForm({ ...form, subscriptionPlanId: e.target.value, academicTermId: '' })}
              required
            >
              <option value="">{t('common.select', 'Select...')}</option>
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {plan.subscriptionType} · {money(plan.price)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.pricing.fields.gradeGroup', 'Grade group')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={form.gradeGroupId}
              onChange={e => setForm({ ...form, gradeGroupId: e.target.value })}
            >
              <option value="">{t('pages.admin.pricing.allGrades', 'All grades')}</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {t('pages.admin.pricing.hints.gradeGroup', 'A rule for a specific grade group takes precedence over an all-grades rule.')}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.pricing.fields.term', 'Academic term')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
              value={form.academicTermId}
              onChange={e => setForm({ ...form, academicTermId: e.target.value })}
              disabled={!termsAllowed}
            >
              <option value="">{t('pages.admin.pricing.noTerm', 'None — use the plan’s duration')}</option>
              {terms.map(term => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {termsAllowed
                ? t('pages.admin.pricing.hints.term', 'The subscription will run for the term’s real dates instead of a day count.')
                : t('pages.admin.pricing.hints.termMonthly', 'Terms apply to Term and Annual plans only. Monthly plans stay rolling.')}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.pricing.fields.price', 'Price')}
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={e => setForm({ ...form, price: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.pricing.fields.effectiveFrom', 'Effective from')}
              </label>
              <Input
                type="date"
                value={form.effectiveFrom}
                onChange={e => setForm({ ...form, effectiveFrom: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.pricing.fields.effectiveTo', 'Effective to (optional)')}
              </label>
              <Input
                type="date"
                value={form.effectiveTo}
                onChange={e => setForm({ ...form, effectiveTo: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm({ ...form, isActive: e.target.checked })}
            />
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
