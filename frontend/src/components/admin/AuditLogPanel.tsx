'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { RefreshCw, Info, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { auditAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/apiError';
import { AuditLogViewModel } from '@/types/audit';

const PAGE_SIZE = 25;

/** Actions that are deliberate overrides of a safety rule, not routine edits. */
const OVERRIDE_ACTIONS = new Set(['assignment.overCapacityOverride']);

/**
 * Renders a before/after snapshot without pretending to know its shape — the
 * payload differs per entity type, so only the fields that actually changed
 * are shown, which is what a reader is looking for.
 */
function diffFields(
  before: Record<string, any> | null,
  after: Record<string, any> | null,
): Array<{ key: string; from: string; to: string }> {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const format = (v: any) => {
    if (v === undefined || v === null) return '—';
    if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
    return String(v);
  };
  return [...keys]
    .filter((key) => {
      // Noise: timestamps and mongo internals change on every write.
      if (['_id', '__v', 'createdAt', 'updatedAt'].includes(key)) return false;
      return format(before?.[key]) !== format(after?.[key]);
    })
    .map((key) => ({ key, from: format(before?.[key]), to: format(after?.[key]) }));
}

/**
 * Admin view of the audit trail.
 *
 * Read-only by design: entries are written by the actions they record. The
 * over-capacity assignment override and every financial-configuration edit
 * land here, which is what makes those escape hatches acceptable.
 */
export default function AuditLogPanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditLogViewModel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actions, setActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const entityId = entityIdFilter.trim() ? Number(entityIdFilter.trim()) : undefined;
      const result = await auditAPI.search({
        action: actionFilter || undefined,
        entityType: entityTypeFilter || undefined,
        entityId: Number.isFinite(entityId) ? entityId : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(result.rows);
      setTotal(result.total);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err);
      setError(message);
      showToast({ type: 'error', title: t('common.error', 'Error'), message });
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityTypeFilter, entityIdFilter, page, t, showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    auditAPI.getActions().then(setActions).catch(() => {});
  }, []);

  // Any filter change invalidates the current page number.
  const applyFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entityTypes = [...new Set(rows.map((r) => r.entityType))];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t('pages.admin.audit.title', 'Audit log')}</CardTitle>
          <CardDescription>
            {t(
              'pages.admin.audit.description',
              'Who changed what, and when. Records route and bus assignments — including deliberate over-capacity overrides — and every pricing, discount and instalment change.',
            )}
          </CardDescription>
        </div>
        <Button variant="outline" onClick={load} className="w-full sm:w-auto">
          <RefreshCw className="h-4 w-4 me-2" />
          {t('common.refresh', 'Refresh')}
        </Button>
      </CardHeader>

      <CardContent>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              {t('pages.admin.audit.filters.action', 'Action')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={actionFilter}
              onChange={(e) => applyFilter(setActionFilter)(e.target.value)}
            >
              <option value="">{t('pages.admin.audit.allActions', 'All actions')}</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              {t('pages.admin.audit.filters.entityType', 'Entity')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={entityTypeFilter}
              onChange={(e) => applyFilter(setEntityTypeFilter)(e.target.value)}
            >
              <option value="">{t('pages.admin.audit.allEntities', 'All entities')}</option>
              {/* Options come from the current page, so this narrows what is
                  already visible rather than promising a complete list. */}
              {entityTypes.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">
              {t('pages.admin.audit.filters.entityId', 'Entity ID')}
            </label>
            <Input
              value={entityIdFilter}
              onChange={(e) => applyFilter(setEntityIdFilter)(e.target.value)}
              placeholder={t('pages.admin.audit.entityIdPlaceholder', 'e.g. 42')}
            />
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
        ) : rows.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              {t(
                'pages.admin.audit.empty',
                'Nothing recorded yet. Entries appear here as assignments and pricing configuration are changed.',
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[860px] sm:min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('pages.admin.audit.columns.when', 'When')}</TableHead>
                    <TableHead>{t('pages.admin.audit.columns.actor', 'Who')}</TableHead>
                    <TableHead>{t('pages.admin.audit.columns.action', 'Action')}</TableHead>
                    <TableHead>{t('pages.admin.audit.columns.entity', 'Entity')}</TableHead>
                    <TableHead>{t('pages.admin.audit.columns.change', 'Change')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const changes = diffFields(row.before, row.after);
                    const isOverride = OVERRIDE_ACTIONS.has(row.action);
                    return (
                      <TableRow key={`${row.entityType}-${row.entityId}-${row.at}-${i}`}>
                        <TableCell className="whitespace-nowrap text-sm text-gray-600">
                          {row.at ? new Date(row.at).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{row.actorName ?? t('pages.admin.audit.unknownActor', 'Unknown')}</div>
                          {row.actorRole && <div className="text-xs text-gray-500">{row.actorRole}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {/* Overrides are what an auditor is looking for, so
                                they are marked rather than left to be spotted
                                among similar-looking rows. */}
                            {isOverride && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />}
                            <span className={isOverride ? 'font-medium text-amber-800' : ''}>{row.action}</span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <Badge variant="outline">{row.entityType}</Badge>
                          <span className="ms-2 text-gray-500">#{row.entityId}</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.note && <div className="mb-1 text-gray-700">{row.note}</div>}
                          {changes.length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="space-y-0.5">
                              {changes.slice(0, 6).map((c) => (
                                <div key={c.key} className="text-xs">
                                  <span className="text-gray-500">{c.key}: </span>
                                  <span className="text-red-700 line-through">{c.from}</span>
                                  <span className="mx-1 text-gray-400">→</span>
                                  <span className="text-green-700">{c.to}</span>
                                </div>
                              ))}
                              {changes.length > 6 && (
                                <div className="text-xs text-gray-500">
                                  +{changes.length - 6} {t('pages.admin.audit.moreFields', 'more')}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <span className="text-sm text-gray-600">
                {t('pages.admin.audit.page', 'Page')} {page} / {totalPages} · {total}{' '}
                {t('pages.admin.audit.entries', 'entries')}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
