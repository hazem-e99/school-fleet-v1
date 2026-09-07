'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import { studentAPI, routeAPI, childrenAPI, schoolsAPI, preferredAreasAPI, gradeLevelsAPI } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
// Children overview rows come from /Users/children-overview — a superset-ish shape.
type ChildOverviewRow = Record<string, any>;
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import {
  Download, RefreshCw, AlertCircle, GraduationCap,
  CheckCircle, XCircle, Clock, Undo2, MapPin, Pencil, Eye,
} from 'lucide-react';

/** Row background tint per subscription status — mirrors StudentSubscriptionsPanel's convention. */
const SUB_STATUS_ROW_CLASS: Record<string, string> = {
  Active: 'bg-green-50/60',
  Expired: 'bg-orange-50/60',
  Cancelled: 'bg-gray-50/60',
  Suspended: 'bg-red-50/60',
  PendingActivation: 'bg-yellow-50/60',
  PendingPayment: 'bg-yellow-50/60',
};

export default function StudentsOverviewPage() {
  const { t, lang } = useI18n() as { t: (k: string, f?: string) => string; lang: string };
  const { showToast } = useToast();

  const [rows, setRows] = useState<ChildOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState('all');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');

  // Route/bus assignment
  const [assignTarget, setAssignTarget] = useState<ChildOverviewRow | null>(null);
  const [assignRouteId, setAssignRouteId] = useState<string>('');
  const [assignBusId, setAssignBusId] = useState<string>('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [routes, setRoutes] = useState<Array<{ id: number; name: string }>>([]);
  const [routeBuses, setRouteBuses] = useState<Array<{
    id: number; busNumber: string; capacity: number; assignedStudents: number; availableSeats: number;
  }>>([]);

  // Admin child edit. Before this existed an admin could not edit a child at
  // all — the only edit form under admin/students edits legacy Student USER
  // records, not children, and its submit has always been a stub.
  const [editTarget, setEditTarget] = useState<ChildOverviewRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', email: '', schoolName: '', pickupAreaName: '', gradeLevelId: '',
  });
  const [schoolNames, setSchoolNames] = useState<string[]>([]);
  const [areaNames, setAreaNames] = useState<string[]>([]);
  const [grades, setGrades] = useState<Array<{ id: number; name: string | null }>>([]);

  const openEditModal = async (row: ChildOverviewRow) => {
    setEditTarget(row);
    setEditForm({
      name: row.name ?? row.fullName ?? '',
      email: row.email ?? '',
      schoolName: row.schoolName ?? '',
      pickupAreaName: row.pickupAreaName ?? '',
      gradeLevelId: row.gradeLevelId != null ? String(row.gradeLevelId) : '',
    });

    // Loaded lazily on first open rather than with the page — the overview is
    // already a heavy query and most visits never edit anything.
    if (!schoolNames.length || !areaNames.length || !grades.length) {
      const [schools, areas, gradeList] = await Promise.all([
        schoolsAPI.getActive().catch(() => []),
        preferredAreasAPI.getActive().catch(() => []),
        gradeLevelsAPI.getActive().catch(() => []),
      ]);
      setSchoolNames(schools.map((x: any) => x.name).filter(Boolean));
      setAreaNames(areas.map((x: any) => x.name).filter(Boolean));
      setGrades(gradeList);
    }
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await childrenAPI.adminUpdate(editTarget.id, {
        name: editForm.name.trim(),
        // Sent even when blank: an empty string is how the admin clears an
        // address, which the server turns into an unset rather than storing ''.
        email: editForm.email.trim(),
        schoolName: editForm.schoolName,
        pickupAreaName: editForm.pickupAreaName,
        ...(editForm.gradeLevelId ? { gradeLevelId: Number(editForm.gradeLevelId) } : {}),
      });
      if (!res?.success) throw new Error(res?.message || 'Failed');
      setEditTarget(null);
      await load();
      showToast({ type: 'success', title: t('common.saved', 'Saved'), message: res.message || '' });
    } catch (err: unknown) {
      showToast({ type: 'error', title: t('common.error', 'Error'), message: getApiErrorMessage(err) });
    } finally {
      setEditSaving(false);
    }
  };

  const openAssignModal = async (row: ChildOverviewRow) => {
    setAssignTarget(row);
    setAssignRouteId(row.routeId != null ? String(row.routeId) : '');
    setAssignBusId(row.busId != null ? String(row.busId) : '');
    setRouteBuses([]);
    try {
      const list = await routeAPI.getAll({ isActive: true });
      setRoutes(list as Array<{ id: number; name: string }>);
      if (row.routeId != null) {
        setRouteBuses(await routeAPI.getBuses(row.routeId));
      }
    } catch {
      // A failed lookup leaves the pickers empty rather than blocking the modal.
      setRoutes([]);
    }
  };

  /** Buses depend on the chosen route, so reload them whenever it changes. */
  const handleAssignRouteChange = async (value: string) => {
    setAssignRouteId(value);
    setAssignBusId('');
    if (!value) {
      setRouteBuses([]);
      return;
    }
    try {
      setRouteBuses(await routeAPI.getBuses(Number(value)));
    } catch {
      setRouteBuses([]);
    }
  };

  const submitAssignment = async (allowOverCapacity = false) => {
    if (!assignTarget) return;
    setAssignSaving(true);
    try {
      await childrenAPI.assign(assignTarget.id, {
        routeId: assignRouteId === '' ? null : Number(assignRouteId),
        busId: assignBusId === '' ? null : Number(assignBusId),
        ...(allowOverCapacity ? { allowOverCapacity: true } : {}),
      });
      showToast({
        type: 'success',
        title: t('pages.admin.studentsOverview.assignSaved', 'Assignment saved'),
        message: `${assignTarget.name ?? ''}`.trim(),
      });
      setAssignTarget(null);
      await load();
    } catch (error) {
      // The server explains capacity/route/bus refusals in its 409 message.
      showToast({
        type: 'error',
        title: t('pages.admin.studentsOverview.assignFailed', 'Could not save assignment'),
        message: getApiErrorMessage(error),
      });
    } finally {
      setAssignSaving(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await studentAPI.getChildrenOverview();
      setRows(data);
    } catch (error) {
      showToast({
        type: 'error',
        title: t('pages.admin.studentsOverview.errors.loadFailed', 'Failed to load students'),
        message: getApiErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const departmentOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.schoolName).filter((d): d is string => !!d))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesDepartment = departmentFilter === 'all' || r.schoolName === departmentFilter;
      const matchesAccountStatus = accountStatusFilter === 'all' || r.status === accountStatusFilter;
      const matchesSubStatus = subscriptionStatusFilter === 'all'
        || (subscriptionStatusFilter === 'none' ? !r.subscriptionStatus : r.subscriptionStatus === subscriptionStatusFilter);
      const matchesPaymentStatus = paymentStatusFilter === 'all'
        || (paymentStatusFilter === 'none' ? !r.paymentStatus : r.paymentStatus === paymentStatusFilter);
      return matchesDepartment && matchesAccountStatus && matchesSubStatus && matchesPaymentStatus;
    });
  }, [rows, departmentFilter, accountStatusFilter, subscriptionStatusFilter, paymentStatusFilter]);

  const accountStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return <Badge className="bg-green-100 text-green-800">{status}</Badge>;
      case 'Suspended':
        return <Badge className="bg-red-100 text-red-800">{status}</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const subscriptionStatusBadge = (status?: string | null) => {
    if (!status) return <span className="text-gray-400">—</span>;
    switch (status) {
      case 'Active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'Cancelled':
      case 'Suspended':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'Expired':
        return <Badge className="bg-orange-100 text-orange-800"><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'PendingActivation':
      case 'PendingPayment':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />{status}</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const paymentStatusBadge = (status?: string | null) => {
    if (!status) return <span className="text-gray-400">—</span>;
    switch (status) {
      case 'Accepted':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'Rejected':
      case 'Cancelled':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'Pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'Expired':
        return <Badge className="bg-orange-100 text-orange-800"><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'Refunded':
        return <Badge className="bg-indigo-100 text-indigo-800"><Undo2 className="w-3 h-3 mr-1" />{status}</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const paymentChannelLabel = useCallback(
    (channel?: string | null) => {
      if (!channel) return '—';
      return t(`pages.admin.studentsOverview.paymentChannel.${channel}`, channel);
    },
    [t],
  );

  const handleExport = async () => {
    try {
      setExporting(true);
      const { exportStudentsOverview } = await import('@/lib/exportStudentsOverview');
      await exportStudentsOverview({
        rows: filteredRows as any,
        lang,
        labels: {
          reportTitle: t('pages.admin.studentsOverview.excel.reportTitle', 'El Renad — Students Overview'),
          generatedAt: t('pages.admin.studentsOverview.excel.generatedAt', 'Generated at'),
          sheetName: t('pages.admin.studentsOverview.excel.sheetName', 'Students'),
          fileNamePrefix: 'students-overview',
          student: t('pages.admin.studentsOverview.columns.student', 'Student'),
          email: t('pages.admin.studentsOverview.columns.email', 'Email'),
          phone: t('pages.admin.studentsOverview.columns.phone', 'Phone'),
          nationalId: t('pages.admin.studentsOverview.columns.nationalId', 'National ID'),
          department: t('pages.admin.studentsOverview.columns.department', 'Department'),
          preferredArea: t('pages.admin.studentsOverview.columns.preferredArea', 'Preferred Area'),
          yearOfStudy: t('pages.admin.studentsOverview.columns.yearOfStudy', 'Year of Study'),
          academicNumber: t('pages.admin.studentsOverview.columns.academicNumber', 'Academic No.'),
          accountStatus: t('pages.admin.studentsOverview.columns.accountStatus', 'Account Status'),
          plan: t('pages.admin.studentsOverview.columns.plan', 'Plan'),
          subscriptionStatus: t('pages.admin.studentsOverview.columns.subscriptionStatus', 'Subscription Status'),
          paymentMethod: t('pages.admin.studentsOverview.columns.paymentMethod', 'Payment Method'),
          paymentChannel: t('pages.admin.studentsOverview.columns.paymentChannel', 'Payment Channel'),
          amountPaid: t('pages.admin.studentsOverview.columns.amountPaid', 'Amount Paid'),
          paymentStatus: t('pages.admin.studentsOverview.columns.paymentStatus', 'Payment Status'),
          registeredOn: t('pages.admin.studentsOverview.columns.registeredOn', 'Registered On'),
          paymentDate: t('pages.admin.studentsOverview.columns.paymentDate', 'Subscription/Payment Date'),
        },
      });
      showToast({
        type: 'success',
        title: t('pages.admin.studentsOverview.exportSuccess', 'Export ready'),
        message: t('pages.admin.studentsOverview.exportSuccessMessage', 'The Excel file has been downloaded.'),
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: t('pages.admin.studentsOverview.exportError', 'Export failed'),
        message: getApiErrorMessage(error),
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="p-6">{t('pages.admin.studentsOverview.loading', 'Loading students...')}</div>;
  }

  const columns: ColumnDef<ChildOverviewRow>[] = [
    {
      header: t('pages.admin.studentsOverview.columns.student', 'Student'),
      accessorKey: 'fullName',
      cell: ({ row }) => (
        <div>
          {/* The name is the most natural way into the detail page. */}
          <Link
            href={`/dashboard/admin/children/${row.original.id}`}
            className="font-semibold text-text-primary hover:text-primary hover:underline"
          >
            {row.original.fullName}
          </Link>
        </div>
      ),
    },
    {
      header: t('pages.admin.studentsOverview.columns.phone', 'Phone'),
      accessorKey: 'phoneNumber',
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      header: t('pages.admin.studentsOverview.columns.nationalId', 'National ID'),
      accessorKey: 'nationalId',
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      header: t('pages.admin.studentsOverview.columns.email', 'Email'),
      accessorKey: 'email',
      cell: ({ getValue }) => getValue<string>() || <span className="text-gray-400">—</span>,
    },
    {
      header: t('pages.admin.studentsOverview.columns.school', 'School'),
      accessorKey: 'schoolName',
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      header: t('pages.admin.studentsOverview.columns.pickupArea', 'Pickup Area'),
      accessorKey: 'pickupAreaName',
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      header: t('pages.admin.studentsOverview.columns.guardian', 'Guardian'),
      accessorKey: 'guardianName',
      cell: ({ row }) => (
        <div>
          <p className="text-text-primary">{row.original.guardianName || '—'}</p>
          <p className="text-sm text-text-secondary">{row.original.guardianPhone || ''}</p>
        </div>
      ),
    },
    {
      header: t('pages.admin.studentsOverview.columns.accountStatus', 'Account Status'),
      accessorKey: 'status',
      cell: ({ getValue }) => accountStatusBadge(getValue<string>()),
    },
    {
      header: t('pages.admin.studentsOverview.columns.plan', 'Plan'),
      accessorKey: 'subscriptionPlanName',
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      header: t('pages.admin.studentsOverview.columns.subscriptionStatus', 'Subscription Status'),
      accessorKey: 'subscriptionStatus',
      cell: ({ getValue }) => subscriptionStatusBadge(getValue<string>()),
    },
    {
      header: t('pages.admin.studentsOverview.columns.paymentMethod', 'Payment Method'),
      accessorKey: 'paymentMethod',
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      header: t('pages.admin.studentsOverview.columns.paymentChannel', 'Payment Channel'),
      accessorKey: 'paymentChannel',
      cell: ({ getValue }) => paymentChannelLabel(getValue<string>()),
    },
    {
      header: t('pages.admin.studentsOverview.columns.amountPaid', 'Amount Paid'),
      accessorKey: 'paymentAmount',
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return v != null ? formatCurrency(lang, v) : '—';
      },
    },
    {
      header: t('pages.admin.studentsOverview.columns.paymentStatus', 'Payment Status'),
      accessorKey: 'paymentStatus',
      cell: ({ getValue }) => paymentStatusBadge(getValue<string>()),
    },
    {
      header: t('pages.admin.studentsOverview.columns.registeredOn', 'Registered On'),
      accessorKey: 'registeredAt',
      cell: ({ getValue }) => {
        const v = getValue<string | null>();
        return v ? formatDate(lang, v) : '—';
      },
    },
    {
      header: t('pages.admin.studentsOverview.columns.paymentDate', 'Subscription/Payment Date'),
      accessorFn: (row) => row.paymentDate || row.subscriptionStartDate,
      id: 'paymentOrSubscriptionDate',
      cell: ({ getValue }) => {
        const v = getValue<string | null>();
        return v ? formatDate(lang, v) : '—';
      },
    },
    {
      header: t('pages.admin.studentsOverview.columns.route', 'Route'),
      accessorKey: 'routeName',
      cell: ({ getValue }) => (getValue() as string) || <span className="text-gray-400">—</span>,
    },
    {
      header: t('pages.admin.studentsOverview.columns.bus', 'Bus'),
      accessorKey: 'busNumber',
      cell: ({ getValue }) => (getValue() as string) || <span className="text-gray-400">—</span>,
    },
    {
      header: t('pages.admin.studentsOverview.columns.actions', 'Actions'),
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {/* Opens the Child detail page — the rider record, not the legacy
              Student User page under admin/students. */}
          <Link href={`/dashboard/admin/children/${row.original.id}`}>
            <Button
              variant="ghost"
              size="sm"
              title={t('pages.admin.studentsOverview.view', 'View details')}
            >
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(row.original)}
            title={t('pages.admin.studentsOverview.edit', 'Edit details')}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openAssignModal(row.original)}
            title={t('pages.admin.studentsOverview.assign', 'Assign route and bus')}
          >
            <MapPin className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">
              {t('pages.admin.studentsOverview.title', 'Students Overview')}
            </h1>
            <p className="text-text-secondary mt-1">
              {t('pages.admin.studentsOverview.subtitle', 'All registered students with their subscription and payment info')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={load} disabled={exporting}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('pages.admin.studentsOverview.refresh', 'Refresh')}
            </Button>
            <Button onClick={handleExport} disabled={exporting} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              {exporting
                ? t('pages.admin.studentsOverview.exporting', 'Exporting...')
                : t('pages.admin.studentsOverview.export', 'Export to Excel')}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-white/70 backdrop-blur p-4 flex items-center gap-3">
            <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs text-text-secondary">{t('pages.admin.studentsOverview.stats.totalStudents', 'Total Students')}</p>
              <p className="text-lg font-bold text-text-primary">{rows.length}</p>
            </div>
          </div>
          <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="all">{t('pages.admin.studentsOverview.filters.allSchools', 'All Schools')}</option>
            {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select value={accountStatusFilter} onChange={(e) => setAccountStatusFilter(e.target.value)}>
            <option value="all">{t('pages.admin.studentsOverview.filters.allAccountStatuses', 'All Account Statuses')}</option>
            {['Active', 'Inactive', 'Suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={subscriptionStatusFilter} onChange={(e) => setSubscriptionStatusFilter(e.target.value)}>
            <option value="all">{t('pages.admin.studentsOverview.filters.allSubscriptionStatuses', 'All Subscription Statuses')}</option>
            {['Active', 'Expired', 'Cancelled', 'Suspended', 'PendingActivation', 'PendingPayment'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="none">{t('pages.admin.studentsOverview.filters.noneStatus', 'None')}</option>
          </Select>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
            <option value="all">{t('pages.admin.studentsOverview.filters.allPaymentStatuses', 'All Payment Statuses')}</option>
            {['Accepted', 'Pending', 'Rejected', 'Cancelled', 'Expired', 'Refunded'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="none">{t('pages.admin.studentsOverview.filters.noneStatus', 'None')}</option>
          </Select>
        </div>
      </div>

      <Card className="rounded-xl border bg-white">
        <CardContent className="p-4 sm:p-6">
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-lg font-semibold text-text-primary">
                {t('pages.admin.studentsOverview.empty', 'No students found.')}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {t('pages.admin.studentsOverview.noResults', 'Try adjusting your filters.')}
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredRows}
              searchPlaceholder={t('pages.admin.studentsOverview.searchPlaceholder', 'Search students...')}
              getRowClassName={(r) => SUB_STATUS_ROW_CLASS[(r as ChildOverviewRow).subscriptionStatus ?? ''] ?? ''}
            />
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={t('pages.admin.studentsOverview.editTitle', 'Edit child details')}
        size="md"
      >
        {editTarget && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.studentsOverview.fields.name', 'Name')}
              </label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.studentsOverview.fields.email', 'Email (optional)')}
              </label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">
                {t(
                  'pages.admin.studentsOverview.hints.email',
                  'Contact address only — sign-in is by phone number. Siblings may share one. Leave blank to remove.',
                )}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.studentsOverview.fields.school', 'School')}
              </label>
              <Select
                value={editForm.schoolName}
                onChange={(e) => setEditForm({ ...editForm, schoolName: e.target.value })}
              >
                {/* The child's current value is included even if it is no
                    longer in the active list, so opening the form cannot
                    silently reassign them to a different school. */}
                {[...new Set([editForm.schoolName, ...schoolNames].filter(Boolean))].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('pages.admin.studentsOverview.fields.pickupArea', 'Pickup area')}
              </label>
              <Select
                value={editForm.pickupAreaName}
                onChange={(e) => setEditForm({ ...editForm, pickupAreaName: e.target.value })}
              >
                {[...new Set([editForm.pickupAreaName, ...areaNames].filter(Boolean))].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </div>

            {grades.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('pages.admin.studentsOverview.fields.grade', 'Grade')}
                </label>
                <Select
                  value={editForm.gradeLevelId}
                  onChange={(e) => setEditForm({ ...editForm, gradeLevelId: e.target.value })}
                >
                  <option value="">{t('common.none', 'None')}</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-gray-500">
                  {t(
                    'pages.admin.studentsOverview.hints.grade',
                    'Grade decides which pricing band applies to future subscriptions. Subscriptions already sold keep the price they were sold at.',
                  )}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setEditTarget(null)} className="w-full sm:w-auto">
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={submitEdit} disabled={editSaving} className="w-full sm:w-auto">
                {editSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={t('pages.admin.studentsOverview.assignTitle', 'Assign route and bus')}
        size="md"
      >
        {assignTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div className="font-medium text-text-primary">{assignTarget.name}</div>
              <div className="text-text-secondary">
                {assignTarget.schoolName}
                {assignTarget.pickupAreaName ? ` · ${assignTarget.pickupAreaName}` : ''}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.studentsOverview.routeLabel', 'Route')}
              </label>
              <Select value={assignRouteId} onChange={(e) => handleAssignRouteChange(e.target.value)}>
                <option value="">{t('pages.admin.studentsOverview.noRoute', 'No route')}</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('pages.admin.studentsOverview.busLabel', 'Bus')}
              </label>
              <Select
                value={assignBusId}
                onChange={(e) => setAssignBusId(e.target.value)}
                disabled={!assignRouteId}
              >
                <option value="">{t('pages.admin.studentsOverview.noBus', 'No bus')}</option>
                {routeBuses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {`${b.busNumber} — ${b.assignedStudents}/${b.capacity}`}
                    {b.availableSeats === 0 ? ` (${t('pages.admin.studentsOverview.full', 'full')})` : ''}
                  </option>
                ))}
              </Select>
              {!assignRouteId && (
                <p className="text-xs text-gray-500 mt-1">
                  {t('pages.admin.studentsOverview.pickRouteFirst', 'Choose a route first — a bus must belong to it.')}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setAssignTarget(null)}
                disabled={assignSaving}
                className="w-full sm:w-auto"
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={() => submitAssignment(false)}
                disabled={assignSaving}
                className="w-full sm:w-auto"
              >
                {assignSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
