import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { StudentInstallment, StudentInstallmentDocument } from './student-installment.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { createWithNumericId } from '../../common/ids/next-numeric-id';
import { roundMoney } from '../../common/money/round';
import { buildSchedule, isOverdue, SchedulePlanInput, ScheduleTermInput } from './schedule';
import { rollPaymentState } from './payment-state';

@Injectable()
export class InstallmentService {
  constructor(
    @InjectModel(StudentInstallment.name) private installmentModel: Model<StudentInstallmentDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
  ) {}

  /**
   * Materialises one child's schedule.
   *
   * Idempotent by construction: rows are keyed by
   * `{studentSubscriptionId, index}` with a unique index, and an existing
   * schedule is returned untouched rather than duplicated. That matters
   * because generation runs inside the payment-accept flow, which falls back
   * to non-atomic sequential writes on the standalone production MongoDB — a
   * retry after a partial failure must not create a second copy.
   *
   * Rows are created one at a time through `createWithNumericId` rather than
   * with `insertMany`, which bypasses the pre('save') hook and would leave
   * every row without a numericId until the next boot's migration.
   */
  async generateSchedule(
    subscription: StudentSubscriptionDocument,
    total: number,
    plan: SchedulePlanInput,
    context: { purchasedAt: Date; term?: ScheduleTermInput | null },
    session?: ClientSession,
  ): Promise<StudentInstallmentDocument[]> {
    const existing = await this.installmentModel
      .find({ studentSubscriptionId: subscription.numericId })
      .sort({ index: 1 })
      .session(session ?? null)
      .exec();

    if (existing.length) return existing;

    const rows = buildSchedule(total, plan, context);
    const created: StudentInstallmentDocument[] = [];

    for (const row of rows) {
      created.push(
        (await createWithNumericId(this.installmentModel, {
          studentSubscriptionId: subscription.numericId,
          childId: subscription.studentId,
          index: row.index,
          dueDate: row.dueDate,
          gracePeriodDays: row.gracePeriodDays,
          amount: row.amount,
          paidAmount: 0,
          status: 'Pending',
          paymentIds: [],
        })) as StudentInstallmentDocument,
      );
    }

    return created;
  }

  async findBySubscription(subscriptionId: number): Promise<StudentInstallmentDocument[]> {
    return this.installmentModel.find({ studentSubscriptionId: subscriptionId }).sort({ index: 1 }).exec();
  }

  async findByNumericIds(ids: number[]): Promise<StudentInstallmentDocument[]> {
    if (!ids.length) return [];
    return this.installmentModel.find({ numericId: { $in: ids } }).sort({ index: 1 }).exec();
  }

  /** The outstanding balance on one instalment. */
  outstandingOf(row: { amount: number; paidAmount?: number | null }): number {
    return roundMoney(Math.max(0, (row.amount || 0) - (row.paidAmount || 0)));
  }

  /**
   * Applies `amount` to one instalment and records the payment against it.
   *
   * Overpayment is rejected rather than silently absorbed — the plan's rule —
   * so a mis-entered figure surfaces as an error instead of a credit nobody
   * can account for. The conditional update guards the concurrent case: two
   * admins accepting two payments for the same instalment cannot both apply,
   * because the second sees a `paidAmount` that no longer matches.
   */
  async settle(
    installmentId: number,
    amount: number,
    paymentId: number,
    session?: ClientSession,
  ): Promise<StudentInstallmentDocument> {
    const row = await this.installmentModel
      .findOne({ numericId: installmentId })
      .session(session ?? null)
      .exec();
    if (!row) throw new NotFoundException('Instalment not found');
    if (row.status === 'Cancelled') {
      throw new AppException(409, ErrorCodes.CONFLICT, 'That instalment has been cancelled.');
    }

    const applied = roundMoney(amount);
    const outstanding = this.outstandingOf(row);
    if (applied > outstanding) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        `That payment exceeds the ${outstanding} still owed on instalment ${row.index}.`,
      );
    }

    const nextPaid = roundMoney((row.paidAmount || 0) + applied);
    const nextStatus = nextPaid >= row.amount ? 'Paid' : nextPaid > 0 ? 'PartiallyPaid' : 'Pending';

    const updated = await this.installmentModel
      .findOneAndUpdate(
        // Conditional on the paidAmount we just read — a competing settle that
        // won the race changes it, and this update then matches nothing.
        { numericId: installmentId, paidAmount: row.paidAmount || 0 },
        {
          $set: { paidAmount: nextPaid, status: nextStatus },
          $addToSet: { paymentIds: paymentId },
        },
        { new: true, session },
      )
      .exec();

    if (!updated) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        'That instalment was updated by someone else. Reload and try again.',
      );
    }

    return updated;
  }

  /**
   * Recomputes a subscription's payment state from its rows.
   *
   * Derived rather than incremented, so a retried or partially applied settle
   * can never leave the subscription disagreeing with its own schedule.
   */
  async rollSubscriptionState(
    subscriptionId: number,
    session?: ClientSession,
  ): Promise<void> {
    const rows = await this.installmentModel
      .find({ studentSubscriptionId: subscriptionId })
      .session(session ?? null)
      .exec();
    if (!rows.length) return;

    const state = rollPaymentState(rows);
    await this.subModel
      .findOneAndUpdate(
        { numericId: subscriptionId },
        {
          $set: {
            paidAmount: state.paidAmount,
            remainingAmount: state.remainingAmount,
            nextDueDate: state.nextDueDate,
            paymentState: state.paymentState,
          },
        },
        { session },
      )
      .exec();
  }

  /** View model with the derived overdue state applied. */
  private toViewModel(row: StudentInstallmentDocument, now: Date): any {
    const overdue = isOverdue(row, now);
    return {
      id: row.numericId,
      studentSubscriptionId: row.studentSubscriptionId,
      childId: row.childId,
      index: row.index,
      dueDate: row.dueDate?.toISOString() ?? null,
      gracePeriodDays: row.gracePeriodDays ?? 0,
      amount: row.amount,
      paidAmount: row.paidAmount ?? 0,
      outstanding: this.outstandingOf(row),
      // 'Overdue' is derived, never stored — there is no scheduler here to
      // flip a stored flag when a date passes, so a stored one would go stale.
      status: overdue ? 'Overdue' : row.status,
      isOverdue: overdue,
      paymentIds: row.paymentIds ?? [],
    };
  }

  async getScheduleResponse(subscriptionId: number): Promise<ApiResponse<any[]>> {
    const rows = await this.findBySubscription(subscriptionId);
    const now = new Date();
    const data = rows.map((row) => this.toViewModel(row, now));
    return createApiResponse(data, null, true, data.length);
  }

  /** Outstanding instalments for a set of children, for the guardian's "pay next" view. */
  async getOutstandingForChildren(childIds: number[]): Promise<ApiResponse<any[]>> {
    if (!childIds.length) return createApiResponse([], null, true, 0);

    const rows = await this.installmentModel
      .find({ childId: { $in: childIds }, status: { $in: ['Pending', 'PartiallyPaid'] } })
      .sort({ dueDate: 1 })
      .exec();

    const now = new Date();
    const data = rows.map((row) => this.toViewModel(row, now));
    return createApiResponse(data, null, true, data.length);
  }
}
