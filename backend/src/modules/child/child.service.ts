import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Child, ChildDocument } from './child.schema';
import { User, UserDocument } from '../users/user.schema';
import {
  StudentSubscription,
  StudentSubscriptionDocument,
} from '../student-subscription/student-subscription.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from '../subscription-plan/subscription-plan.schema';
import { GradeLevel, GradeLevelDocument } from '../grade-level/grade-level.schema';
import { TripRoute, TripRouteDocument } from '../routes/route.schema';
import { Bus, BusDocument } from '../buses/bus.schema';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { AuditService } from '../../common/audit/audit.service';
import { resolveSubscriptionPrice, hasPricingSnapshot } from '../../common/pricing/snapshot-price';
import { AssignChildDto } from './dto/assign-child.dto';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';
import { AdminUpdateChildDto } from './dto/admin-update-child.dto';
import { Payment, PaymentDocument } from '../payment/payment.schema';
import { StudentInstallment, StudentInstallmentDocument } from '../installment/student-installment.schema';
import { RouteChangeRequest, RouteChangeRequestDocument } from '../route-change-request/route-change-request.schema';
import { isOverdue } from '../installment/schedule';

@Injectable()
export class ChildService {
  constructor(
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentSubscription.name)
    private subModel: Model<StudentSubscriptionDocument>,
    @InjectModel(SubscriptionPlan.name)
    private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(GradeLevel.name)
    private gradeModel: Model<GradeLevelDocument>,
    @InjectModel(TripRoute.name)
    private routeModel: Model<TripRouteDocument>,
    @InjectModel(Bus.name)
    private busModel: Model<BusDocument>,
    @InjectModel(Payment.name)
    private paymentModel: Model<PaymentDocument>,
    @InjectModel(StudentInstallment.name)
    private installmentModel: Model<StudentInstallmentDocument>,
    @InjectModel(RouteChangeRequest.name)
    private routeChangeRequestModel: Model<RouteChangeRequestDocument>,
    private readonly auditService: AuditService,
  ) {}

  private async findByNumericId(id: number): Promise<ChildDocument | null> {
    return this.childModel.findOne({ numericId: id }).exec();
  }

  private async toViewModel(child: ChildDocument): Promise<any> {
    const guardian = await this.userModel.findOne({ numericId: child.guardianId }).exec();
    const activeSub = await this.subModel
      .findOne({ studentId: child.numericId, isActive: true, status: 'Active' })
      .exec();
    let activeSubscription: any = null;
    if (activeSub) {
      const plan = await this.planModel
        .findOne({ numericId: activeSub.subscriptionPlanId })
        .exec();
      activeSubscription = {
        id: activeSub.numericId,
        subscriptionPlanId: activeSub.subscriptionPlanId,
        subscriptionPlanName: plan?.name ?? null,
        // The frozen price, not the plan's current one — see snapshot-price.ts.
        subscriptionPlanPrice: resolveSubscriptionPrice(activeSub, plan),
        startDate: activeSub.startDate?.toISOString() ?? null,
        endDate: activeSub.endDate?.toISOString() ?? null,
        status: activeSub.status,
        cancellationStatus: activeSub.cancellationStatus ?? 'None',
      };
    }
    // Grade is stored as an id; resolve the name for display. A grade that was
    // since deleted resolves to null rather than breaking the row.
    const [grade, route, bus] = await Promise.all([
      child.gradeLevelId
        ? this.gradeModel.findOne({ numericId: child.gradeLevelId }).exec()
        : Promise.resolve(null),
      child.routeId
        ? this.routeModel.findOne({ numericId: child.routeId }).exec()
        : Promise.resolve(null),
      child.busId
        ? this.busModel.findOne({ numericId: child.busId }).exec()
        : Promise.resolve(null),
    ]);

    return {
      id: child.numericId,
      guardianId: child.guardianId,
      guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : null,
      guardianPhone: guardian?.phoneNumber ?? null,
      name: child.name,
      gradeLevelId: child.gradeLevelId ?? null,
      gradeLevelName: grade?.name ?? null,
      routeId: child.routeId ?? null,
      routeName: route?.name ?? null,
      busId: child.busId ?? null,
      busNumber: bus?.busNumber ?? null,
      // `fullName` kept as an alias so existing UI that reads child.fullName
      // keeps working without change.
      fullName: child.name,
      email: child.email ?? null,
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      gender: child.gender ?? null,
      dateOfBirth: child.dateOfBirth?.toISOString() ?? null,
      status: child.status,
      activeSubscription,
      createdAt: (child as any).createdAt ?? null,
    };
  }

  /** Loads a child and asserts the given guardian owns it. */
  private async loadOwned(id: number, guardianId: number): Promise<ChildDocument> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');
    if (child.guardianId !== guardianId) {
      throw new ForbiddenException('You do not have access to this child.');
    }
    return child;
  }

  /**
   * Turns an email field into what should actually be stored.
   *
   * Returns `undefined` for "leave alone" and `null` for "clear it", so a
   * blank submitted field removes the address rather than storing an empty
   * string that every `if (child.email)` check would then treat as absent
   * anyway while still showing up in exports.
   */
  private normaliseEmail(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim().toLowerCase();
    return trimmed === '' ? null : trimmed;
  }

  async createForGuardian(guardianId: number, dto: CreateChildDto): Promise<ApiResponse<any>> {
    const email = this.normaliseEmail(dto.email);
    const child = await this.childModel.create({
      ...dto,
      email: email ?? undefined,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      guardianId,
      status: 'Active',
    });
    return createApiResponse(await this.toViewModel(child), 'Child added successfully');
  }

  async getMyChildren(guardianId: number): Promise<ApiResponse<any[]>> {
    const children = await this.childModel
      .find({ guardianId, status: 'Active' })
      .sort({ createdAt: 1 })
      .exec();
    const data = await Promise.all(children.map((c) => this.toViewModel(c)));
    return createApiResponse(data, null, true, data.length);
  }

  async update(id: number, guardianId: number, dto: UpdateChildDto): Promise<ApiResponse<any>> {
    const child = await this.loadOwned(id, guardianId);
    return this.applyDetailsPatch(child._id, id, dto);
  }

  /**
   * Admin edit of any child, with no guardian-ownership restriction.
   *
   * Shares its implementation with the guardian path so the two cannot
   * validate or normalise differently, and takes the child's `_id` plus the
   * patch rather than the DTO shape, which is what a future bulk endpoint
   * (`PATCH /api/Child/bulk-assignment`) needs to reuse it — the plan asked
   * for the data model to stay bulk-ready without a bulk screen in scope.
   */
  async adminUpdate(id: number, dto: AdminUpdateChildDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<any>> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');

    const before = {
      name: child.name,
      email: child.email ?? null,
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      gradeLevelId: child.gradeLevelId ?? null,
    };

    const result = await this.applyDetailsPatch(child._id, id, dto);

    // Admin edits cross family boundaries, so they leave a trail; the
    // guardian path editing their own child does not need one.
    await this.auditService.record({
      entityType: 'Child',
      entityId: id,
      action: 'child.adminUpdate',
      before,
      after: result.data ?? {},
      actorId: actor?.numericId,
      actorRole: actor?.role,
    });

    return result;
  }

  /** Shared write path for both the guardian and admin detail edits. */
  private async applyDetailsPatch(
    objectId: any,
    numericId: number,
    dto: UpdateChildDto | AdminUpdateChildDto,
  ): Promise<ApiResponse<any>> {
    const { email, ...rest } = dto as any;
    const patch: any = { ...rest };
    const unset: any = {};

    if (dto.dateOfBirth !== undefined) {
      patch.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }

    const normalisedEmail = this.normaliseEmail(email);
    if (normalisedEmail === null) unset.email = '';
    else if (normalisedEmail !== undefined) patch.email = normalisedEmail;

    const update: any = {};
    if (Object.keys(patch).length) update.$set = patch;
    if (Object.keys(unset).length) update.$unset = unset;

    if (Object.keys(update).length) {
      await this.childModel.findByIdAndUpdate(objectId, update);
    }

    const updated = await this.findByNumericId(numericId);
    return createApiResponse(await this.toViewModel(updated!), 'Child updated successfully');
  }

  /**
   * Soft-remove: mark the child Inactive (never hard-delete — payments,
   * subscriptions and bookings reference the numericId). Also cancel any
   * active subscription the child has so it stops counting as active.
   */
  async remove(id: number, guardianId: number): Promise<ApiResponse<boolean>> {
    const child = await this.loadOwned(id, guardianId);
    // Clearing routeId/busId frees the reserved seat. Occupancy counts every
    // assigned child, so a removed child that kept its busId would hold a seat
    // on a bus forever.
    await this.childModel.findByIdAndUpdate(child._id, {
      $set: { status: 'Inactive' },
      $unset: { routeId: '', busId: '' },
    });
    await this.subModel.updateMany(
      { studentId: child.numericId, isActive: true },
      { $set: { isActive: false, status: 'Cancelled', suspendReason: 'Child removed by guardian' } },
    );
    return createApiResponse(true, 'Child removed');
  }

  // ---- Admin ----

  async getById(id: number): Promise<ApiResponse<any>> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');
    return createApiResponse(await this.toViewModel(child));
  }

  async getByIdForGuardian(id: number, guardianId: number): Promise<ApiResponse<any>> {
    const child = await this.loadOwned(id, guardianId);
    return createApiResponse(await this.toViewModel(child));
  }

  async getByGuardian(guardianId: number): Promise<ApiResponse<any[]>> {
    const children = await this.childModel.find({ guardianId }).sort({ createdAt: 1 }).exec();
    const data = await Promise.all(children.map((c) => this.toViewModel(c)));
    return createApiResponse(data, null, true, data.length);
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const children = await this.childModel.find().sort({ createdAt: -1 }).exec();
    const data = await Promise.all(children.map((c) => this.toViewModel(c)));
    return createApiResponse(data, null, true, data.length);
  }

  /**
   * Admin assigns a child to a route and/or bus.
   *
   * Rules enforced here (all confirmed business rules):
   *  - the route must exist and be active;
   *  - the bus must exist, be Active, and belong to the child's route;
   *  - the bus must have a free seat, where occupancy counts EVERY assigned
   *    active child regardless of subscription or payment status, because an
   *    assignment is a reserved operational seat;
   *  - over-capacity is possible only with an explicit `allowOverCapacity`
   *    flag, and that override is written to the audit log.
   *
   * Clearing the route also clears the bus: a bus is only meaningful inside
   * its route, and leaving a stale busId would keep a seat occupied.
   */
  async assign(id: number, dto: AssignChildDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<any>> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');

    const before = { routeId: child.routeId ?? null, busId: child.busId ?? null };

    // `undefined` means "leave unchanged"; `null` means "clear".
    const nextRouteId = dto.routeId === undefined ? child.routeId ?? null : dto.routeId;
    let nextBusId = dto.busId === undefined ? child.busId ?? null : dto.busId;
    if (nextRouteId === null) nextBusId = null;

    if (nextRouteId !== null && nextRouteId !== undefined) {
      const route = await this.routeModel.findOne({ numericId: nextRouteId }).exec();
      if (!route) throw new NotFoundException('Route not found');
      // Only block when newly moving onto a disabled route — a child already
      // on a route that was since disabled keeps their place.
      if (route.isActive === false && nextRouteId !== child.routeId) {
        throw new AppException(
          409,
          ErrorCodes.CONFLICT,
          'That route is disabled and cannot take new students.',
        );
      }
    }

    let overrodeCapacity = false;
    if (nextBusId !== null && nextBusId !== undefined) {
      const bus = await this.busModel.findOne({ numericId: nextBusId }).exec();
      if (!bus) throw new NotFoundException('Bus not found');

      if (bus.routeId !== nextRouteId) {
        throw new AppException(
          409,
          ErrorCodes.CONFLICT,
          'That bus does not serve the selected route.',
        );
      }
      if (bus.status !== 'Active') {
        throw new AppException(
          409,
          ErrorCodes.CONFLICT,
          `That bus is ${bus.status} and cannot take students.`,
        );
      }

      // Re-count on every assignment; only count others, so re-saving a child
      // already on this bus never trips the limit.
      if (nextBusId !== child.busId) {
        const occupied = await this.childModel
          .countDocuments({ busId: nextBusId, status: 'Active', numericId: { $ne: child.numericId } })
          .exec();
        if (occupied >= (bus.capacity ?? 0)) {
          if (!dto.allowOverCapacity) {
            throw new AppException(
              409,
              ErrorCodes.CONFLICT,
              `Bus ${bus.busNumber} is full (${occupied}/${bus.capacity}). Choose another bus, or confirm an over-capacity assignment.`,
            );
          }
          overrodeCapacity = true;
        }
      }
    }

    const patch: any = {};
    const unset: any = {};
    if (nextRouteId === null) unset.routeId = ''; else patch.routeId = nextRouteId;
    if (nextBusId === null) unset.busId = ''; else patch.busId = nextBusId;

    const update: any = {};
    if (Object.keys(patch).length) update.$set = patch;
    if (Object.keys(unset).length) update.$unset = unset;

    await this.childModel.findByIdAndUpdate(child._id, update).exec();

    await this.auditService.record({
      entityType: 'Child',
      entityId: child.numericId,
      action: overrodeCapacity ? 'assignment.overCapacityOverride' : 'assignment.updated',
      before,
      after: { routeId: nextRouteId, busId: nextBusId },
      actorId: actor?.numericId,
      actorRole: actor?.role,
      note: overrodeCapacity ? 'Assigned to a bus that was already at capacity.' : undefined,
    });

    const updated = await this.findByNumericId(id);
    return createApiResponse(
      await this.toViewModel(updated!),
      overrodeCapacity ? 'Assignment saved — the bus is now over its capacity.' : 'Assignment saved',
    );
  }

  /** Internal helper for other services: active children owned by a guardian. */
  async findActiveOwned(guardianId: number, ids: number[]): Promise<ChildDocument[]> {
    return this.childModel
      .find({ numericId: { $in: ids }, guardianId, status: 'Active' })
      .exec();
  }

  /**
   * Everything the admin child detail page shows, in one request.
   *
   * Deliberately a single aggregated endpoint rather than letting the page
   * assemble it: doing this client-side would take one call for the child, one
   * for siblings, one for subscriptions, one for payments, one PER SUBSCRIPTION
   * for its instalments, one for the audit trail, and — because route change
   * requests cannot be filtered by child — a download of the entire request
   * queue. That is the N+1 case, so it is resolved here with bulk queries.
   *
   * Every monetary figure below is read from a stored snapshot. Nothing is
   * computed here, and nothing is computed on the client either.
   */
  async getDetail(id: number): Promise<ApiResponse<any>> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');

    const [guardian, siblings, subs, payments, requests, auditEntries] = await Promise.all([
      this.userModel.findOne({ numericId: child.guardianId }).exec(),
      this.childModel.find({ guardianId: child.guardianId, status: 'Active' }).sort({ createdAt: 1 }).exec(),
      this.subModel.find({ studentId: child.numericId }).sort({ createdAt: -1 }).exec(),
      // A multi-child payment records the first child in `studentId` and the
      // whole set in `childIds`, so both have to be matched.
      this.paymentModel
        .find({ $or: [{ studentId: child.numericId }, { childIds: child.numericId }] })
        .sort({ createdAt: -1 })
        .exec(),
      this.routeChangeRequestModel.find({ childId: child.numericId }).sort({ createdAt: -1 }).exec(),
      this.auditService.getForEntity('Child', child.numericId, 50),
    ]);

    const gradeIds = [
      ...new Set(
        [child.gradeLevelId, ...siblings.map((s) => s.gradeLevelId)].filter(
          (v): v is number => typeof v === 'number',
        ),
      ),
    ];
    // The child's own ids are included explicitly rather than relied on via
    // `siblings`: that list is Active children only, so viewing a removed
    // child would otherwise lose their route and bus names.
    const routeIds = [
      ...new Set(
        [
          child.routeId,
          ...siblings.map((s) => s.routeId),
          ...requests.flatMap((r) => [r.currentRouteId, r.requestedRouteId, r.appliedRouteId]),
        ].filter((v): v is number => typeof v === 'number'),
      ),
    ];
    const busIds = [
      ...new Set(
        [
          child.busId,
          ...siblings.map((s) => s.busId),
          ...requests.flatMap((r) => [r.currentBusId, r.preferredBusId, r.appliedBusId]),
        ].filter((v): v is number => typeof v === 'number'),
      ),
    ];
    const planIds = [
      ...new Set(
        [...subs.map((s) => s.subscriptionPlanId), ...payments.map((p) => p.subscriptionPlanId)].filter(
          (v): v is number => typeof v === 'number',
        ),
      ),
    ];

    const [grades, routes, buses, plans, installments, activeSiblingSubs] = await Promise.all([
      gradeIds.length ? this.gradeModel.find({ numericId: { $in: gradeIds } }).exec() : Promise.resolve([] as GradeLevelDocument[]),
      routeIds.length ? this.routeModel.find({ numericId: { $in: routeIds } }).exec() : Promise.resolve([] as TripRouteDocument[]),
      busIds.length ? this.busModel.find({ numericId: { $in: busIds } }).exec() : Promise.resolve([] as BusDocument[]),
      planIds.length ? this.planModel.find({ numericId: { $in: planIds } }).exec() : Promise.resolve([] as SubscriptionPlanDocument[]),
      subs.length
        ? this.installmentModel
            .find({ studentSubscriptionId: { $in: subs.map((s) => s.numericId) } })
            .sort({ index: 1 })
            .exec()
        : Promise.resolve([] as StudentInstallmentDocument[]),
      this.subModel
        .find({ studentId: { $in: siblings.map((s) => s.numericId) }, isActive: true, status: 'Active' })
        .exec(),
    ]);

    const gradeMap = new Map(grades.map((g) => [g.numericId, g] as [number, GradeLevelDocument]));
    const routeMap = new Map(routes.map((r) => [r.numericId, r] as [number, TripRouteDocument]));
    const busMap = new Map(buses.map((b) => [b.numericId, b] as [number, BusDocument]));
    const planMap = new Map(plans.map((p) => [p.numericId, p] as [number, SubscriptionPlanDocument]));
    const activeSubRiderIds = new Set(activeSiblingSubs.map((s) => s.studentId));

    const routeName = (rid?: number | null) => (rid != null ? routeMap.get(rid)?.name ?? null : null);
    const busNumber = (bid?: number | null) => (bid != null ? busMap.get(bid)?.busNumber ?? null : null);

    const currentRoute = child.routeId != null ? routeMap.get(child.routeId) ?? null : null;
    const currentBus = child.busId != null ? busMap.get(child.busId) ?? null : null;

    // Capacity context for the bus this child is actually on. Counts every
    // assigned active child, matching the assignment rule exactly.
    const busOccupancy = currentBus
      ? await this.childModel.countDocuments({ busId: currentBus.numericId, status: 'Active' }).exec()
      : 0;

    const now = new Date();
    const installmentsBySub = new Map<number, StudentInstallmentDocument[]>();
    for (const row of installments) {
      const list = installmentsBySub.get(row.studentSubscriptionId) ?? [];
      list.push(row);
      installmentsBySub.set(row.studentSubscriptionId, list);
    }

    return createApiResponse({
      child: {
        id: child.numericId,
        name: child.name,
        email: child.email ?? null,
        schoolName: child.schoolName,
        pickupAreaName: child.pickupAreaName,
        gradeLevelId: child.gradeLevelId ?? null,
        gradeLevelName: child.gradeLevelId != null ? gradeMap.get(child.gradeLevelId)?.name ?? null : null,
        gender: child.gender ?? null,
        dateOfBirth: child.dateOfBirth?.toISOString() ?? null,
        status: child.status,
        registeredAt: (child as any).createdAt?.toISOString?.() ?? null,
      },
      guardian: guardian
        ? {
            id: guardian.numericId,
            name: `${guardian.firstName} ${guardian.lastName}`.trim(),
            phoneNumber: guardian.phoneNumber ?? null,
          }
        : null,
      siblings: siblings.map((s) => ({
        id: s.numericId,
        name: s.name,
        isSelf: s.numericId === child.numericId,
        gradeLevelName: s.gradeLevelId != null ? gradeMap.get(s.gradeLevelId)?.name ?? null : null,
        routeName: routeName(s.routeId),
        busNumber: busNumber(s.busId),
        hasActiveSubscription: activeSubRiderIds.has(s.numericId),
      })),
      assignment: {
        routeId: currentRoute?.numericId ?? null,
        routeName: currentRoute?.name ?? null,
        // Routes saved before isActive existed read undefined and count as
        // active — the same convention the engine uses.
        routeIsActive: currentRoute ? currentRoute.isActive !== false : null,
        busId: currentBus?.numericId ?? null,
        busNumber: currentBus?.busNumber ?? null,
        busStatus: currentBus?.status ?? null,
        busCapacity: currentBus?.capacity ?? null,
        busAssignedStudents: currentBus ? busOccupancy : null,
        busAvailableSeats: currentBus ? Math.max(0, (currentBus.capacity ?? 0) - busOccupancy) : null,
      },
      subscriptions: subs.map((sub) => {
        const plan = planMap.get(sub.subscriptionPlanId) ?? null;
        const rows = installmentsBySub.get(sub.numericId) ?? [];
        return {
          id: sub.numericId,
          subscriptionPlanId: sub.subscriptionPlanId,
          subscriptionPlanName: plan?.name ?? null,
          subscriptionType: plan?.subscriptionType ?? null,
          startDate: sub.startDate?.toISOString() ?? null,
          endDate: sub.endDate?.toISOString() ?? null,
          isActive: sub.isActive,
          status: sub.status,
          cancellationStatus: sub.cancellationStatus ?? 'None',
          // Frozen at purchase. Falls back to the live plan price only for
          // rows created before snapshots existed — see snapshot-price.ts.
          price: resolveSubscriptionPrice(sub, plan),
          hasSnapshot: hasPricingSnapshot(sub),
          basePrice: sub.basePrice ?? null,
          pricingRuleId: sub.pricingRuleId ?? null,
          pricingRuleName: sub.pricingRuleName ?? null,
          gradeLevelName: sub.gradeLevelName ?? null,
          gradeGroupName: sub.gradeGroupName ?? null,
          academicTermId: sub.academicTermId ?? null,
          termName: sub.termName ?? null,
          siblingPosition: sub.siblingPosition ?? null,
          discountRuleId: sub.discountRuleId ?? null,
          discountType: sub.discountType ?? null,
          discountValue: sub.discountValue ?? null,
          discountAmount: sub.discountAmount ?? 0,
          discountReason: sub.discountReason ?? null,
          finalPrice: sub.finalPrice ?? null,
          installmentPlanId: sub.installmentPlanId ?? null,
          installmentPlanName: sub.installmentPlanSnapshot?.name ?? null,
          activateOnFirstInstallment: sub.installmentPlanSnapshot?.activateOnFirstInstallment ?? null,
          paidAmount: sub.paidAmount ?? null,
          remainingAmount: sub.remainingAmount ?? null,
          nextDueDate: sub.nextDueDate?.toISOString() ?? null,
          paymentState: sub.paymentState ?? null,
          installments: rows.map((row) => ({
            id: row.numericId,
            index: row.index,
            dueDate: row.dueDate?.toISOString() ?? null,
            gracePeriodDays: row.gracePeriodDays ?? 0,
            amount: row.amount,
            paidAmount: row.paidAmount ?? 0,
            outstanding: Math.max(0, (row.amount || 0) - (row.paidAmount || 0)),
            // Derived, never stored — there is no scheduler to flip a flag.
            status: isOverdue(row, now) ? 'Overdue' : row.status,
            isOverdue: isOverdue(row, now),
          })),
        };
      }),
      payments: payments.map((p) => ({
        id: p.numericId,
        amount: p.amount,
        originalAmount: p.originalAmount ?? null,
        discountAmount: p.discountAmount ?? null,
        status: p.status,
        paymentMethod: p.paymentMethod ?? null,
        paymentChannel: p.paymentChannel ?? null,
        paymentReferenceCode: p.paymentReferenceCode ?? null,
        subscriptionPlanName: planMap.get(p.subscriptionPlanId)?.name ?? null,
        childCount: p.childCount ?? 1,
        installmentIds: p.installmentIds ?? [],
        refundAmount: p.refundAmount ?? null,
        reviewedAt: p.reviewedAt?.toISOString() ?? null,
        createdAt: (p as any).createdAt?.toISOString?.() ?? null,
      })),
      routeChangeRequests: requests.map((r) => ({
        id: r.numericId,
        currentRouteName: routeName(r.currentRouteId),
        currentBusNumber: busNumber(r.currentBusId),
        requestedRouteName: routeName(r.requestedRouteId),
        preferredBusNumber: busNumber(r.preferredBusId),
        appliedRouteName: routeName(r.appliedRouteId),
        appliedBusNumber: busNumber(r.appliedBusId),
        reason: r.reason ?? null,
        status: r.status,
        adminNotes: r.adminNotes ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: (r as any).createdAt?.toISOString?.() ?? null,
      })),
      // Previous route/bus assignments, from the audit trail written on every
      // assignment change. Empty for a child last assigned before auditing
      // existed — the page says so rather than implying nothing ever changed.
      assignmentHistory: auditEntries.map((entry) => ({
        action: entry.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        note: entry.note ?? null,
        at: (entry as any).createdAt?.toISOString?.() ?? null,
      })),
    });
  }
}
