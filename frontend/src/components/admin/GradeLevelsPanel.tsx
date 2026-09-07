'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { gradeLevelsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/apiError';
import { GradeLevelViewModel, CreateGradeLevelDTO, UpdateGradeLevelDTO } from '@/types/grade';

/**
 * Admin CRUD for the grade catalog (KG1, Grade 1, ...). Follows the same shape
 * as SchoolsPanel / PreferredAreasPanel, with one addition: `order`, because
 * grade names do not sort correctly alphabetically ("Grade 10" would come
 * before "Grade 2") and pricing bands are defined as grade ranges.
 */
export default function GradeLevelsPanel() {
  const { t } = useI18n();
  const [grades, setGrades] = useState<GradeLevelViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<GradeLevelViewModel | null>(null);
  const [form, setForm] = useState<CreateGradeLevelDTO>({ name: '', order: 0, isActive: true });
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
      const data = await gradeLevelsAPI.getAll();
      setGrades(data || []);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err);
      setError(errorMessage);
      showToast({
        type: 'error',
        title: t('pages.admin.grades.errors.loadFailedTitle', 'Load Failed'),
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    // Default the new grade to the end of the list so grades added later keep
    // their intended order without the admin having to think about it.
    const nextOrder = grades.length ? Math.max(...grades.map(g => g.order ?? 0)) + 1 : 0;
    setForm({ name: '', order: nextOrder, isActive: true });
    setShowModal(true);
  };

  const openEdit = async (grade: GradeLevelViewModel) => {
    try {
      const fetched = await gradeLevelsAPI.getById(grade.id);
      if (fetched) {
        setEditing(fetched);
        setForm({ name: fetched.name || '', order: fetched.order ?? 0, isActive: fetched.isActive });
        setShowModal(true);
      } else {
        showToast({
          type: 'error',
          title: t('common.error', 'Error'),
          message: t('pages.admin.grades.errors.loadDetails', 'Failed to load grade details'),
        });
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: getApiErrorMessage(err),
      });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), order: Number(form.order) || 0, isActive: form.isActive };
      const response = editing
        ? await gradeLevelsAPI.update(editing.id, payload as UpdateGradeLevelDTO)
        : await gradeLevelsAPI.create(payload as CreateGradeLevelDTO);

      if (response.success) {
        await load();
        showToast({
          type: 'success',
          title: editing
            ? t('pages.admin.grades.toasts.updatedTitle', 'Grade Updated')
            : t('pages.admin.grades.toasts.createdTitle', 'Grade Created'),
          message: `${payload.name} ${t('pages.admin.grades.toasts.savedSuccessfully', 'has been saved successfully')}`,
        });
        setShowModal(false);
      } else {
        throw new Error(response.message || t('pages.admin.grades.errors.saveFailedMsg', 'Failed to save grade'));
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: t('pages.admin.grades.errors.saveFailedTitle', 'Save Failed'),
        message: getApiErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmState({
      open: true,
      id,
      action: 'delete',
      title: t('pages.admin.grades.confirms.deleteTitle', 'Delete Grade'),
      // The backend refuses the delete with a 409 when a student or grade
      // group still references it, so say so up front.
      description: t(
        'pages.admin.grades.confirms.deleteDesc',
        'Delete this grade? This is only possible while no student and no grade group uses it — otherwise deactivate it instead.',
      ),
    });
  };

  const handleActivate = (id: number) => {
    setConfirmState({
      open: true,
      id,
      action: 'activate',
      title: t('pages.admin.grades.confirms.activateTitle', 'Activate Grade'),
      description: t('pages.admin.grades.confirms.activateDesc', 'Activate this grade? It will appear again when choosing a student\'s grade.'),
    });
  };

  const handleDeactivate = (id: number) => {
    setConfirmState({
      open: true,
      id,
      action: 'deactivate',
      title: t('pages.admin.grades.confirms.deactivateTitle', 'Deactivate Grade'),
      description: t('pages.admin.grades.confirms.deactivateDesc', 'Deactivate this grade? Students already on it keep it, but it will be hidden when choosing a grade.'),
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState.id || !confirmState.action) return;
    try {
      let response;
      let successMessage = '';

      switch (confirmState.action) {
        case 'delete':
          response = await gradeLevelsAPI.delete(confirmState.id);
          successMessage = t('pages.admin.grades.toasts.deleted', 'Grade deleted successfully');
          break;
        case 'activate':
          response = await gradeLevelsAPI.activate(confirmState.id);
          successMessage = t('pages.admin.grades.toasts.activated', 'Grade activated successfully');
          break;
        case 'deactivate':
          response = await gradeLevelsAPI.deactivate(confirmState.id);
          successMessage = t('pages.admin.grades.toasts.deactivated', 'Grade deactivated successfully');
          break;
      }

      if (response.success) {
        await load();
        showToast({ type: 'success', title: t('common.success', 'Success'), message: successMessage });
      } else {
        throw new Error(response.message || t('common.actionFailed', 'Action failed'));
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        title: t('common.actionFailed', 'Action Failed'),
        message: getApiErrorMessage(err),
      });
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
          <h1 className="text-2xl sm:text-3xl font-bold">{t('pages.admin.grades.title', 'Grades')}</h1>
          <p className="text-gray-600">{t('pages.admin.grades.subtitle', 'Manage the grades students can be assigned to. Grades drive grade-based pricing.')}</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />{t('pages.admin.grades.addButton', 'Add Grade')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('pages.admin.grades.listTitle', 'Grades')}</CardTitle>
          <CardDescription>{grades.length} {t('pages.admin.grades.listCountLabel', 'grade(s)')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[520px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.grades.table.order', 'Order')}</TableHead>
                  <TableHead>{t('pages.admin.grades.table.name', 'Name')}</TableHead>
                  <TableHead>{t('pages.admin.grades.table.status', 'Status')}</TableHead>
                  <TableHead>{t('pages.admin.grades.table.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      {t('pages.admin.grades.empty', 'No grades yet. Add the grades your school uses to enable grade-based pricing.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  grades.map(grade => (
                    <TableRow key={grade.id} className={grade.isActive ? 'bg-green-50' : 'bg-red-50'}>
                      <TableCell className="font-mono text-xs">{grade.order}</TableCell>
                      <TableCell className="font-medium">{grade.name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          grade.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {grade.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(grade)} title={t('common.edit', 'Edit')}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {grade.isActive ? (
                            <Button variant="outline" size="sm" onClick={() => handleDeactivate(grade.id)} title={t('common.deactivate', 'Deactivate')}>
                              <PowerOff className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleActivate(grade.id)} title={t('common.activate', 'Activate')}>
                              <Power className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => handleDelete(grade.id)} title={t('common.delete', 'Delete')}>
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
        title={editing ? t('pages.admin.grades.modal.editTitle', 'Edit Grade') : t('pages.admin.grades.modal.addTitle', 'Add Grade')}
        size="md"
      >
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl border bg-sky-50/60 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.grades.form.name', 'Name')} *
              </label>
              <p className="text-xs text-gray-500 mb-2">{t('pages.admin.grades.form.nameHint', 'Up to 60 characters.')}</p>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                minLength={1}
                maxLength={60}
                placeholder={t('pages.admin.grades.form.namePlaceholder', 'e.g. Grade 3')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.grades.form.order', 'Order')}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {t('pages.admin.grades.form.orderHint', 'Lowest first. Used for sorting and for grade ranges such as "KG1 to Grade 2".')}
              </p>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.order ?? 0}
                onChange={e => setForm({ ...form, order: Number(e.target.value) })}
              />
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
                  : t('pages.admin.grades.form.createItem', 'Create Grade')}
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
