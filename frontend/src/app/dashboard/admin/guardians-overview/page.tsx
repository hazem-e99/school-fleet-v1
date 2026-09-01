'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import { studentAPI } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { RefreshCw, AlertCircle, Users, ChevronDown, ChevronRight } from 'lucide-react';

type GuardianRow = Record<string, any>;

export default function GuardiansOverviewPage() {
  const { t, lang } = useI18n() as { t: (k: string, f?: string) => string; lang: string };
  const { showToast } = useToast();

  const [rows, setRows] = useState<GuardianRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await studentAPI.getGuardiansOverview();
      setRows(data);
    } catch (err) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName?.toLowerCase().includes(q) ||
        r.phoneNumber?.includes(q),
    );
  }, [rows, search]);

  if (loading) {
    return <div className="p-6">{t('pages.admin.guardiansOverview.loading', 'Loading guardians...')}</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" />
            {t('pages.admin.guardiansOverview.title', 'Guardians')}
          </h1>
          <p className="text-text-secondary">
            {t('pages.admin.guardiansOverview.subtitle', 'Parents and the children they manage')}
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('common.refresh', 'Refresh')}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder={t('pages.admin.guardiansOverview.search', 'Search by name or phone')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm mb-4"
          />

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-text-secondary flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8" />
              {t('pages.admin.guardiansOverview.empty', 'No guardians found.')}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((g) => (
                <div key={g.id} className="rounded-xl border border-border">
                  <button
                    className="w-full flex items-center justify-between p-4 text-left"
                    onClick={() => setExpanded((p) => ({ ...p, [g.id]: !p[g.id] }))}
                  >
                    <div>
                      <div className="font-semibold text-text-primary">{g.fullName}</div>
                      <div className="text-sm text-text-secondary">
                        {g.phoneNumber || '—'} ·{' '}
                        {t('pages.admin.guardiansOverview.registered', 'registered')}{' '}
                        {g.registeredAt ? formatDate(lang, g.registeredAt) : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">
                        {g.childrenCount} {t('pages.admin.guardiansOverview.children', 'children')}
                      </Badge>
                      <Badge variant="default">
                        {g.activeSubscriptionsCount} {t('pages.admin.guardiansOverview.active', 'active')}
                      </Badge>
                      {expanded[g.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>
                  {expanded[g.id] && (
                    <div className="px-4 pb-4 space-y-2">
                      {(g.children || []).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between rounded-lg bg-card-hover px-3 py-2 text-sm">
                          <span>{c.fullName}</span>
                          <span className="text-text-secondary">{c.schoolName} · {c.pickupAreaName}</span>
                          {c.hasActiveSubscription ? (
                            <Badge variant="default">{t('pages.admin.guardiansOverview.subscribed', 'Subscribed')}</Badge>
                          ) : (
                            <Badge variant="secondary">{t('pages.admin.guardiansOverview.noPlan', 'No plan')}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
