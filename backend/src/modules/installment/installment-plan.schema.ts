import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InstallmentPlanDocument = InstallmentPlan & Document;

/**
 * When one instalment falls due.
 *
 *  - `FixedDate`      an absolute calendar date, the same for everyone.
 *  - `OffsetDays`     N days after the purchase.
 *  - `TermStartOffset` N days after the bound academic term starts.
 *  - `TermDueDate`    one of the term's own configured due dates, by index —
 *                     so moving a deadline for everyone is an edit of the
 *                     term, not of every instalment plan.
 *
 * The two term-anchored types fall back to `OffsetDays` when the subscription
 * has no term (a Monthly plan, or a Term plan sold without one), so a schedule
 * can never come out undated.
 */
@Schema({ _id: false })
export class InstallmentDueRule {
  @Prop({ required: true, enum: ['FixedDate', 'OffsetDays', 'TermStartOffset', 'TermDueDate'] })
  type: string;

  @Prop()
  date?: Date;

  @Prop()
  offsetDays?: number;

  /** Index into the term's `dueDateRules`. */
  @Prop()
  termDueDateIndex?: number;
}

export const InstallmentDueRuleSchema = SchemaFactory.createForClass(InstallmentDueRule);

@Schema({ _id: false })
export class InstallmentDefinition {
  /** 1-based position in the schedule. */
  @Prop({ required: true })
  index: number;

  /** Used when the plan's allocationType is 'Percentage'. */
  @Prop()
  percentage?: number;

  /** Used when the plan's allocationType is 'Fixed'. */
  @Prop()
  amount?: number;

  @Prop({ type: InstallmentDueRuleSchema, required: true })
  dueRule: InstallmentDueRule;

  /** Days after the due date before the instalment counts as overdue. */
  @Prop({ default: 0, min: 0 })
  gracePeriodDays: number;
}

export const InstallmentDefinitionSchema = SchemaFactory.createForClass(InstallmentDefinition);

/**
 * An admin-defined payment schedule template.
 *
 * A plan is a template only: the actual schedule is materialised per child as
 * StudentInstallment rows, and a snapshot of this document is frozen onto the
 * subscription, so editing a plan never rewrites a schedule already sold.
 */
@Schema({ timestamps: true, collection: 'installmentplans' })
export class InstallmentPlan {
  @Prop({ required: true })
  name: string;

  /** Empty means every subscription plan. */
  @Prop({ type: [Number], default: [] })
  applicablePlanIds: number[];

  @Prop({ required: true, enum: ['Percentage', 'Fixed'], default: 'Percentage' })
  allocationType: string;

  @Prop({ type: [InstallmentDefinitionSchema], default: [] })
  installments: InstallmentDefinition[];

  /**
   * Whether paying the FIRST instalment activates the subscription, or whether
   * it stays PendingActivation until the schedule is fully paid. Confirmed as
   * a per-plan decision rather than a global rule.
   */
  @Prop({ default: true })
  activateOnFirstInstallment: boolean;

  @Prop({ required: true })
  effectiveFrom: Date;

  @Prop()
  effectiveTo?: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const InstallmentPlanSchema = SchemaFactory.createForClass(InstallmentPlan);

InstallmentPlanSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});
