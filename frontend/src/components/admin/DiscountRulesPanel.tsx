'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff, Info } from 'lucide-react';
import { discountRulesAPI, subscriptionPlansAPI, gradeGroupsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import { formatCurrency } from '@/lib/format';
import { DiscountRuleViewModel, CreateDiscountRuleDTO, UpdateDiscountRuleDTO } from '@/types/discount';
import { SubscriptionPlanViewModel } from '@/types/subscription';
import { GradeGroupViewModel } from '@/types/grade';

const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

interface RuleForm {
  name: string;
  discountType: 'Fixed' | 'Percentage';
  value: string;
  startingSiblingPosition: string;
  maxDiscountAmount: string;
  applicablePlanIds: number[];
  applicableGradeGroupIds: number[];
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
}

const emptyForm: RuleForm = {
  name: '',
  discountType: 'Percentage',
  value: '',
  startingSiblingPosition: '2',
  maxDiscountAmount: '',
  applicablePlanIds: [],
  applicableGradeGroupIds: [],
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  isActive: true,
};

/**
 * Admin CRUD for sibling discounts.
 *
 * Family rank is decided server-side and is permanent: a child who has ever
 * held a paid subscription keeps their position, so an expired subscription
 * never costs a younger sibling their discount. The eldest always pays full
 * price, which is why the starting position cannot be set below 2.
 */
export default function DiscountRulesPanel() {
  const { t, lang } = useI18n();
  const [rules, setRules] = useState<DiscountRuleViewModel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanViewModel[]>([]);
  const [groups, setGroups] = useState<GradeGroupViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<DiscountRuleViewModel | null>(null);
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
      const [ruleData, planData, groupData] = await Promise.all([
        discountRulesAPI.getAll(),
        subscriptionPlansAPI.getAll(),
        gradeGroupsAPI.getActive(),
      ]);
      setRules(ruleData || []);
      setPlans(planData || []);
      setGroups(groupData || []);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err);
      setError(message);
      showToast({ type: 'error', title: t('common.error', 'Error'), message });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (rule: DiscountRuleViewModel) => {
    setEditing(rule);
    setForm({
      name: rule.name || '',
      discountType: rule.discountType === 'Fixed' ? 'Fixed' : 'Percentage',
      value: String(rule.value ?? ''),
      startingSiblingPosition: String(rule.startingSiblingPosition ?? 2),
      maxDiscountAmount: rule.maxDiscountAmount != null ? String(rule.maxDiscountAmount) : '',
      applicablePlanIds: rule.applicablePlanIds || [],
      applicableGradeGroupIds: rule.applicableGradeGroupIds || [],
      effectiveFrom: toDateInput(rule.effectiveFrom),
      effectiveTo: toDateInput(rule.effectiveTo),
      isActive: rule.isActive,
    });
    setShowModal(true);
  };

  const toggleId = (field: 'applicablePlanIds' | 'applicableGradeGroupIds', id: number) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(id) ? prev[field].filter(x => x !== id) : [...prev[field], id],
    }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.discountType === 'Percentage' && Number(form.value) > 100) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.discounts.errors.percentMax', 'A percentage discount cannot exceed 100%.') });
      return;
    }
    if (Number(form.startingSiblingPosition) < 2) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.discounts.errors.startingPosition', 'The eldest child always pays full price, so the discount must start at position 2 or later.') });
      return;
    }
    if (form.effectiveTo && new Date(form.effectiveTo).getTime() <= new Date(form.effectiveFrom).getTime()) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: t('pages.admin.discounts.errors.dateOrder', 'The effective-to date must be after the effective-from date.') });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        discountType: form.discountType,
        value: Number(form.value),
        startingSiblingPosition: Number(form.startingSiblingPosition),
        // Sent only when set: an empty cap means "no ceiling", and a blank
        // string would fail number validation on the server.
        ...(form.maxDiscountAmount !== '' ? { maxDiscountAmount: Number(form.maxDiscountAmount) } : {}),
        applicablePlanIds: form.applicablePlanIds,
        applicableGradeGroupIds: form.applicableGradeGroupIds,
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        ...(form.effectiveTo ? { effectiveTo: new Date(form.effectiveTo).toISOString() } : {}),
        isActive: form.isActive,
      };

      const response = editing
        ? await discountRulesAPI.update(editing.id, payload as UpdateDiscountRuleDTO)
        : await discountRulesAPI.create(payload as CreateDiscountRuleDTO);

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
          ? await discountRulesAPI.delete(id)
          : action === 'activate'
            ? await discountRulesAPI.activate(id)
            : await discountRulesAPI.deactivate(id);

      if (response.success) {
        await load();
        showToast({ type: 'success', title: t('common.done', 'Done'), message: response.message || '' });
      } else {
        showToast({ type: 'error', title: t('common.error', 'Error'), message: response.message || '' });
      }
    } catch (err: unknown) {
      // A rule that has already discounted a subscription 409s with a message
      // telling the admin to deactivate it — show it verbatim.
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setConfirmState({ open: false });
    }
  };

  const describeValue = (rule: DiscountRuleViewModel) =>
    rule.discountType === 'Percentage' ? `${rule.value}%` : formatCurrency(lang, rule.value);

  const describeScope = (names: string[]) =>
    names.length ? names.join(', ') : t('pages.admin.discounts.all', 'All');

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t('pages.admin.discounts.title', 'Sibling discounts')}</CardTitle>
          <CardDescription>
            {t(
              'pages.admin.discounts.description',
              'Discount the second and later children in a family. Rank is based on enrolment order and is permanent — an expired subscription never costs a younger sibling their discount.',
            )}
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 me-2" />
          {t('pages.admin.discounts.add', 'Add discount')}
        </Button>
      </CardHeader>

      <CardContent>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
        ) : rules.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              {t(
                'pages.admin.discounts.empty',
                'No sibling discounts yet. Every child is currently charged the full price for their plan and grade.',
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.discounts.columns.name', 'Rule')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.value', 'Discount')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.from', 'Applies from child')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.cap', 'Cap')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.plans', 'Plans')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.groups', 'Grade groups')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.window', 'Effective')}</TableHead>
                  <TableHead>{t('pages.admin.discounts.columns.status', 'Status')}</TableHead>
                  <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{describeValue(rule)}</TableCell>
                    <TableCell>#{rule.startingSiblingPosition}</TableCell>
                    <TableCell>
                      {rule.maxDiscountAmount != null ? formatCurrency(lang, rule.maxDiscountAmount) : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{describeScope(rule.applicablePlanNames)}</TableCell>
                    <TableCell className="text-sm">{describeScope(rule.applicableGradeGroupNames)}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {toDateInput(rule.effectiveFrom) || '—'}
                      {' → '}
                      {toDateInput(rule.effectiveTo) || t('pages.admin.discounts.openEnded', 'open')}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${rule.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {rule.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(rule)} aria-label={t('common.edit', 'Edit')}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmState({
                            open: true,
                            id: rule.id,
                            action: rule.isActive ? 'deactivate' : 'activate',
                            title: rule.isActive
                              ? t('pages.admin.discounts.confirm.deactivateTitle', 'Deactivate discount')
                              : t('pages.admin.discounts.confirm.activateTitle', 'Activate discount'),
                            description: rule.isActive
                              ? t('pages.admin.discounts.confirm.deactivateBody', 'New subscriptions will be charged full price. Existing subscriptions keep the discount they were sold with.')
                              : t('pages.admin.discounts.confirm.activateBody', 'This discount will apply to new subscriptions inside its date window.'),
                          })}
                          aria-label={rule.isActive ? t('common.deactivate', 'Deactivate') : t('common.activate', 'Activate')}
                        >
                          {rule.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmState({
                            open: true,
                            id: rule.id,
                            action: 'delete',
                            title: t('pages.admin.discounts.confirm.deleteTitle', 'Delete discount rule'),
                            description: t('pages.admin.discounts.confirm.deleteBody', 'Rules that have already discounted a subscription cannot be deleted — deactivate them instead.'),
                          })}
                          aria-label={t('common.delete', 'Delete')}
                        >
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
        title={editing ? t('pages.admin.discounts.editTitle', 'Edit discount') : t('pages.admin.discounts.addTitle', 'Add discount')}
      >
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.discounts.fields.name', 'Rule name')}
            </label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.discounts.fields.type', 'Discount type')}
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.discountType}
                onChange={e => setForm({ ...form, discountType: e.target.value as 'Fixed' | 'Percentage' })}
              >
                <option value="Percentage">{t('pages.admin.discounts.percentage', 'Percentage')}</option>
                <option value="Fixed">{t('pages.admin.discounts.fixed', 'Fixed amount')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {form.discountType === 'Percentage'
                  ? t('pages.admin.discounts.fields.percent', 'Percentage (0-100)')
                  : t('pages.admin.discounts.fields.amount', 'Amount')}
              </label>
              <Input
                type="number"
                min="0"
                max={form.discountType === 'Percentage' ? '100' : undefined}
                step="0.01"
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.discounts.fields.startingPosition', 'Applies from child number')}
              </label>
              <Input
                type="number"
                min="2"
                step="1"
                value={form.startingSiblingPosition}
                onChange={e => setForm({ ...form, startingSiblingPosition: e.target.value })}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                {t('pages.admin.discounts.hints.startingPosition', 'The eldest child in a family always pays full price.')}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.discounts.fields.cap', 'Maximum discount (optional)')}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.maxDiscountAmount}
                onChange={e => setForm({ ...form, maxDiscountAmount: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.discounts.fields.plans', 'Plans')}
            </label>
            {/* Nothing ticked means every plan - stated rather than implied,
                since an empty multi-select otherwise reads as "none". */}
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2">
              {plans.map(plan => (
                <label key={plan.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.applicablePlanIds.includes(plan.id)}
                    onChange={() => toggleId('applicablePlanIds', plan.id)}
                  />
                  {plan.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t('pages.admin.discounts.hints.plans', 'Leave all unticked to apply to every plan.')}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t('pages.admin.discounts.fields.groups', 'Grade groups')}
            </label>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2">
              {groups.map(group => (
                <label key={group.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.applicableGradeGroupIds.includes(group.id)}
                    onChange={() => toggleId('applicableGradeGroupIds', group.id)}
                  />
                  {group.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t('pages.admin.discounts.hints.groups', 'Leave all unticked to apply to every grade, including children with no grade set.')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.discounts.fields.effectiveFrom', 'Effective from')}
              </label>
              <Input type="date" value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.discounts.fields.effectiveTo', 'Effective to (optional)')}
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
