import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GradeLevelDocument = GradeLevel & Document;

/**
 * Admin-managed catalog of school grades (KG1, KG2, Grade 1, ...). Referenced
 * by `Child.gradeLevelId` and grouped by GradeGroup for pricing.
 *
 * Unlike School / PreferredArea (which children store as a bare name string),
 * a child stores the grade's `numericId`, because grade drives pricing and a
 * rename must not silently repoint a child to a different price band.
 *
 * `order` is the sort key and the basis for "KG1 → Grade 2" style ranges in
 * the grade-group UI — names sort alphabetically in a way that is wrong for
 * grades ("Grade 10" before "Grade 2"), so ordering is explicit.
 */
@Schema({ timestamps: true, collection: 'gradelevels' })
export class GradeLevel {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const GradeLevelSchema = SchemaFactory.createForClass(GradeLevel);

GradeLevelSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

GradeLevelSchema.index({ order: 1 });
