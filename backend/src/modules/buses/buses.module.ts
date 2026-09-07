import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusesController } from './buses.controller';
import { BusesService } from './buses.service';
import { Bus, BusSchema } from './bus.schema';
import { TripRoute, TripRouteSchema } from '../routes/route.schema';
import { Child, ChildSchema } from '../child/child.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bus.name, schema: BusSchema },
      { name: TripRoute.name, schema: TripRouteSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [BusesController],
  providers: [BusesService],
  exports: [BusesService],
})
export class BusesModule {}
