import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StudentSubscriptionDocument = StudentSubscription & Document;

@Schema({ timestamps: true, collection: 'studentsubscriptions' })
export class StudentSubscription {
  @Prop({ required: true })
  studentId: number;

  @Prop({ required: true })
  subscriptionPlanId: number;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'Active', enum: ['Active', 'Expired', 'Cancelled', 'Suspended', 'PendingActivation', 'PendingPayment'] })
  status: string;

  @Prop()
  paymentMethod: string;

  @Prop()
  paymentReferenceCode: string;

  @Prop()
  suspendReason: string;

  /**
   * Student-initiated cancellation request state. Legacy documents predate these
   * fields and read as undefined — always compare with `?? 'None'`.
   * Flow: student requests -> 'Pending' -> admin approves ('Approved', subscription
   * cancelled + payment refunded) or rejects ('Rejected', subscription stays active).
   */
  @Prop({ default: 'None', enum: ['None', 'Pending', 'Approved', 'Rejected'], index: true })
  cancellationStatus: string;

  @Prop()
  cancellationReason: string;

  @Prop()
  cancellationRequestedAt: Date;

  @Prop()
  cancellationReviewedById: number;

  @Prop()
  cancellationReviewedAt: Date;

  @Prop()
  cancellationReviewNotes: string;

  /** numericId of the Payment that was refunded when the cancellation was approved. */
  @Prop()
  cancelledPaymentId: number;

  // ---------------------------------------------------------------------
  // Pricing snapshot, frozen at purchase.
  //
  // Every read path prefers these over joining the live SubscriptionPlan.
  // Before they existed, changing a plan's price retroactively rewrote the
  // displayed price of every past subscription and every historical report
  // row — the plan called that out as a live data-integrity bug, and this
  // block is the fix.
  //
  // All optional: a legacy row has none of them, and falls back to the live
  // plan price exactly as it does today.
  // ---------------------------------------------------------------------

  /** Price before discounts — the matched rule's price, or the plan's own. */
  @Prop()
  basePrice: number;

  @Prop()
  pricingRuleId: number;

  /** Name copied, not joined, so a renamed or deleted rule can't rewrite history. */
  @Prop()
  pricingRuleName: string;

  @Prop()
  gradeLevelId: number;

  @Prop()
  gradeLevelName: string;

  @Prop()
  gradeGroupId: number;

  @Prop()
  gradeGroupName: string;

  @Prop()
  academicTermId: number;

  @Prop()
  termName: string;

  /**
   * Sibling-discount fields. Populated from plan phase 5 onwards; present now
   * so the snapshot written by the payment path has a stable shape.
   * `siblingPosition` is the family rank the discount was based on, frozen for
   * audit — a sibling leaving later must not change a completed sale.
   */
  @Prop()
  siblingPosition: number;

  @Prop()
  discountRuleId: number;

  @Prop({ enum: ['Fixed', 'Percentage'] })
  discountType: string;

  @Prop()
  discountValue: number;

  @Prop()
  discountAmount: number;

  @Prop()
  discountReason: string;

  /** What the guardian was actually charged for this child. */
  @Prop()
  finalPrice: number;

  // ---------------------------------------------------------------------
  // Instalment state (plan phase 6). Derived from the StudentInstallment rows
  // rather than maintained incrementally, so a retried settle can never leave
  // these disagreeing with the schedule they summarise.
  // ---------------------------------------------------------------------

  @Prop()
  installmentPlanId: number;

  /**
   * A frozen copy of the instalment plan as it was when this subscription was
   * sold. Editing the plan later must not rewrite a schedule already agreed.
   */
  @Prop({ type: Object })
  installmentPlanSnapshot: any;

  @Prop({ default: 0 })
  paidAmount: number;

  @Prop()
  remainingAmount: number;

  @Prop()
  nextDueDate: Date;

  @Prop({ enum: ['Unpaid', 'PartiallyPaid', 'Paid', 'Overdue'], index: true })
  paymentState: string;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const StudentSubscriptionSchema = SchemaFactory.createForClass(StudentSubscription);

StudentSubscriptionSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

StudentSubscriptionSchema.index({ studentId: 1 });
StudentSubscriptionSchema.index({ status: 1 });
StudentSubscriptionSchema.index({ subscriptionPlanId: 1 });
