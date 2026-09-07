import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StudentInstallmentDocument = StudentInstallment & Document;

/**
 * One row of one child's payment schedule.
 *
 * Schedules are PER CHILD, never one combined family schedule: a guardian with
 * three children gets three independent schedules, and a single Payment may
 * settle one instalment from each (hence `Payment.installmentIds[]` and
 * `paymentIds[]` here).
 *
 * `Overdue` is deliberately NOT stored. There is no scheduler in this codebase
 * to flip rows when a date passes, and a stored flag would silently go stale;
 * it is derived on read from `dueDate + gracePeriodDays`. The stored `status`
 * only ever records what a payment did.
 */
@Schema({ timestamps: true, collection: 'studentinstallments' })
export class StudentInstallment {
  @Prop({ required: true, index: true })
  studentSubscriptionId: number;

  @Prop({ required: true, index: true })
  childId: number;

  /** 1-based position in this child's schedule. */
  @Prop({ required: true })
  index: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ default: 0, min: 0 })
  gracePeriodDays: number;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 0, min: 0 })
  paidAmount: number;

  @Prop({ default: 'Pending', enum: ['Pending', 'PartiallyPaid', 'Paid', 'Cancelled'], index: true })
  status: string;

  /** Every payment that contributed to this instalment. */
  @Prop({ type: [Number], default: [] })
  paymentIds: number[];

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const StudentInstallmentSchema = SchemaFactory.createForClass(StudentInstallment);

StudentInstallmentSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

/**
 * The idempotency guard. Schedule generation runs inside the payment-accept
 * flow, which may run WITHOUT a transaction on the standalone production
 * MongoDB — so a retry after a partial failure must not be able to create a
 * second copy of the same instalment.
 */
StudentInstallmentSchema.index({ studentSubscriptionId: 1, index: 1 }, { unique: true });
