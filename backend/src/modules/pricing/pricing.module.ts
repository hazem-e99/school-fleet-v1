import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PricingController } from './pricing.controller';
import { PricingRuleController } from './pricing-rule.controller';
import { PricingService } from './pricing.service';
import { PricingRuleService } from './pricing-rule.service';
import { PricingRule, PricingRuleSchema } from './pricing-rule.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../subscription-plan/subscription-plan.schema';
import { GradeGroup, GradeGroupSchema } from '../grade-group/grade-group.schema';
import { GradeLevel, GradeLevelSchema } from '../grade-level/grade-level.schema';
import { AcademicTerm, AcademicTermSchema } from '../academic-term/academic-term.schema';
import { StudentSubscription, StudentSubscriptionSchema } from '../student-subscription/student-subscription.schema';
import { Child, ChildSchema } from '../child/child.schema';
import { DiscountModule } from '../discount/discount.module';
import { InstallmentModule } from '../installment/installment.module';

/**
 * Models are registered here rather than by importing the owning modules: the
 * pricing engine reads from six collections, and importing six modules would
 * create cycles (PaymentModule imports PricingModule, and the grade modules
 * will want to ask the pricing module about references).
 */
@Module({
  imports: [
    // quote() runs the discount stage; the dependency is one-way.
    DiscountModule,
    // For the schedule preview quote() returns.
    InstallmentModule,
    MongooseModule.forFeature([
      { name: PricingRule.name, schema: PricingRuleSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: GradeGroup.name, schema: GradeGroupSchema },
      { name: GradeLevel.name, schema: GradeLevelSchema },
      { name: AcademicTerm.name, schema: AcademicTermSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [PricingController, PricingRuleController],
  providers: [PricingService, PricingRuleService],
  exports: [PricingService, PricingRuleService],
})
export class PricingModule {}
