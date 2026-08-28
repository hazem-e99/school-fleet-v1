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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Child.name, schema: ChildSchema },
      { name: User.name, schema: UserSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
    ]),
  ],
  controllers: [ChildController],
  providers: [ChildService],
  exports: [ChildService],
})
export class ChildModule {}
