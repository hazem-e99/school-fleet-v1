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
import { PricingModule } from '../pricing/pricing.module';
import { InstallmentModule } from '../installment/installment.module';
import { AcademicTerm, AcademicTermSchema } from '../academic-term/academic-term.schema';

@Module({
  imports: [
    NotificationsModule,
    // PaymentService derives every total through PricingService.
    PricingModule,
    // Drives schedule generation and the settle path on accept.
    InstallmentModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: User.name, schema: UserSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: Child.name, schema: ChildSchema },
      { name: AcademicTerm.name, schema: AcademicTermSchema },
    ]),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
