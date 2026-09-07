import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChildController } from './child.controller';
import { ChildService } from './child.service';
import { Child, ChildSchema } from './child.schema';
import { User, UserSchema } from '../users/user.schema';
import {
  StudentSubscription,
  StudentSubscriptionSchema,
} from '../student-subscription/student-subscription.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from '../subscription-plan/subscription-plan.schema';
import { GradeLevel, GradeLevelSchema } from '../grade-level/grade-level.schema';
import { TripRoute, TripRouteSchema } from '../routes/route.schema';
import { Bus, BusSchema } from '../buses/bus.schema';
import { Payment, PaymentSchema } from '../payment/payment.schema';
import { StudentInstallment, StudentInstallmentSchema } from '../installment/student-installment.schema';
import { RouteChangeRequest, RouteChangeRequestSchema } from '../route-change-request/route-change-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Child.name, schema: ChildSchema },
      { name: User.name, schema: UserSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: GradeLevel.name, schema: GradeLevelSchema },
      { name: TripRoute.name, schema: TripRouteSchema },
      { name: Bus.name, schema: BusSchema },
      // Registered as schemas rather than by importing their modules: the
      // detail view reads from all three, and RouteChangeRequestModule
      // already imports ChildModule, so importing it back would cycle.
      { name: Payment.name, schema: PaymentSchema },
      { name: StudentInstallment.name, schema: StudentInstallmentSchema },
      { name: RouteChangeRequest.name, schema: RouteChangeRequestSchema },
    ]),
  ],
  controllers: [ChildController],
  providers: [ChildService],
  exports: [ChildService],
})
export class ChildModule {}
