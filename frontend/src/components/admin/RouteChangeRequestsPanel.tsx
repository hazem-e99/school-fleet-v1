'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Check, X, Info, AlertTriangle, RefreshCw } from 'lucide-react';
import { routeChangeRequestAPI } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  RouteChangeRequestViewModel,
  EligibleBusViewModel,
} from '@/types/routeChangeRequest';

const STATUS_FILTERS = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const;

/**
 * Admin queue for route change requests.
 *
 * The review modal is the reason this is not a plain list: when the guardian
 * named no bus the admin has to pick one, and eligibility is re-checked at
 * this moment rather than trusted from request time — a route may have been
 * disabled or a bus filled while the request sat here.
 */
export default function RouteChangeRequestsPanel() {
  const { t } = useI18n();
  const [requests, setRequests] = useState<RouteChangeRequestViewModel[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('Pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  // The request under review, tagged with the decision — the same
  // {request, mode} shape StudentSubscriptionsPanel uses for cancellations.
  const [target, setTarget] = useState<{ request: RouteChangeRequestViewModel; mode: 'Approved' | 'Rejected' } | null>(null);
  const [buses, setBuses] = useState<EligibleBusViewModel[]>([]);
  const [busesLoading, setBusesLoading] = useState(false);
  const [selectedBusId, setSelectedBusId] = useState<string>('');
  const [allowOverCapacity, setAllowOverCapacity] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setRequests(await routeChangeRequestAPI.getAll({ status: statusFilter || undefined, pageSize: 100 }));
    } catch (err: unknown) {
      const message = getApiErrorMessage(err);
      setError(message);
      showToast({ type: 'error', title: t('common.error', 'Error'), message });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t, showToast]);

  useEffect(() => { load(); }, [load]);

  const openReview = async (request: RouteChangeRequestViewModel, mode: 'Approved' | 'Rejected') => {
    setTarget({ request, mode });
    setNotes('');
    setAllowOverCapacity(false);
    setSelectedBusId(request.preferredBusId != null ? String(request.preferredBusId) : '');
    setBuses([]);

    if (mode !== 'Approved') return;

    setBusesLoading(true);
    try {
      const eligible = await routeChangeRequestAPI.getEligibleBuses(request.id);
      setBuses(eligible);
      // Preselect the guardian's choice only if it is still usable; otherwise
      // leave the picker empty so the admin has to look at the list.
      const preferred = eligible.find(b => b.id === request.preferredBusId);
      if (preferred && !preferred.isEligible) setSelectedBusId('');
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setBusesLoading(false);
    }
  };

  const submit = async () => {
    if (!target) return;
    if (target.mode === 'Approved' && !selectedBusId) {
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: t('pages.admin.routeRequests.errors.busRequired', 'Choose a bus on the requested route before approving.'),
      });
      return;
    }
    if (target.mode === 'Rejected' && !notes.trim()) {
      // Mandatory on reject, matching the cancellation review: a guardian is
      // owed a reason when their request is refused.
      showToast({
        type: 'error',
        title: t('common.error', 'Error'),
        message: t('pages.admin.routeRequests.errors.notesRequired', 'Give a reason for rejecting this request.'),
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await routeChangeRequestAPI.review(target.request.id, {
        status: target.mode,
        adminNotes: notes.trim() || undefined,
        ...(target.mode === 'Approved' ? { assignedBusId: Number(selectedBusId), allowOverCapacity } : {}),
      });

      if (response.success) {
        setTarget(null);
        await load();
        showToast({ type: 'success', title: t('common.done', 'Done'), message: response.message || '' });
      } else {
        showToast({ type: 'error', title: t('common.error', 'Error'), message: response.message || '' });
      }
    } catch (err: unknown) {
      // A route disabled or bus filled since the request was raised returns a
      // 409 explaining which — surface it verbatim.
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const statusVariant = (status: string) =>
    status === 'Pending' ? 'secondary' : status === 'Approved' ? 'default' : 'outline';

  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t('pages.admin.routeRequests.title', 'Route change requests')}</CardTitle>
          <CardDescription>
            {t(
              'pages.admin.routeRequests.description',
              'Guardians ask to move a child to another route; you decide and pick the bus. Eligibility is re-checked when you approve.',
            )}
          </CardDescription>
        </div>
        <Button variant="outline" onClick={load} className="w-full sm:w-auto">
          <RefreshCw className="h-4 w-4 me-2" />
          {t('common.refresh', 'Refresh')}
        </Button>
      </CardHeader>

      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {t(`pages.admin.routeRequests.status.${status.toLowerCase()}`, status)}
              {status === 'Pending' && pendingCount > 0 && statusFilter === 'Pending' ? ` (${pendingCount})` : ''}
            </Button>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
        ) : requests.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              {statusFilter === 'Pending'
                ? t('pages.admin.routeRequests.emptyPending', 'No route change requests are waiting for review.')
                : t('pages.admin.routeRequests.empty', 'No requests with this status.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[900px] sm:min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pages.admin.routeRequests.columns.child', 'Child')}</TableHead>
                  <TableHead>{t('pages.admin.routeRequests.columns.guardian', 'Guardian')}</TableHead>
                  <TableHead>{t('pages.admin.routeRequests.columns.from', 'Currently on')}</TableHead>
                  <TableHead>{t('pages.admin.routeRequests.columns.to', 'Requested')}</TableHead>
                  <TableHead>{t('pages.admin.routeRequests.columns.reason', 'Reason')}</TableHead>
                  <TableHead>{t('pages.admin.routeRequests.columns.status', 'Status')}</TableHead>
                  <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.childName ?? `#${req.childId}`}</TableCell>
                    <TableCell className="text-sm">
                      <div>{req.guardianName ?? '—'}</div>
                      {req.guardianPhone && <div className="text-xs text-gray-500">{req.guardianPhone}</div>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.currentRouteName ?? t('pages.admin.routeRequests.unassigned', 'Unassigned')}
                      {req.currentBusNumber && <span className="text-gray-500"> · {req.currentBusNumber}</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.requestedRouteName ?? `#${req.requestedRouteId}`}
                      {req.preferredBusNumber && (
                        <span className="text-gray-500">
                          {' '}· {t('pages.admin.routeRequests.prefers', 'prefers')} {req.preferredBusNumber}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-gray-600">{req.reason ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(req.status)}>
                        {t(`pages.admin.routeRequests.status.${req.status.toLowerCase()}`, req.status)}
                      </Badge>
                      {req.status === 'Approved' && req.appliedBusNumber && (
                        <div className="mt-1 text-xs text-gray-500">
                          {t('pages.admin.routeRequests.appliedTo', 'Placed on')} {req.appliedBusNumber}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {req.status === 'Pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => openReview(req, 'Approved')}>
                            <Check className="h-4 w-4 me-1" />
                            {t('common.approve', 'Approve')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openReview(req, 'Rejected')}>
                            <X className="h-4 w-4 me-1" />
                            {t('common.reject', 'Reject')}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-end text-xs text-gray-500">{req.adminNotes ?? '—'}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={!!target}
        onClose={() => setTarget(null)}
        title={
          target?.mode === 'Approved'
            ? t('pages.admin.routeRequests.approveTitle', 'Approve route change')
            : t('pages.admin.routeRequests.rejectTitle', 'Reject route change')
        }
        size="lg"
      >
        {target && (
          <div className="space-y-4">
            {/* Read-only context, so the decision is made against the facts
                rather than from memory of the row that was clicked. */}
            <div className="rounded-xl border border-gray-200 p-3 text-sm">
              <div className="font-medium">{target.request.childName ?? `#${target.request.childId}`}</div>
              <div className="text-gray-600">
                {target.request.currentRouteName ?? t('pages.admin.routeRequests.unassigned', 'Unassigned')}
                {' → '}
                {target.request.requestedRouteName ?? `#${target.request.requestedRouteId}`}
              </div>
              {target.request.reason && (
                <div className="mt-2 text-gray-600">
                  <span className="text-gray-500">{t('pages.admin.routeRequests.columns.reason', 'Reason')}: </span>
                  {target.request.reason}
                </div>
              )}
            </div>

            <div
              className={`rounded-lg p-3 text-sm ${
                target.mode === 'Approved' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
              }`}
            >
              {target.mode === 'Approved'
                ? t('pages.admin.routeRequests.approveBanner', 'The child will be moved to this route and bus immediately, and the guardian will be notified.')
                : t('pages.admin.routeRequests.rejectBanner', 'The child stays where they are. Your note is sent to the guardian.')}
            </div>

            {target.mode === 'Approved' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('pages.admin.routeRequests.fields.bus', 'Bus on the requested route')}
                </label>

                {busesLoading ? (
                  <p className="text-sm text-gray-500">{t('common.loading', 'Loading...')}</p>
                ) : buses.length === 0 ? (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      {t(
                        'pages.admin.routeRequests.noBuses',
                        'No buses are assigned to this route yet. Assign one on the Buses page before approving.',
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={selectedBusId}
                      onChange={e => setSelectedBusId(e.target.value)}
                    >
                      <option value="">{t('common.select', 'Select...')}</option>
                      {/* Full and out-of-service buses are listed but labelled,
                          rather than hidden — an admin using the override needs
                          to see them, and a silently missing option is more
                          confusing than an explained one. */}
                      {buses.map(bus => (
                        <option key={bus.id} value={bus.id}>
                          {bus.busNumber} — {bus.assignedStudents}/{bus.capacity}
                          {bus.ineligibleReason ? ` (${bus.ineligibleReason})` : ''}
                        </option>
                      ))}
                    </select>

                    {selectedBusId && !buses.find(b => String(b.id) === selectedBusId)?.isEligible && (
                      <label className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={allowOverCapacity}
                          onChange={e => setAllowOverCapacity(e.target.checked)}
                        />
                        <span>
                          {t(
                            'pages.admin.routeRequests.overCapacity',
                            'This bus is full or out of service. Confirm the over-capacity assignment — it will be recorded in the audit log.',
                          )}
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {target.mode === 'Rejected'
                  ? t('pages.admin.routeRequests.fields.reasonRequired', 'Reason for rejection')
                  : t('pages.admin.routeRequests.fields.notes', 'Notes (optional)')}
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setTarget(null)} className="w-full sm:w-auto">
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={submit} disabled={submitting} className="w-full sm:w-auto">
                {submitting
                  ? t('common.submitting', 'Submitting...')
                  : target.mode === 'Approved'
                    ? t('common.approve', 'Approve')
                    : t('common.reject', 'Reject')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
