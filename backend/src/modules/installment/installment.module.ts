import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstallmentController } from './installment.controller';
import { InstallmentPlanController } from './installment-plan.controller';
import { InstallmentService } from './installment.service';
import { InstallmentPlanService } from './installment-plan.service';
import { InstallmentPlan, InstallmentPlanSchema } from './installment-plan.schema';
import { StudentInstallment, StudentInstallmentSchema } from './student-installment.schema';
import { StudentSubscription, StudentSubscriptionSchema } from '../student-subscription/student-subscription.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../subscription-plan/subscription-plan.schema';
import { Child, ChildSchema } from '../child/child.schema';

/** Exports both services for PaymentModule, which drives the settle flow. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InstallmentPlan.name, schema: InstallmentPlanSchema },
      { name: StudentInstallment.name, schema: StudentInstallmentSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [InstallmentController, InstallmentPlanController],
  providers: [InstallmentService, InstallmentPlanService],
  exports: [InstallmentService, InstallmentPlanService],
})
export class InstallmentModule {}
