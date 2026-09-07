import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TripRouteDocument = TripRoute & Document;

@Schema({ timestamps: true, collection: 'routes' })
export class TripRoute {
  @Prop({ required: true })
  name: string;

  /**
   * Operational detail, optional at the SCHEMA level only.
   *
   * `CreateRouteDto` still requires all four, so every route created through
   * the API must supply them — the contract is unchanged. Relaxing the schema
   * exists so the startup seeder can create the school's lines from their
   * names alone, rather than inventing start points, distances and journey
   * times that drivers would then be shown as if they were real.
   *
   * DbMigrationService.reportIncompleteRoutes already logs routes missing a
   * start or end location on every boot, so anything seeded this way stays
   * visible until an admin completes it.
   */
  @Prop()
  startLocation: string;

  @Prop()
  endLocation: string;

  @Prop()
  distance: number;

  @Prop()
  estimatedTime: string;

  @Prop({ type: [String], default: [] })
  stopLocations: string[];

  /**
   * Optional short identifier the school uses for the route ("R-12").
   * `sparse` so the unique index ignores the many existing rows that have none.
   */
  @Prop({ unique: true, sparse: true })
  code: string;

  /**
   * Disabled routes keep their buses and students but accept no new
   * assignments. Existing rows predate this field and read `undefined`, so
   * every check treats `!== false` as active; DbMigrationService backfills
   * them to `true` on boot.
   */
  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ unique: true, index: true })
  numericId: number;
}

export const TripRouteSchema = SchemaFactory.createForClass(TripRoute);

TripRouteSchema.pre('save', function (next) {
  if (this.isNew || !this.numericId) {
    this.numericId = parseInt(this._id.toString().slice(-8), 16) % 100000;
  }
  next();
});
