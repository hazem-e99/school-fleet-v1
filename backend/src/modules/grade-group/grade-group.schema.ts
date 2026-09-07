import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GradeGroupDocument = GradeGroup & Document;

/**
 * A named set of grades that a pricing rule attaches to — e.g. "KG1 → Grade 2"
 * and "Grade 3 → Grade 12".
 *
 * Membership is an explicit list of GradeLevel numericIds rather than a
 * min/max order range, so non-contiguous groups are expressible and a later
 * reordering of grades cannot silently change which children a price applies
 * to. The admin UI still offers a from/to range picker, which simply expands
 * into this list at save time.
 */
@Schema({ timestamps: true, collection: 'gradegroups' })
export class GradeGroup {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ type: [Number], default: [], index: true })
  gradeLevelIds: number[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const GradeGroupSchema = SchemaFactory.createForClass(GradeGroup);

GradeGroupSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});
