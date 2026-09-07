import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubscriptionPlanDocument = SubscriptionPlan & Document;

@Schema({ timestamps: true, collection: 'subscriptionplans' })
export class SubscriptionPlan {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  maxNumberOfRides: number;

  @Prop({ required: true })
  durationInDays: number;

  /**
   * Which billing tier this plan is.
   *
   * `Monthly` (the default, and what every pre-existing plan is backfilled to)
   * stays rolling: its subscriptions are dated `startDate + durationInDays`,
   * exactly as they always have been.
   *
   * `Term` and `Annual` may bind to an AcademicTerm, in which case the
   * subscription takes its start/end from the term's real calendar dates
   * instead of day arithmetic. Monthly plans never bind to a term.
   */
  @Prop({ default: 'Monthly', enum: ['Monthly', 'Term', 'Annual'], index: true })
  subscriptionType: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const SubscriptionPlanSchema = SchemaFactory.createForClass(SubscriptionPlan);

SubscriptionPlanSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});
