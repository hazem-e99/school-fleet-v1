import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SchoolDocument = School & Document;

/**
 * Admin-managed list of school names offered on the guardian registration
 * form's "School" dropdown (also used on the child add/edit modal and the
 * admin child-edit page). Editable at runtime via the admin CRUD page —
 * see school.controller.ts. Mirrors preferred-area.schema.ts.
 */
@Schema({ timestamps: true, collection: 'schools' })
export class School {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const SchoolSchema = SchemaFactory.createForClass(School);

SchoolSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});
