import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PricingRuleDocument = PricingRule & Document;

/**
 * One cell of the admin-managed pricing matrix: "plan X, for grade group Y,
 * during window Z, costs this much".
 *
 * Rules OVERRIDE `SubscriptionPlan.price`; they never replace it. When no rule
 * matches a child, the engine falls back to the plan's own price, which is why
 * adding this collection changes nothing until an admin actually creates a
 * rule — and why an empty `pricingrules` collection is a valid steady state
 * rather than a broken one.
 *
 * Specificity, applied by PricingService when several rules are live at once:
 *   1. a rule naming the child's grade group beats a catch-all rule;
 *   2. between equally specific rules, the latest `effectiveFrom` wins.
 */
@Schema({ timestamps: true, collection: 'pricingrules' })
export class PricingRule {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, index: true })
  subscriptionPlanId: number;

  /**
   * numericId of a GradeGroup, or absent for "every grade, including children
   * who have no grade set at all". Absent is deliberately not 0 — 0 is a
   * legitimate numericId in this codebase's id space.
   */
  @Prop({ index: true })
  gradeGroupId?: number;

  /**
   * Binds the rule to an academic term, which then supplies the subscription's
   * real start/end dates instead of `durationInDays` arithmetic.
   *
   * Only permitted when the plan is `Term` or `Annual` — the service rejects
   * it for `Monthly` plans, which stay rolling. See the confirmed term-binding
   * rule in the plan (§5.4).
   */
  @Prop({ index: true })
  academicTermId?: number;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true })
  effectiveFrom: Date;

  /** Absent means open-ended. */
  @Prop()
  effectiveTo?: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const PricingRuleSchema = SchemaFactory.createForClass(PricingRule);

PricingRuleSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

// The engine's hot path: "active rules for this plan, ordered by specificity".
PricingRuleSchema.index({ subscriptionPlanId: 1, isActive: 1, effectiveFrom: -1 });
