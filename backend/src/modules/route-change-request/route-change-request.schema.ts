import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RouteChangeRequestDocument = RouteChangeRequest & Document;

/**
 * A guardian's request to move one of their children to a different route.
 *
 * Guardians never reassign a child directly — they raise this, and an admin
 * applies it. The record doubles as the history of request-driven assignment
 * changes, which is why the route and bus actually applied are stored
 * alongside the ones asked for: an admin may approve onto a different bus than
 * the guardian suggested.
 *
 * Modelled on the subscription-cancellation workflow
 * (StudentSubscriptionService.reviewCancellation), which is the established
 * request → review → notify pattern in this codebase.
 */
@Schema({ timestamps: true, collection: 'routechangerequests' })
export class RouteChangeRequest {
  /**
   * No `index: true` here — the partial unique index declared below already
   * indexes this field, and declaring both makes Mongoose warn about a
   * duplicate index on every boot.
   */
  @Prop({ required: true })
  childId: number;

  /** Denormalised so the admin queue can be built without a lookup per row. */
  @Prop({ required: true, index: true })
  guardianId: number;

  /** Where the child was when the request was raised — kept for history. */
  @Prop()
  currentRouteId?: number;

  @Prop()
  currentBusId?: number;

  @Prop({ required: true })
  requestedRouteId: number;

  /**
   * Optional. When the guardian names no bus, the admin picks an eligible one
   * on the requested route at approval time.
   */
  @Prop()
  preferredBusId?: number;

  @Prop()
  reason?: string;

  @Prop({ default: 'Pending', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], index: true })
  status: string;

  @Prop()
  adminNotes?: string;

  @Prop()
  reviewedById?: number;

  @Prop()
  reviewedAt?: Date;

  /** What was actually applied — may differ from what was requested. */
  @Prop()
  appliedRouteId?: number;

  @Prop()
  appliedBusId?: number;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const RouteChangeRequestSchema = SchemaFactory.createForClass(RouteChangeRequest);

RouteChangeRequestSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

/**
 * One open request per child, enforced by the database rather than only by a
 * read-then-write check — two tabs submitting at once would otherwise both
 * pass the check. Partial, so any number of closed requests may coexist.
 */
RouteChangeRequestSchema.index(
  { childId: 1 },
  { unique: true, partialFilterExpression: { status: 'Pending' } },
);

RouteChangeRequestSchema.index({ status: 1, createdAt: -1 });
