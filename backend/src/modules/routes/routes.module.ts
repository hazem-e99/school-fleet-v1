import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { TripRoute, TripRouteSchema } from './route.schema';
import { Trip, TripSchema } from '../trips/trip.schema';
import { Bus, BusSchema } from '../buses/bus.schema';
import { Child, ChildSchema } from '../child/child.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TripRoute.name, schema: TripRouteSchema },
      { name: Trip.name, schema: TripSchema },
      { name: Bus.name, schema: BusSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
