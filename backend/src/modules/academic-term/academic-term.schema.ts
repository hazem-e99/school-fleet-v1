import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AcademicTermDocument = AcademicTerm & Document;

/**
 * One configurable due date within a term, e.g. "First instalment" → 2026-09-15.
 * Installment plans reference these by index so the admin can move a due date
 * for everyone by editing the term rather than every plan.
 */
@Schema({ _id: false })
export class TermDueDate {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  date: Date;
}

export const TermDueDateSchema = SchemaFactory.createForClass(TermDueDate);

/**
 * Admin-managed academic calendar.
 *
 * Applies to `Term` and `Annual` subscription plans ONLY — `Monthly` plans stay
 * rolling and keep deriving their dates from `plan.durationInDays`, which is
 * how every subscription works today.
 *
 * A Term/Annual subscription bound to a term takes its start/end from the term
 * instead of `startDate + durationInDays` arithmetic, so "the spring term ends
 * on the 12th" is a fact the admin controls rather than a number of days
 * someone has to keep recomputing.
 */
@Schema({ timestamps: true, collection: 'academicterms' })
export class AcademicTerm {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  /** Default payment deadline for the term; installment plans may override per instalment. */
  @Prop()
  paymentDueDate: Date;

  @Prop({ type: [TermDueDateSchema], default: [] })
  dueDateRules: TermDueDate[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const AcademicTermSchema = SchemaFactory.createForClass(AcademicTerm);

AcademicTermSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

// Overlapping active terms are permitted (a monthly-ish short term can sit
// inside an annual one); the admin UI warns rather than blocks.
AcademicTermSchema.index({ startDate: 1, endDate: 1 });
