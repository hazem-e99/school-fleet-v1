import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChildDocument = Child & Document;

/**
 * A child (rider) managed by a guardian. Its `numericId` is what goes into
 * the `studentId` field on payments / studentsubscriptions / tripbookings /
 * attendance — i.e. downstream, "studentId" now means "this child's id"
 * (legacy Student-User ids may still exist in old rows). Never hard-deleted:
 * removal is a soft `status: 'Inactive'` so financial/audit records that
 * reference the numericId stay resolvable.
 */
@Schema({ timestamps: true, collection: 'children' })
export class Child {
  @Prop({ required: true, index: true })
  guardianId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  schoolName: string;

  @Prop({ required: true })
  pickupAreaName: string;

  @Prop({ enum: ['Male', 'Female'] })
  gender: string;

  @Prop()
  dateOfBirth: Date;

  @Prop({ default: 'Active', enum: ['Active', 'Inactive'] })
  status: string;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const ChildSchema = SchemaFactory.createForClass(Child);

ChildSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});

ChildSchema.index({ guardianId: 1 });
