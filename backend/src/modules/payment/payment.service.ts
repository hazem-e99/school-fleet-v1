import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from './payment.schema';
import { User, UserDocument } from '../users/user.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscription-plan/subscription-plan.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { AcademicTerm, AcademicTermDocument } from '../academic-term/academic-term.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { resolveSubscriptionDates } from '../../common/subscription/subscription-dates';
import { PricingService } from '../pricing/pricing.service';
import { InstallmentService } from '../installment/installment.service';
import { InstallmentPlanService } from '../installment/installment-plan.service';

/** Report bucket keys. 'unknown' covers legacy payments saved before paymentChannel existed. */
export const PAYMENT_CHANNELS = ['instapay', 'vodafone', 'cash', 'visa'] as const;
export const REPORT_CHANNEL_KEYS = ['instapay', 'vodafone', 'cash', 'visa', 'unknown'] as const;

/** Which paymentMethod each channel is only valid with. */
const CHANNEL_METHOD: Record<string, string> = {
  instapay: 'Online',
  vodafone: 'Online',
  cash: 'Offline',
  visa: 'Offline',
};

@Injectable()
export class PaymentService {
  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(SubscriptionPlan.name) private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(AcademicTerm.name) private termModel: Model<AcademicTermDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly pricingService: PricingService,
    private readonly installmentService: InstallmentService,
    private readonly installmentPlanService: InstallmentPlanService,
  ) {}

  private getNumericId(doc: any): number {
    return parseInt((doc._id as any).toString().slice(-8), 16) % 100000;
  }

  /** child-first name resolution: `studentId` now holds a Child numericId (legacy rows may hold a Student User id). */
  private async resolveRider(numericId: number): Promise<{ name: string | null; guardianId: number | null; schoolName: string | null }> {
    const child = await this.childModel.findOne({ numericId }).exec();
    if (child) {
      return {
        name: child.name,
        guardianId: child.guardianId,
        schoolName: child.schoolName,
      };
    }
    const user = await this.userModel.findOne({ numericId }).exec();
    return {
      name: user ? `${user.firstName} ${user.lastName}`.trim() : null,
      guardianId: null,
      schoolName: null,
    };
  }

  private async toViewModel(payment: PaymentDocument): Promise<any> {
    const id = this.getNumericId(payment);
    const rider = await this.resolveRider(payment.studentId);
    const plan = await this.findByNumericId(this.planModel, payment.subscriptionPlanId);
    const reviewer = payment.adminReviewedById
      ? await this.findByNumericId(this.userModel, payment.adminReviewedById)
      : null;
    const refunder = payment.refundedBy
      ? await this.findByNumericId(this.userModel, payment.refundedBy)
      : null;

    let childNames: string[] | null = null;
    if (payment.childIds && payment.childIds.length > 1) {
      const kids = await this.childModel.find({ numericId: { $in: payment.childIds } }).exec();
      childNames = kids.map((k) => k.name);
    }

    return {
      id,
      studentId: payment.studentId,
      studentName: rider.name,
      childIds: payment.childIds ?? null,
      childCount: payment.childCount ?? 1,
      childNames,
      subscriptionPlanId: payment.subscriptionPlanId,
      subscriptionPlanName: plan?.name || null,
      amount: payment.amount,
      subscriptionCode: payment.subscriptionCode || null,
      paymentMethod: payment.paymentMethod,
      paymentMethodText: payment.paymentMethod,
      paymentChannel: payment.paymentChannel || null,
      paymentReferenceCode: payment.paymentReferenceCode || null,
      status: payment.status,
      statusText: payment.status,
      adminReviewedById: payment.adminReviewedById || null,
      adminReviewedByName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : null,
      reviewedAt: payment.reviewedAt?.toISOString() || null,
      refundAmount: payment.refundAmount ?? null,
      refundedAt: payment.refundedAt?.toISOString() || null,
      refundedByName: refunder ? `${refunder.firstName} ${refunder.lastName}` : null,
      refundReason: payment.refundReason || null,
      createdAt: (payment as any).createdAt,
      updatedAt: (payment as any).updatedAt || null,
    };
  }

  private async findByNumericId(model: Model<any>, numericId: number): Promise<any> {
    return model.findOne({ numericId }).exec();
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const payments = await this.paymentModel.find().sort({ createdAt: -1 }).exec();
    const vms = await Promise.all(payments.map((p) => this.toViewModel(p)));
    return createApiResponse(vms, null, true, vms.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const payment = await this.paymentModel.findOne({ numericId: id }).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    return createApiResponse(await this.toViewModel(payment));
  }

  /**
   * A guardian pays for one or more of their children. `userId` is the
   * guardian's numericId. `dto.childIds` is the set of children this payment
   * covers (1..N); the total is `plan.price * childIds.length`. On admin
   * Accept, review() fans this out into one StudentSubscription per child.
   */
  async create(dto: any, userId: number): Promise<ApiResponse<boolean>> {
    const plan = await this.findByNumericId(this.planModel, dto.subscriptionPlanId);
    if (!plan) {
      throw new NotFoundException('The selected subscription plan could not be found.');
    }

    // A channel implies its payment method — reject incoherent combinations rather
    // than silently storing a channel that contradicts the method.
    if (dto.paymentChannel) {
      const expectedMethod = CHANNEL_METHOD[dto.paymentChannel];
      if (expectedMethod && dto.paymentMethod && expectedMethod !== dto.paymentMethod) {
        throw new AppException(
          400,
          ErrorCodes.VALIDATION_ERROR,
          'The selected payment channel does not match the payment method.',
        );
      }
    }

    const childIds: number[] = Array.isArray(dto.childIds)
      ? Array.from(
          new Set(
            (dto.childIds as any[])
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n)),
          ),
        )
      : [];
    if (childIds.length === 0) {
      throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'Select at least one child to subscribe.');
    }

    // The one place a total is derived. Anything the client sent as an amount
    // is ignored — quote() recomputes from the plan, the matched pricing rule
    // and each child's grade, and it performs the same guardian-ownership
    // check this method used to do inline (same filter, same 403), so the
    // basket is validated and priced in a single pass.
    const installmentPlanId =
      dto.installmentPlanId !== undefined && dto.installmentPlanId !== null
        ? Number(dto.installmentPlanId)
        : undefined;

    const quote = await this.pricingService.quote({
      subscriptionPlanId: plan.numericId,
      childIds,
      restrictToGuardianId: userId,
      installmentPlanId,
    });

    // Paying by instalments changes only WHAT IS DUE NOW: the guardian pays
    // the first instalment for each child rather than the full price. The
    // quote — and therefore the subscription's snapshot — is unchanged, so the
    // agreed price stays the same however it is paid.
    //
    // The figure comes from the same preview the guardian was shown, rather
    // than being recomputed here, so the amount charged and the amount
    // displayed cannot drift apart.
    const amountDueNow = quote.installment?.amountDueNow ?? quote.totals.final;

    const installmentPlanSnapshot = installmentPlanId
      ? (
          await this.installmentPlanService.loadForPurchase(installmentPlanId, plan.numericId, new Date())
        ).toObject()
      : null;

    const { childIds: _omit, installmentPlanId: _omitPlan, ...rest } = dto;
    await this.paymentModel.create({
      ...rest,
      studentId: childIds[0],
      childIds,
      childCount: childIds.length,
      amount: amountDueNow,
      originalAmount: quote.totals.base,
      discountAmount: quote.totals.discount,
      // Frozen here so review() can activate against what was actually paid,
      // however long the payment sat in the queue.
      pricingSnapshot: quote.lines,
      installmentPlanId: installmentPlanSnapshot ? installmentPlanId : undefined,
      installmentPlanSnapshot: installmentPlanSnapshot ?? undefined,
      status: 'Pending',
    });
    return createApiResponse(true, 'Payment created successfully');
  }

  async delete(id: number): Promise<ApiResponse<boolean>> {
    const payment = await this.paymentModel.findOne({ numericId: id }).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    await this.paymentModel.findByIdAndDelete(payment._id);
    return createApiResponse(true, 'Payment deleted');
  }

  /**
   * Copies one child's priced line onto the subscription. These fields are the
   * historical record: every read path prefers them over joining the live
   * plan, so changing a price or renaming a grade later cannot rewrite what a
   * guardian was charged.
   *
   * Returns an empty object for a legacy payment with no snapshot, leaving the
   * subscription exactly as it would have been written before phase 4.
   */
  private buildPricingSnapshot(line: any | null): Record<string, any> {
    if (!line) return {};
    return {
      basePrice: line.basePrice,
      pricingRuleId: line.pricingRuleId ?? null,
      pricingRuleName: line.pricingRuleName ?? null,
      gradeLevelId: line.gradeLevelId ?? null,
      gradeLevelName: line.gradeLevelName ?? null,
      gradeGroupId: line.gradeGroupId ?? null,
      gradeGroupName: line.gradeGroupName ?? null,
      academicTermId: line.academicTermId ?? null,
      termName: line.academicTermName ?? null,
      siblingPosition: line.siblingPosition ?? null,
      discountRuleId: line.discountRuleId ?? null,
      discountType: line.discountType ?? null,
      discountValue: line.discountValue ?? null,
      discountAmount: line.discountAmount ?? 0,
      discountReason: line.discountReason ?? null,
      finalPrice: line.finalPrice,
    };
  }

  /** Create-or-refresh the active subscription for a single rider (child). */
  private async activateSubscriptionForRider(
    riderId: number,
    payment: PaymentDocument,
    plan: any,
    subscriptionCode: string | null,
    pricingLine: any | null = null,
  ): Promise<StudentSubscriptionDocument> {
    // Dates come from the priced line when there is one: the pricing rule that
    // matched may have bound the subscription to an academic term, in which
    // case the term's real calendar dates win over day arithmetic. Falling
    // back to the resolver with a null term reproduces the previous
    // `now + durationInDays` behaviour byte for byte, 30-day default included.
    const snapshotStart = pricingLine?.startDate ? new Date(pricingLine.startDate) : null;
    const snapshotEnd = pricingLine?.endDate ? new Date(pricingLine.endDate) : null;
    const usableSnapshotDates =
      snapshotStart && snapshotEnd && !Number.isNaN(snapshotStart.getTime()) && !Number.isNaN(snapshotEnd.getTime());

    const { startDate, endDate } = usableSnapshotDates
      ? { startDate: snapshotStart as Date, endDate: snapshotEnd as Date }
      : resolveSubscriptionDates(plan, null);

    const snapshot = this.buildPricingSnapshot(pricingLine);

    // Under an instalment plan the subscription may deliberately NOT activate
    // until the schedule is fully paid — a per-plan decision, not a global
    // rule. Without instalments this is 'Active', exactly as before.
    const installmentPlan = payment.installmentPlanSnapshot ?? null;
    const activatesNow = !installmentPlan || installmentPlan.activateOnFirstInstallment !== false;
    const status = activatesNow ? 'Active' : 'PendingActivation';
    const installmentFields = installmentPlan
      ? { installmentPlanId: payment.installmentPlanId, installmentPlanSnapshot: installmentPlan }
      : {};

    const existing = await this.subModel.findOne({
      studentId: riderId,
      isActive: true,
      status: 'Active',
    }).exec();

    if (!existing) {
      return await this.subModel.create({
        studentId: riderId,
        subscriptionPlanId: payment.subscriptionPlanId,
        startDate,
        endDate,
        isActive: activatesNow,
        status,
        paymentMethod: payment.paymentMethod,
        paymentReferenceCode: payment.paymentReferenceCode || subscriptionCode || null,
        cancellationStatus: 'None',
        ...snapshot,
        ...installmentFields,
      });
    } else {
      // Reusing an existing subscription row: clear any prior cancellation state,
      // otherwise a re-subscribed rider inherits a stale Approved/Rejected flag.
      return (await this.subModel.findByIdAndUpdate(
        existing._id,
        {
        subscriptionPlanId: payment.subscriptionPlanId,
        startDate,
        endDate,
        isActive: activatesNow,
        status,
        paymentMethod: payment.paymentMethod,
        cancellationStatus: 'None',
        cancellationReason: null,
        cancellationRequestedAt: null,
        cancellationReviewedById: null,
        cancellationReviewedAt: null,
        cancellationReviewNotes: null,
        cancelledPaymentId: null,
        // A re-subscribed rider is re-priced by this payment, so the snapshot
        // is replaced rather than merged — leaving the old one would report a
        // price the guardian is no longer paying.
        ...snapshot,
        ...installmentFields,
        },
        { new: true },
      ).exec()) as StudentSubscriptionDocument;
    }
  }

  /**
   * Materialises this child's schedule and settles the instalment this payment
   * covers.
   *
   * Deliberately ordered to be correct WITHOUT a transaction, because the
   * production VPS runs a standalone mongod where one is unavailable:
   *
   *   1. generate the schedule — idempotent via the unique
   *      {studentSubscriptionId, index} key, so a retry re-reads rather than
   *      duplicating;
   *   2. settle, guarded by a conditional update on the paidAmount just read,
   *      and skipped entirely if this payment is already recorded against the
   *      row — so a retry cannot double-credit;
   *   3. roll the subscription state, which is DERIVED from the rows and so is
   *      simply recomputed correctly whenever it runs.
   *
   * A failure at any step leaves a state the same call can safely repeat.
   */
  private async applyInstallmentsForRider(
    subscription: StudentSubscriptionDocument,
    payment: PaymentDocument,
    pricingLine: any | null,
  ): Promise<void> {
    const installmentPlan = payment.installmentPlanSnapshot ?? null;
    if (!installmentPlan) return;

    const total = pricingLine?.finalPrice ?? subscription.finalPrice ?? 0;
    const purchasedAt = subscription.startDate ?? new Date();

    const rows = await this.installmentService.generateSchedule(subscription, total, installmentPlan, {
      purchasedAt,
      // The term the pricing rule bound this subscription to, if any — it is
      // what TermStartOffset and TermDueDate rules anchor to.
      term: pricingLine?.academicTermId ? await this.loadTermForLine(pricingLine) : null,
    });

    const first = rows.find((r) => r.index === Math.min(...rows.map((x) => x.index)));
    if (first && !(first.paymentIds ?? []).includes(payment.numericId)) {
      const due = this.installmentService.outstandingOf(first);
      if (due > 0) {
        await this.installmentService.settle(first.numericId, due, payment.numericId);
        await this.paymentModel.findByIdAndUpdate(payment._id, {
          $addToSet: { installmentIds: first.numericId },
        });
      }
    }

    await this.installmentService.rollSubscriptionState(subscription.numericId);
  }

  /** The academic term a priced line was bound to, for term-anchored due dates. */
  private async loadTermForLine(pricingLine: any): Promise<any | null> {
    if (!pricingLine?.academicTermId) return null;
    return this.termModel.findOne({ numericId: pricingLine.academicTermId }).exec();
  }

  async review(id: number, dto: any, adminId: number): Promise<ApiResponse<boolean>> {
    const payment = await this.paymentModel.findOne({ numericId: id }).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    await this.paymentModel.findByIdAndUpdate(payment._id, {
      status: dto.status,
      subscriptionCode: dto.subscriptionCode,
      reviewNotes: dto.reviewNotes,
      adminReviewedById: adminId,
      reviewedAt: new Date(),
    });

    if (dto.status === 'Accepted') {
      const plan = await this.findByNumericId(this.planModel, payment.subscriptionPlanId);
      const riderIds =
        payment.childIds && payment.childIds.length > 0
          ? payment.childIds
          : [payment.studentId];

      for (const riderId of riderIds) {
        // The line priced for THIS child at purchase time. Null for a payment
        // raised before snapshots existed, which dates and prices itself from
        // the live plan exactly as it always did.
        const line = payment.pricingSnapshot?.find((l: any) => l?.childId === riderId) ?? null;
        const subscription = await this.activateSubscriptionForRider(
          riderId,
          payment,
          plan,
          dto.subscriptionCode || null,
          line,
        );
        await this.applyInstallmentsForRider(subscription, payment, line);
      }

      // Notify the guardian (resolved from the first child), not the child rows.
      const firstChild = await this.childModel.findOne({ numericId: riderIds[0] }).exec();
      if (firstChild) {
        try {
          await this.notificationsService.broadcast({
            userIds: [firstChild.guardianId],
            title: 'Subscription activated',
            message:
              riderIds.length > 1
                ? `Your payment was approved. ${riderIds.length} children are now subscribed to ${plan?.name || 'the plan'}.`
                : `Your payment was approved. Your child is now subscribed to ${plan?.name || 'the plan'}.`,
            type: 'Alert',
          });
        } catch {
          // best-effort — never fail the review over a notification
        }
      }
    }

    return createApiResponse(true, 'Payment reviewed');
  }

  /**
   * A guardian's payments — payments are keyed by child numericId (in
   * `studentId` and/or `childIds`), so resolve the guardian's children first.
   * Falls back to `{ studentId: userId }` for a legacy self-serve student.
   */
  async getMyPayments(userId: number): Promise<ApiResponse<any[]>> {
    const children = await this.childModel.find({ guardianId: userId }).exec();
    const childIds = children.map((c) => c.numericId);
    const query = childIds.length
      ? { $or: [{ studentId: { $in: childIds } }, { childIds: { $in: childIds } }] }
      : { studentId: userId };
    const payments = await this.paymentModel.find(query).sort({ createdAt: -1 }).exec();
    const vms = await Promise.all(payments.map((p) => this.toViewModel(p)));
    return createApiResponse(vms, null, true, vms.length);
  }

  async getByStatus(status: string): Promise<ApiResponse<any[]>> {
    const payments = await this.paymentModel.find({ status }).exec();
    const vms = await Promise.all(payments.map((p) => this.toViewModel(p)));
    return createApiResponse(vms, null, true, vms.length);
  }

  async getPending(): Promise<ApiResponse<any[]>> {
    return this.getByStatus('Pending');
  }

  async getByStudent(studentId: number): Promise<ApiResponse<any[]>> {
    const payments = await this.paymentModel.find({ studentId }).exec();
    const vms = await Promise.all(payments.map((p) => this.toViewModel(p)));
    return createApiResponse(vms, null, true, vms.length);
  }

  async getBySubscriptionPlan(planId: number): Promise<ApiResponse<any[]>> {
    const payments = await this.paymentModel.find({ subscriptionPlanId: planId }).exec();
    const vms = await Promise.all(payments.map((p) => this.toViewModel(p)));
    return createApiResponse(vms, null, true, vms.length);
  }

  async getStatistics(): Promise<ApiResponse<any>> {
    const all = await this.paymentModel.find().exec();
    const stats = {
      totalPayments: all.length,
      pendingPayments: all.filter((p) => p.status === 'Pending').length,
      acceptedPayments: all.filter((p) => p.status === 'Accepted').length,
      rejectedPayments: all.filter((p) => p.status === 'Rejected').length,
      totalAmount: all.reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: all.filter((p) => p.status === 'Pending').reduce((sum, p) => sum + p.amount, 0),
      paymentsByMonth: [],
    };
    return createApiResponse(stats);
  }

  /**
   * Admin subscription/revenue report. Loads each collection once and resolves
   * student/plan names through in-memory Maps rather than the per-row lookups
   * toViewModel does, so it stays a fixed 3 queries regardless of payment count.
   *
   * "Subscribed students" counts DISTINCT studentIds holding an Accepted payment —
   * a student who upgraded has two Accepted rows but is one subscriber.
   */
  async getSubscriptionReport(): Promise<ApiResponse<any>> {
    const [payments, children, guardians, plans] = await Promise.all([
      this.paymentModel.find().sort({ createdAt: -1 }).exec(),
      this.childModel.find().exec(),
      this.userModel.find({ role: 'Guardian' }).select('-password').exec(),
      this.planModel.find().exec(),
    ]);

    const childMap = new Map<number, any>(children.map((c) => [c.numericId, c]));
    const guardianMap = new Map<number, any>(guardians.map((g) => [g.numericId, g]));
    const activeChildren = children.filter((c) => c.status === 'Active');
    const planMap = new Map<number, any>(plans.map((p) => [p.numericId, p]));

    const channelOf = (p: PaymentDocument) => p.paymentChannel || 'unknown';
    const accepted = payments.filter((p) => p.status === 'Accepted');
    const refunded = payments.filter((p) => p.status === 'Refunded');

    const byChannel = REPORT_CHANNEL_KEYS.map((channel) => {
      const channelAccepted = accepted.filter((p) => channelOf(p) === channel);
      const channelRefunded = refunded.filter((p) => channelOf(p) === channel);
      const grossAmount = channelAccepted.reduce((sum, p) => sum + (p.amount || 0), 0);
      const refundedAmount = channelRefunded.reduce((sum, p) => sum + (p.refundAmount ?? p.amount ?? 0), 0);
      return {
        channel,
        acceptedCount: channelAccepted.length,
        studentCount: new Set(channelAccepted.map((p) => p.studentId)).size,
        refundedCount: channelRefunded.length,
        grossAmount,
        refundedAmount,
        netAmount: grossAmount - refundedAmount,
      };
    });

    const byPlan = plans.map((plan) => {
      const planAccepted = accepted.filter((p) => p.subscriptionPlanId === plan.numericId);
      return {
        planId: plan.numericId,
        planName: plan.name,
        price: plan.price || 0,
        acceptedCount: planAccepted.length,
        studentCount: new Set(planAccepted.map((p) => p.studentId)).size,
        grossAmount: planAccepted.reduce((sum, p) => sum + (p.amount || 0), 0),
      };
    });

    const grossAmount = accepted.reduce((sum, p) => sum + (p.amount || 0), 0);
    const refundedAmount = refunded.reduce((sum, p) => sum + (p.refundAmount ?? p.amount ?? 0), 0);

    const totals = {
      totalStudents: activeChildren.length,
      subscribedStudents: new Set(
        accepted.flatMap((p) => (p.childIds && p.childIds.length ? p.childIds : [p.studentId])),
      ).size,
      totalPayments: payments.length,
      acceptedCount: accepted.length,
      pendingCount: payments.filter((p) => p.status === 'Pending').length,
      rejectedCount: payments.filter((p) => p.status === 'Rejected').length,
      refundedCount: refunded.length,
      grossAmount,
      pendingAmount: payments.filter((p) => p.status === 'Pending').reduce((sum, p) => sum + (p.amount || 0), 0),
      refundedAmount,
      netAmount: grossAmount - refundedAmount,
    };

    const details = payments.map((p) => {
      const child = childMap.get(p.studentId);
      const guardian = child ? guardianMap.get(child.guardianId) : null;
      const plan = planMap.get(p.subscriptionPlanId);
      return {
        paymentId: p.numericId,
        studentId: p.studentId,
        studentName: child ? child.name : null,
        childCount: p.childCount ?? 1,
        schoolName: child?.schoolName || null,
        guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : null,
        guardianPhone: guardian?.phoneNumber || null,
        planName: plan?.name || null,
        amount: p.amount || 0,
        paymentMethod: p.paymentMethod,
        paymentChannel: p.paymentChannel || null,
        status: p.status,
        paymentReferenceCode: p.paymentReferenceCode || null,
        refundAmount: p.refundAmount ?? null,
        createdAt: (p as any).createdAt || null,
        reviewedAt: p.reviewedAt || null,
      };
    });

    return createApiResponse({ totals, byChannel, byPlan, details, generatedAt: new Date().toISOString() });
  }
}
