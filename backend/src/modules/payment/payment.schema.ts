import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  /**
   * The rider this payment is for. For a single-child payment it's that
   * child's numericId; for a multi-child payment (guardian "subscribe all")
   * it's the FIRST child's numericId so existing `find({ studentId })` admin
   * queries still return the row — `childIds` carries the full set.
   */
  @Prop({ required: true })
  studentId: number;

  /** All children covered by this payment. Present for multi-child payments. */
  @Prop({ type: [Number], default: undefined })
  childIds: number[];

  /** Denormalised count — 1 for a single-child payment, N for a bulk one. */
  @Prop({ default: 1 })
  childCount: number;

  @Prop({ required: true })
  subscriptionPlanId: number;

  @Prop({ required: true })
  amount: number;

  @Prop()
  subscriptionCode: string;

  @Prop({ required: true, enum: ['Offline', 'Online'] })
  paymentMethod: string;

  /**
   * The specific channel the student paid through. Deliberately has NO default:
   * an absent field marks a legacy payment created before this was captured, and
   * those are reported under an "unknown" bucket rather than being mis-attributed.
   * 'instapay'/'vodafone' pair with paymentMethod 'Online'; 'cash'/'visa' with 'Offline'.
   */
  @Prop({ enum: ['instapay', 'vodafone', 'cash', 'visa'], index: true })
  paymentChannel: string;

  @Prop()
  paymentReferenceCode: string;

  @Prop({ default: 'Pending', enum: ['Pending', 'Accepted', 'Rejected', 'Cancelled', 'Expired', 'Refunded'] })
  status: string;

  @Prop()
  adminReviewedById: number;

  @Prop()
  reviewedAt: Date;

  @Prop()
  reviewNotes: string;

  // Set when an admin approves a subscription-cancellation request.
  @Prop()
  refundAmount: number;

  @Prop()
  refundedAt: Date;

  @Prop()
  refundedBy: number;

  @Prop()
  refundReason: string;

  /**
   * What the pricing engine returned when this payment was raised — one entry
   * per child, carrying that child's base price, matched rule, grade, term and
   * final price.
   *
   * Stored here rather than recomputed at review time on purpose. An admin may
   * accept a payment days after the guardian raised it, and a rule may have
   * changed in between; the subscription must record what was actually paid,
   * so review() copies these lines onto the subscriptions instead of asking
   * for a fresh quote. It also guarantees `amount` and the sum of the
   * children's final prices can never drift apart.
   *
   * Absent on legacy payments, which fall back to the live plan price.
   */
  @Prop({ type: [Object], default: undefined })
  pricingSnapshot: any[];

  /** Total before discounts. Equals `amount` until sibling discounts land. */
  @Prop()
  originalAmount: number;

  @Prop()
  discountAmount: number;

  /**
   * Set when the guardian chose to pay by instalments. `amount` is then the
   * FIRST instalment across all children on this payment, not the full price.
   * The snapshot is frozen here so editing the template later cannot rewrite a
   * schedule already agreed.
   */
  @Prop()
  installmentPlanId: number;

  @Prop({ type: Object })
  installmentPlanSnapshot: any;

  /**
   * Instalments this payment settled. Plural because one payment may settle an
   * instalment for several children at once — schedules are per child, but a
   * guardian pays for the family in one transaction.
   */
  @Prop({ type: [Number], default: undefined })
  installmentIds: number[];

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

PaymentSchema.index({ studentId: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ subscriptionPlanId: 1 });
