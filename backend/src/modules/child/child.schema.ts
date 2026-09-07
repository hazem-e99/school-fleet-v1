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

  /**
   * Optional contact address for the child.
   *
   * Deliberately NOT unique: siblings legitimately share a parent's address,
   * and this is a contact field, not a login. Authentication in this system is
   * phone-only and stays that way — nothing here creates a credential.
   *
   * Normalised to lowercase and trimmed on write; an empty string is coerced
   * to absent, so "cleared" means the field is gone rather than "".
   */
  @Prop()
  email: string;

  @Prop({ enum: ['Male', 'Female'] })
  gender: string;

  @Prop()
  dateOfBirth: Date;

  /**
   * numericId of a GradeLevel. Optional — existing children have no grade and
   * keep working: pricing falls back to the plan's own price when a child has
   * no grade (or the grade is in no priced group).
   *
   * Stored as an id, not a name like `schoolName`/`pickupAreaName`, because
   * grade drives pricing and a rename must not repoint a child to a different
   * price band.
   */
  @Prop({ index: true })
  gradeLevelId: number;

  /**
   * numericId of the TripRoute this child rides. Assigned by an admin.
   * Indexed via the compound {routeId, busId} below, whose prefix covers
   * route-only queries — no separate single-field index needed.
   */
  @Prop()
  routeId: number;

  /**
   * numericId of the Bus this child rides. Must belong to `routeId`.
   *
   * An assignment is a reserved operational seat: bus occupancy counts every
   * child holding a busId regardless of subscription or payment status, so
   * releasing a child (soft-delete or unassign) must clear this field or the
   * seat stays occupied forever.
   */
  @Prop({ index: true })
  busId: number;

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

// guardianId is already indexed by its @Prop({ index: true }) above; declaring
// it again here produced a duplicate-index warning on every boot.
// Serves route student lists (via the routeId prefix) and route+bus filters.
// `busId` alone is indexed by its own @Prop for the per-bus list and the
// capacity count.
ChildSchema.index({ routeId: 1, busId: 1 });
