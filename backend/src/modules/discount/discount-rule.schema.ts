import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DiscountRuleDocument = DiscountRule & Document;

/**
 * An admin-configured discount. Today the only `kind` is `Sibling`, but the
 * field is an enum from day one so other kinds can be added later without a
 * schema migration or a rename of this collection.
 */
@Schema({ timestamps: true, collection: 'discountrules' })
export class DiscountRule {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: 'Sibling', enum: ['Sibling'], index: true })
  kind: string;

  @Prop({ required: true, enum: ['Fixed', 'Percentage'] })
  discountType: string;

  /** Currency amount for `Fixed`, or a 0-100 percentage for `Percentage`. */
  @Prop({ required: true, min: 0 })
  value: number;

  /**
   * The family rank at which the discount starts applying. 2 means "the second
   * and every later child"; the eldest always pays full price.
   */
  @Prop({ required: true, default: 2, min: 2 })
  startingSiblingPosition: number;

  /** Optional ceiling, mainly to bound a percentage on an expensive plan. */
  @Prop()
  maxDiscountAmount?: number;

  /** Empty means every plan. */
  @Prop({ type: [Number], default: [] })
  applicablePlanIds: number[];

  /** Empty means every grade group, including children with no grade. */
  @Prop({ type: [Number], default: [] })
  applicableGradeGroupIds: number[];

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

export const DiscountRuleSchema = SchemaFactory.createForClass(DiscountRule);

DiscountRuleSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

DiscountRuleSchema.index({ kind: 1, isActive: 1, effectiveFrom: -1 });
