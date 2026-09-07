'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { gradeGroupsAPI, gradeLevelsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  GradeGroupViewModel,
  CreateGradeGroupDTO,
  UpdateGradeGroupDTO,
  GradeLevelViewModel,
} from '@/types/grade';

/**
 * Admin CRUD for grade groups — the pricing bands ("KG1 → Grade 2") that
 * pricing rules attach to.
 *
 * Membership is stored as an explicit list of grade ids rather than a
 * min/max range, so non-contiguous groups are possible and reordering grades
 * later cannot silently move children between price bands. The from/to range
 * picker below is only an input convenience: it expands into that list on
 * apply, and the checkboxes remain the source of truth.
 */
export default function GradeGroupsPanel() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<GradeGroupViewModel[]>([]);
  const [grades, setGrades] = useState<GradeLevelViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<GradeGroupViewModel | null>(null);
  const [form, setForm] = useState<CreateGradeGroupDTO>({ name: '', gradeLevelIds: [], isActive: true });
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
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
      // Both are needed to render the table (group -> grade names) and the
      // form; a failure in either should surface rather than half-render.
      const [groupData, gradeData] = await Promise.all([
        gradeGroupsAPI.getAll(),
        gradeLevelsAPI.getActive(),
      ]);
      setGroups(groupData || []);
      setGrades(gradeData || []);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err);
      setError(errorMessage);
      showToast({
        type: 'error',
        title: t('pages.admin.gradeGroups.errors.loadFailedTitle', 'Load Failed'),
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', gradeLevelIds: [], isActive: true });
    setRangeFrom('');
    setRangeTo('');
    setShowModal(true);
  };

  const openEdit = async (group: GradeGroupViewModel) => {
    try {
      const fetched = await gradeGroupsAPI.getById(group.id);
      if (fetched) {
        setEditing(fetched);
        setForm({
          name: fetched.name || '',
          gradeLevelIds: fetched.gradeLevelIds || [],
          isActive: fetched.isActive,
        });
        setRangeFrom('');
        setRangeTo('');
        setShowModal(true);
      } else {
        showToast({
          type: 'error',
          title: t('common.error', 'Error'),
          message: t('pages.admin.gradeGroups.errors.loadDetails', 'Failed to load group details'),
        });
      }
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    }
  };

  const toggleGrade = (id: number) => {
    setForm(prev => ({
      ...prev,
      gradeLevelIds: prev.gradeLevelIds.includes(id)
        ? prev.gradeLevelIds.filter(x => x !== id)
        : [...prev.gradeLevelIds, id],
    }));
  };

  /** Expands the from/to pickers into the explicit id list, by grade order. */
  const applyRange = () => {
    const from = grades.find(g => String(g.id) === rangeFrom);
    const to = grades.find(g => String(g.id) === rangeTo);
    if (!from || !to) return;
    const lo = Math.min(from.order ?? 0, to.order ?? 0);
    const hi = Math.max(from.order ?? 0, to.order ?? 0);
    const ids = grades.filter(g => (g.order ?? 0) >= lo && (g.order ?? 0) <= hi).map(g => g.id);
    setForm(prev => ({ ...prev, gradeLevelIds: [...new Set([...prev.gradeLevelIds, ...ids])] }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.gradeLevelIds.length === 0) {
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: t('pages.admin.gradeGroups.errors.noGrades', 'Select at least one grade for this group.'),
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        gradeLevelIds: form.gradeLevelIds,
        isActive: form.isActive,
      };
      const response = editing
        ? await gradeGroupsAPI.update(editing.id, payload as UpdateGradeGroupDTO)
        : await gradeGroupsAPI.create(payload as CreateGradeGroupDTO);

      if (response.success) {
        await load();
        showToast({
          type: 'success',
          title: editing
            ? t('pages.admin.gradeGroups.toasts.updatedTitle', 'Group Updated')
            : t('pages.admin.gradeGroups.toasts.createdTitle', 'Group Created'),
          message: `${payload.name} ${t('pages.admin.gradeGroups.toasts.savedSuccessfully', 'has been saved successfully')}`,
        });
        setShowModal(false);
      } else {
        throw new Error(response.message || t('pages.admin.gradeGroups.errors.saveFailedMsg', 'Failed to save group'));
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: t('pages.admin.gradeGroups.errors.saveFailedTitle', 'Save Failed'),
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
          response = await gradeGroupsAPI.delete(confirmState.id);
          successMessage = t('pages.admin.gradeGroups.toasts.deleted', 'Group deleted successfully');
          break;
        case 'activate':
          response = await gradeGroupsAPI.activate(confirmState.id);
          successMessage = t('pages.admin.gradeGroups.toasts.activated', 'Group activated successfully');
          break;
        case 'deactivate':
          response = await gradeGroupsAPI.deactivate(confirmState.id);
          successMessage = t('pages.admin.gradeGroups.toasts.deactivated', 'Group deactivated successfully');
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

  if (loading) {
    return <div className="p-6">{t('common.loading', 'Loading...')}</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t('pages.admin.gradeGroups.title', 'Grade Groups')}</h1>
          <p className="text-gray-600">
            {t('pages.admin.gradeGroups.subtitle', 'Group grades into pricing bands, e.g. "KG1 to Grade 2".')}
          </p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto" disabled={grades.length === 0}>
          <Plus className="w-4 h-4 mr-2" />{t('pages.admin.gradeGroups.addButton', 'Add Group')}
        </Button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      {grades.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded">
          {t('pages.admin.gradeGroups.needGrades', 'Add some grades first — a group is a set of grades.')}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('pages.admin.gradeGroups.listTitle', 'Grade Groups')}</CardTitle>
          <CardDescription>{groups.length} {t('pages.admin.gradeGroups.listCountLabel', 'group(s)')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[640px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.gradeGroups.table.name', 'Name')}</TableHead>
                  <TableHead>{t('pages.admin.gradeGroups.table.grades', 'Grades')}</TableHead>
                  <TableHead>{t('pages.admin.gradeGroups.table.status', 'Status')}</TableHead>
                  <TableHead>{t('pages.admin.gradeGroups.table.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      {t('pages.admin.gradeGroups.empty', 'No grade groups yet.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map(group => (
                    <TableRow key={group.id} className={group.isActive ? 'bg-green-50' : 'bg-red-50'}>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {group.gradeLevelNames?.length
                          ? group.gradeLevelNames.join(', ')
                          : `${group.gradeCount} ${t('pages.admin.gradeGroups.table.gradesCount', 'grade(s)')}`}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          group.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {group.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(group)} title={t('common.edit', 'Edit')}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {group.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              title={t('common.deactivate', 'Deactivate')}
                              onClick={() => setConfirmState({
                                open: true,
                                id: group.id,
                                action: 'deactivate',
                                title: t('pages.admin.gradeGroups.confirms.deactivateTitle', 'Deactivate Group'),
                                description: t('pages.admin.gradeGroups.confirms.deactivateDesc', 'Deactivate this group? Pricing rules using it will stop matching new subscriptions.'),
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
                                id: group.id,
                                action: 'activate',
                                title: t('pages.admin.gradeGroups.confirms.activateTitle', 'Activate Group'),
                                description: t('pages.admin.gradeGroups.confirms.activateDesc', 'Activate this group?'),
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
                              id: group.id,
                              action: 'delete',
                              title: t('pages.admin.gradeGroups.confirms.deleteTitle', 'Delete Group'),
                              description: t('pages.admin.gradeGroups.confirms.deleteDesc', 'Delete this grade group? Deactivate it instead if it has been used for pricing.'),
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
        title={editing ? t('pages.admin.gradeGroups.modal.editTitle', 'Edit Group') : t('pages.admin.gradeGroups.modal.addTitle', 'Add Group')}
        size="lg"
      >
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl border bg-sky-50/60 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.gradeGroups.form.name', 'Name')} *
              </label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={100}
                placeholder={t('pages.admin.gradeGroups.form.namePlaceholder', 'e.g. KG1 to Grade 2')}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-emerald-50/60 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.gradeGroups.form.grades', 'Grades in this group')} *
              </label>
              <p className="text-xs text-gray-500 mb-3">
                {t('pages.admin.gradeGroups.form.gradesHint', 'Pick a range to fill quickly, then fine-tune with the checkboxes.')}
              </p>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Select value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="w-full sm:w-auto">
                  <option value="">{t('pages.admin.gradeGroups.form.from', 'From...')}</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
                <Select value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="w-full sm:w-auto">
                  <option value="">{t('pages.admin.gradeGroups.form.to', 'To...')}</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyRange}
                  disabled={!rangeFrom || !rangeTo}
                  className="w-full sm:w-auto"
                >
                  {t('pages.admin.gradeGroups.form.addRange', 'Add range')}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {grades.map(grade => (
                  <label
                    key={grade.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.gradeLevelIds.includes(grade.id)}
                      onChange={() => toggleGrade(grade.id)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{grade.name}</span>
                  </label>
                ))}
              </div>

              <p className="text-xs text-gray-600 mt-2">
                {form.gradeLevelIds.length} {t('pages.admin.gradeGroups.form.selected', 'selected')}
              </p>
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
                  : t('pages.admin.gradeGroups.form.createItem', 'Create Group')}
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
