'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { schoolsAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SchoolViewModel, CreateSchoolDTO, UpdateSchoolDTO } from '@/types/school';

export default function SchoolsPanel() {
  const { t } = useI18n();
  const [schools, setSchools] = useState<SchoolViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SchoolViewModel | null>(null);
  const [form, setForm] = useState<CreateSchoolDTO>({
    name: '',
    isActive: true,
  });
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
      const data = await schoolsAPI.getAll();
      setSchools(data || []);
    } catch (err: any) {
      const errorMessage = err?.message || t('pages.admin.schools.errors.loadFailedMsg', 'Failed to load schools');
      setError(errorMessage);
      showToast({
        type: 'error',
        title: t('pages.admin.schools.errors.loadFailedTitle', 'Load Failed'),
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', isActive: true });
    setShowModal(true);
  };

  const openEdit = async (school: SchoolViewModel) => {
    try {
      const fetched = await schoolsAPI.getById(school.id);
      if (fetched) {
        setEditing(fetched);
        setForm({ name: fetched.name || '', isActive: fetched.isActive });
        setShowModal(true);
      } else {
        showToast({
          type: 'error',
          title: t('pages.admin.schools.errors.error', 'Error'),
          message: t('pages.admin.schools.errors.loadDepartmentDetails', 'Failed to load school details'),
        });
      }
    } catch (err: any) {
      const errorMessage = err?.message || t('pages.admin.schools.errors.loadDepartmentDetails', 'Failed to load school details');
      showToast({
        type: 'error',
        title: t('pages.admin.schools.errors.error', 'Error'),
        message: errorMessage,
      });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const updateData: UpdateSchoolDTO = { name: form.name, isActive: form.isActive };
        const response = await schoolsAPI.update(editing.id, updateData);
        if (response.success) {
          await load();
          showToast({
            type: 'success',
            title: t('pages.admin.schools.toasts.schoolUpdated', 'School Updated'),
            message: `${form.name} ${t('pages.admin.schools.toasts.updatedSuccessfully', 'has been updated successfully')}`,
          });
        } else {
          throw new Error(response.message || t('pages.admin.schools.errors.updateFailed', 'Update failed'));
        }
      } else {
        const createData: CreateSchoolDTO = { name: form.name, isActive: form.isActive };
        const response = await schoolsAPI.create(createData);
        if (response.success) {
          await load();
          showToast({
            type: 'success',
            title: t('pages.admin.schools.toasts.schoolCreated', 'School Created'),
            message: `${form.name} ${t('pages.admin.schools.toasts.createdSuccessfully', 'has been created successfully')}`,
          });
        } else {
          throw new Error(response.message || t('pages.admin.schools.errors.creationFailed', 'Creation failed'));
        }
      }
      setShowModal(false);
    } catch (err: any) {
      const errorMessage = err?.message || t('pages.admin.schools.errors.saveFailedMsg', 'Failed to save school');
      showToast({
        type: 'error',
        title: t('pages.admin.schools.errors.saveFailedTitle', 'Save Failed'),
        message: errorMessage,
      });
    }
  };

  const handleDelete = (id: number) => {
    setConfirmState({
      open: true,
      id,
      action: 'delete',
      title: t('pages.admin.schools.confirms.deleteTitle', 'Delete Department'),
      description: t('pages.admin.schools.confirms.deleteDesc', 'Are you sure you want to delete this school? Students who already selected it keep their saved value, but it will no longer appear on the registration form.'),
    });
  };

  const handleActivate = (id: number) => {
    setConfirmState({
      open: true,
      id,
      action: 'activate',
      title: t('pages.admin.schools.confirms.activateTitle', 'Activate Department'),
      description: t('pages.admin.schools.confirms.activateDesc', 'Are you sure you want to activate this school? It will appear on the registration form again.'),
    });
  };

  const handleDeactivate = (id: number) => {
    setConfirmState({
      open: true,
      id,
      action: 'deactivate',
      title: t('pages.admin.schools.confirms.deactivateTitle', 'Deactivate Department'),
      description: t('pages.admin.schools.confirms.deactivateDesc', 'Are you sure you want to deactivate this school? It will be hidden from the registration form.'),
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState.id || !confirmState.action) return;

    try {
      let response;
      let successMessage = '';

      switch (confirmState.action) {
        case 'delete':
          response = await schoolsAPI.delete(confirmState.id);
          successMessage = t('pages.admin.schools.toasts.schoolDeleted', 'School deleted successfully');
          break;
        case 'activate':
          response = await schoolsAPI.activate(confirmState.id);
          successMessage = t('pages.admin.schools.toasts.schoolActivated', 'School activated successfully');
          break;
        case 'deactivate':
          response = await schoolsAPI.deactivate(confirmState.id);
          successMessage = t('pages.admin.schools.toasts.schoolDeactivated', 'School deactivated successfully');
          break;
      }

      if (response.success) {
        await load();
        showToast({
          type: 'success',
          title: t('pages.admin.schools.toasts.successTitle', 'Success'),
          message: successMessage,
        });
      } else {
        throw new Error(response.message || t('pages.admin.schools.errors.actionFailed', 'Action failed'));
      }
    } catch (err: any) {
      const errorMessage = err?.message || t('pages.admin.schools.errors.actionFailed', 'Action failed');
      showToast({
        type: 'error',
        title: t('pages.admin.schools.errors.actionFailedTitle', 'Action Failed'),
        message: errorMessage,
      });
    } finally {
      setConfirmState({ open: false });
    }
  };

  if (loading) {
    return <div className="p-6">{t('pages.admin.schools.loading', 'Loading...')}</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('pages.admin.schools.title', 'Schools')}</h1>
          <p className="text-gray-600">{t('pages.admin.schools.subtitle', 'Manage the schools students can select at registration')}</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" />{t('pages.admin.schools.addButton', 'Add Department')}</Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('pages.admin.schools.listTitle', 'Schools')}</CardTitle>
          <CardDescription>{schools.length} {t('pages.admin.schools.listCountLabel', 'school(s)')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
          <Table className="min-w-[480px] sm:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>{t('pages.admin.schools.table.id', 'ID')}</TableHead>
                <TableHead>{t('pages.admin.schools.table.name', 'Name')}</TableHead>
                <TableHead>{t('pages.admin.schools.table.status', 'Status')}</TableHead>
                <TableHead>{t('pages.admin.schools.table.actions', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.map(school => (
                <TableRow key={school.id} className={school.isActive ? 'bg-green-50' : 'bg-red-50'}>
                  <TableCell className="font-mono text-xs">{school.id}</TableCell>
                  <TableCell className="font-medium">{school.name}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      school.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {school.isActive ? t('pages.admin.schools.status.active', 'Active') : t('pages.admin.schools.status.inactive', 'Inactive')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(school)}
                        title={t('pages.admin.schools.actions.editItem', 'Edit Department')}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {school.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeactivate(school.id)}
                          title={t('pages.admin.schools.actions.deactivateItem', 'Deactivate Department')}
                        >
                          <PowerOff className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(school.id)}
                          title={t('pages.admin.schools.actions.activateItem', 'Activate Department')}
                        >
                          <Power className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(school.id)}
                        title={t('pages.admin.schools.actions.deleteItem', 'Delete Department')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? t('pages.admin.schools.modal.editTitle', 'Edit Department') : t('pages.admin.schools.modal.addTitle', 'Add Department')} size="md">
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl border bg-sky-50/60 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages.admin.schools.form.name', 'Name')} *</label>
              <p className="text-xs text-gray-500 mb-2">{t('pages.admin.schools.form.nameHint', '2-100 characters.')}</p>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={100}
                placeholder={t('pages.admin.schools.form.namePlaceholder', 'e.g. Computer Science')}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto">
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="w-full sm:w-auto">
              {editing ? t('pages.admin.schools.form.saveChanges', 'Save Changes') : t('pages.admin.schools.form.createItem', 'Create Department')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmState.open}
        onCancel={() => setConfirmState({ open: false })}
        onConfirm={handleConfirmAction}
        title={confirmState.title || t('pages.admin.schools.confirms.confirmTitle', 'Confirm Action')}
        description={confirmState.description || t('pages.admin.schools.confirms.confirmDesc', 'Are you sure?')}
      />
    </div>
  );
}
