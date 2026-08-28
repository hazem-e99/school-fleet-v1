import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment, PaymentSchema } from './payment.schema';
import { User, UserSchema } from '../users/user.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../subscription-plan/subscription-plan.schema';
import { StudentSubscription, StudentSubscriptionSchema } from '../student-subscription/student-subscription.schema';
import { Child, ChildSchema } from '../child/child.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: User.name, schema: UserSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
