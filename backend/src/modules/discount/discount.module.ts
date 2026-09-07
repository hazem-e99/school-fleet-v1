import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiscountRuleController } from './discount-rule.controller';
import { DiscountRuleService } from './discount-rule.service';
import { DiscountService } from './discount.service';
import { DiscountRule, DiscountRuleSchema } from './discount-rule.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../subscription-plan/subscription-plan.schema';
import { GradeGroup, GradeGroupSchema } from '../grade-group/grade-group.schema';
import { StudentSubscription, StudentSubscriptionSchema } from '../student-subscription/student-subscription.schema';
import { Child, ChildSchema } from '../child/child.schema';

/**
 * Exports DiscountService for PricingModule, which calls it as one stage of
 * quote(). The dependency is one-way: nothing here knows about pricing.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DiscountRule.name, schema: DiscountRuleSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: GradeGroup.name, schema: GradeGroupSchema },
      { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [DiscountRuleController],
  providers: [DiscountRuleService, DiscountService],
  exports: [DiscountService, DiscountRuleService],
})
export class DiscountModule {}
