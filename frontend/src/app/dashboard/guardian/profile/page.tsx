'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/contexts/LanguageContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { userAPI } from '@/lib/api';

export default function GuardianProfilePage() {
  const { t } = useI18n();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phoneNumber: '', nationalId: '' });

  const load = async () => {
    setLoading(true);
    try {
      const p = await userAPI.getCurrentUserProfile();
      setForm({
        firstName: p?.firstName || '',
        lastName: p?.lastName || '',
        phoneNumber: p?.phoneNumber || p?.phone || '',
        nationalId: p?.nationalId || '',
      });
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

  const save = async () => {
    setSaving(true);
    try {
      await userAPI.updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phoneNumber: form.phoneNumber.trim(),
      });
      showToast({ type: 'success', title: t('common.success', 'Success'), message: t('pages.guardian.profile.saved', 'Profile updated.') });
      setEditing(false);
      await load();
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 sm:p-6">{t('common.loading', 'Loading...')}</div>;

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('pages.guardian.profile.title', 'My Profile')}</CardTitle>
          {!editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>{t('common.edit', 'Edit')}</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setEditing(false); load(); }}>{t('common.cancel', 'Cancel')}</Button>
              <Button onClick={save} disabled={saving}>{saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}</Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('pages.auth.register.fields.firstName', 'First Name')}</label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} disabled={!editing} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('pages.auth.register.fields.lastName', 'Last Name')}</label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} disabled={!editing} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('pages.auth.register.fields.phoneNumber', 'Phone Number')}</label>
              <Input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} disabled={!editing} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('pages.auth.register.fields.nationalId', 'National ID')}</label>
              <Input value={form.nationalId} disabled />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
