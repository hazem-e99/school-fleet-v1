import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RouteChangeRequestController } from './route-change-request.controller';
import { RouteChangeRequestService } from './route-change-request.service';
import { RouteChangeRequest, RouteChangeRequestSchema } from './route-change-request.schema';
import { Child, ChildSchema } from '../child/child.schema';
import { TripRoute, TripRouteSchema } from '../routes/route.schema';
import { Bus, BusSchema } from '../buses/bus.schema';
import { User, UserSchema } from '../users/user.schema';
import { ChildModule } from '../child/child.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * ChildModule is imported (rather than the Child model being re-registered
 * alone) because approval delegates to ChildService.assign, which owns every
 * assignment rule — capacity, bus/route coherence, and the audited override.
 * Duplicating those checks here would let the two paths drift apart.
 */
@Module({
  imports: [
    ChildModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: RouteChangeRequest.name, schema: RouteChangeRequestSchema },
      { name: Child.name, schema: ChildSchema },
      { name: TripRoute.name, schema: TripRouteSchema },
      { name: Bus.name, schema: BusSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RouteChangeRequestController],
  providers: [RouteChangeRequestService],
  exports: [RouteChangeRequestService],
})
export class RouteChangeRequestModule {}
