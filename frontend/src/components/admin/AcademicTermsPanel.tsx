'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff, X } from 'lucide-react';
import { academicTermsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  AcademicTermViewModel,
  CreateAcademicTermDTO,
  UpdateAcademicTermDTO,
  TermDueDate,
} from '@/types/academicTerm';

/** `<input type="date">` needs YYYY-MM-DD; the API returns full ISO strings. */
const toDateInput = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '');

/**
 * Admin CRUD for the academic calendar.
 *
 * Terms apply to Term and Annual subscription plans only — Monthly plans stay
 * rolling on their duration in days and never bind to a term. The due dates
 * configured here are what installment schedules anchor to, so moving a
 * deadline for everyone is an edit here rather than an edit of every plan.
 */
export default function AcademicTermsPanel() {
  const { t } = useI18n();
  const [terms, setTerms] = useState<AcademicTermViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AcademicTermViewModel | null>(null);
  const [form, setForm] = useState<{
    name: string;
    startDate: string;
    endDate: string;
    paymentDueDate: string;
    dueDateRules: TermDueDate[];
    isActive: boolean;
  }>({ name: '', startDate: '', endDate: '', paymentDueDate: '', dueDateRules: [], isActive: true });
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
      const data = await academicTermsAPI.getAll();
      setTerms(data || []);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err);
      setError(errorMessage);
      showToast({
        type: 'error',
        title: t('pages.admin.terms.errors.loadFailedTitle', 'Load Failed'),
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', startDate: '', endDate: '', paymentDueDate: '', dueDateRules: [], isActive: true });
    setShowModal(true);
  };

  const openEdit = async (term: AcademicTermViewModel) => {
    try {
      const fetched = await academicTermsAPI.getById(term.id);
      if (fetched) {
        setEditing(fetched);
        setForm({
          name: fetched.name || '',
          startDate: toDateInput(fetched.startDate),
          endDate: toDateInput(fetched.endDate),
          paymentDueDate: toDateInput(fetched.paymentDueDate),
          dueDateRules: (fetched.dueDateRules || []).map(d => ({ label: d.label, date: toDateInput(d.date) })),
          isActive: fetched.isActive,
        });
        setShowModal(true);
      } else {
        showToast({
          type: 'error',
          title: t('common.error', 'Error'),
          message: t('pages.admin.terms.errors.loadDetails', 'Failed to load term details'),
        });
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    }
  };

  const addDueDate = () => {
    setForm(prev => ({ ...prev, dueDateRules: [...prev.dueDateRules, { label: '', date: '' }] }));
  };

  const updateDueDate = (index: number, patch: Partial<TermDueDate>) => {
    setForm(prev => ({
      ...prev,
      dueDateRules: prev.dueDateRules.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  };

  const removeDueDate = (index: number) => {
    setForm(prev => ({ ...prev, dueDateRules: prev.dueDateRules.filter((_, i) => i !== index) }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    // Checked here as well as on the server so the admin gets the message
    // inline rather than as a toast after a round-trip.
    if (new Date(form.endDate).getTime() <= new Date(form.startDate).getTime()) {
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: t('pages.admin.terms.errors.dateOrder', 'The end date must be after the start date.'),
      });
      return;
    }

    const incompleteRule = form.dueDateRules.find(d => !d.label.trim() || !d.date);
    if (incompleteRule) {
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: t('pages.admin.terms.errors.incompleteDueDate', 'Every payment date needs both a label and a date.'),
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        // Omit rather than send an empty string — the field is optional and a
        // blank value would fail date validation on the server.
        ...(form.paymentDueDate ? { paymentDueDate: new Date(form.paymentDueDate).toISOString() } : {}),
        dueDateRules: form.dueDateRules.map(d => ({
          label: d.label.trim(),
          date: new Date(d.date).toISOString(),
        })),
        isActive: form.isActive,
      };

      const response = editing
        ? await academicTermsAPI.update(editing.id, payload as UpdateAcademicTermDTO)
        : await academicTermsAPI.create(payload as CreateAcademicTermDTO);

      if (response.success) {
        await load();
        showToast({
          type: 'success',
          title: editing
            ? t('pages.admin.terms.toasts.updatedTitle', 'Term Updated')
            : t('pages.admin.terms.toasts.createdTitle', 'Term Created'),
          message: `${payload.name} ${t('pages.admin.terms.toasts.savedSuccessfully', 'has been saved successfully')}`,
        });
        setShowModal(false);
      } else {
        throw new Error(response.message || t('pages.admin.terms.errors.saveFailedMsg', 'Failed to save term'));
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: t('pages.admin.terms.errors.saveFailedTitle', 'Save Failed'),
        message: getApiErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState.id || !confirmState.action) return;
    try {
      let response;
      let successMessage = '';
      switch (confirmState.action) {
        case 'delete':
          response = await academicTermsAPI.delete(confirmState.id);
          successMessage = t('pages.admin.terms.toasts.deleted', 'Term deleted successfully');
          break;
        case 'activate':
          response = await academicTermsAPI.activate(confirmState.id);
          successMessage = t('pages.admin.terms.toasts.activated', 'Term activated successfully');
          break;
        case 'deactivate':
          response = await academicTermsAPI.deactivate(confirmState.id);
          successMessage = t('pages.admin.terms.toasts.deactivated', 'Term deactivated successfully');
          break;
      }
      if (response.success) {
        await load();
        showToast({ type: 'success', title: t('common.success', 'Success'), message: successMessage });
      } else {
        throw new Error(response.message || t('common.actionFailed', 'Action failed'));
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.actionFailed', 'Action Failed'), message: getApiErrorMessage(err) });
    } finally {
      setConfirmState({ open: false });
    }
  };

  const formatRange = (term: AcademicTermViewModel) => {
    const start = toDateInput(term.startDate);
    const end = toDateInput(term.endDate);
    return start && end ? `${start} → ${end}` : '—';
  };

  if (loading) {
    return <div className="p-6">{t('common.loading', 'Loading...')}</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('pages.admin.terms.title', 'Academic Terms')}</h1>
          <p className="text-gray-600">
            {t('pages.admin.terms.subtitle', 'Term dates and payment deadlines. Used by Term and Annual plans — monthly plans stay rolling.')}
          </p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />{t('pages.admin.terms.addButton', 'Add Term')}
        </Button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>{t('pages.admin.terms.listTitle', 'Academic Terms')}</CardTitle>
          <CardDescription>{terms.length} {t('pages.admin.terms.listCountLabel', 'term(s)')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[720px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.terms.table.name', 'Name')}</TableHead>
                  <TableHead>{t('pages.admin.terms.table.dates', 'Dates')}</TableHead>
                  <TableHead>{t('pages.admin.terms.table.paymentDue', 'Payment due')}</TableHead>
                  <TableHead>{t('pages.admin.terms.table.instalmentDates', 'Instalment dates')}</TableHead>
                  <TableHead>{t('pages.admin.terms.table.status', 'Status')}</TableHead>
                  <TableHead>{t('pages.admin.terms.table.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      {t('pages.admin.terms.empty', 'No terms yet. Term and Annual plans fall back to their duration in days until a term is defined.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  terms.map(term => (
                    <TableRow key={term.id} className={term.isActive ? 'bg-green-50' : 'bg-red-50'}>
                      <TableCell className="font-medium">{term.name}</TableCell>
                      <TableCell className="text-sm">{formatRange(term)}</TableCell>
                      <TableCell className="text-sm">{toDateInput(term.paymentDueDate) || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {term.dueDateRules?.length
                          ? term.dueDateRules.map(d => `${d.label} (${toDateInput(d.date)})`).join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          term.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {term.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(term)} title={t('common.edit', 'Edit')}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {term.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              title={t('common.deactivate', 'Deactivate')}
                              onClick={() => setConfirmState({
                                open: true,
                                id: term.id,
                                action: 'deactivate',
                                title: t('pages.admin.terms.confirms.deactivateTitle', 'Deactivate Term'),
                                description: t('pages.admin.terms.confirms.deactivateDesc', 'Deactivate this term? New subscriptions will stop using its dates.'),
                              })}
                            >
                              <PowerOff className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              title={t('common.activate', 'Activate')}
                              onClick={() => setConfirmState({
                                open: true,
                                id: term.id,
                                action: 'activate',
                                title: t('pages.admin.terms.confirms.activateTitle', 'Activate Term'),
                                description: t('pages.admin.terms.confirms.activateDesc', 'Activate this term?'),
                              })}
                            >
                              <Power className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            title={t('common.delete', 'Delete')}
                            onClick={() => setConfirmState({
                              open: true,
                              id: term.id,
                              action: 'delete',
                              title: t('pages.admin.terms.confirms.deleteTitle', 'Delete Term'),
                              description: t('pages.admin.terms.confirms.deleteDesc', 'Delete this term? Deactivate it instead once subscriptions have used it.'),
                            })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('pages.admin.terms.modal.editTitle', 'Edit Term') : t('pages.admin.terms.modal.addTitle', 'Add Term')}
        size="lg"
      >
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl border bg-sky-50/60 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.terms.form.name', 'Name')} *
              </label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={100}
                placeholder={t('pages.admin.terms.form.namePlaceholder', 'e.g. Autumn Term 2026/27')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pages.admin.terms.form.startDate', 'Start date')} *
                </label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pages.admin.terms.form.endDate', 'End date')} *
                </label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-emerald-50/60 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.terms.form.paymentDueDate', 'Default payment due date')}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {t('pages.admin.terms.form.paymentDueDateHint', 'Optional. Used when a plan does not define its own instalment dates.')}
              </p>
              <Input
                type="date"
                value={form.paymentDueDate}
                onChange={e => setForm({ ...form, paymentDueDate: e.target.value })}
              />
            </div>

            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {t('pages.admin.terms.form.instalmentDates', 'Instalment dates')}
                  </label>
                  <p className="text-xs text-gray-500">
                    {t('pages.admin.terms.form.instalmentDatesHint', 'Optional. Instalment plans can anchor to these, so moving a deadline here moves it for everyone.')}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addDueDate} className="w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-1" />{t('pages.admin.terms.form.addDueDate', 'Add date')}
                </Button>
              </div>

              <div className="space-y-2">
                {form.dueDateRules.map((rule, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <Input
                      value={rule.label}
                      onChange={e => updateDueDate(index, { label: e.target.value })}
                      maxLength={60}
                      placeholder={t('pages.admin.terms.form.dueDateLabel', 'e.g. First instalment')}
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      value={rule.date}
                      onChange={e => updateDueDate(index, { date: e.target.value })}
                      className="w-full sm:w-48"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeDueDate(index)}
                      title={t('common.remove', 'Remove')}
                      className="w-full sm:w-auto"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto" disabled={saving}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
              {saving
                ? t('common.saving', 'Saving...')
                : editing
                  ? t('common.saveChanges', 'Save Changes')
                  : t('pages.admin.terms.form.createItem', 'Create Term')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmState.open}
        onCancel={() => setConfirmState({ open: false })}
        onConfirm={handleConfirmAction}
        title={confirmState.title || t('common.confirmTitle', 'Confirm Action')}
        description={confirmState.description || t('common.confirmDesc', 'Are you sure?')}
      />
    </div>
  );
}
