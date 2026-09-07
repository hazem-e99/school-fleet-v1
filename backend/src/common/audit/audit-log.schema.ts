import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

/**
 * Minimal, generic audit trail.
 *
 * Introduced for route/bus assignment changes — in particular the deliberate
 * over-capacity override, which is only acceptable if it leaves a record of
 * who did it. Pricing/discount/installment configuration edits join it in
 * later phases.
 *
 * Deliberately has no `numericId`: nothing references an audit row by id, so
 * it avoids consuming the app's small (100k) numericId namespace, which is
 * already unguarded against collisions. Reads are by entity or by date.
 */
@Schema({ timestamps: true, collection: 'auditlogs' })
export class AuditLog {
  /** e.g. 'Child', 'Bus', 'PricingRule'. */
  @Prop({ required: true, index: true })
  entityType: string;

  /** numericId of the affected document. */
  @Prop({ required: true, index: true })
  entityId: number;

  /** e.g. 'assignment.updated', 'assignment.overCapacityOverride'. */
  @Prop({ required: true, index: true })
  action: string;

  @Prop({ type: Object })
  before: Record<string, any>;

  @Prop({ type: Object })
  after: Record<string, any>;

  /** numericId of the acting user. */
  @Prop({ index: true })
  actorId: number;

  @Prop()
  actorRole: string;

  @Prop()
  note: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
