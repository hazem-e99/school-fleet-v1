import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GradeGroupController } from './grade-group.controller';
import { GradeGroupService } from './grade-group.service';
import { GradeGroup, GradeGroupSchema } from './grade-group.schema';
import { GradeLevel, GradeLevelSchema } from '../grade-level/grade-level.schema';
import { PricingRule, PricingRuleSchema } from '../pricing/pricing-rule.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GradeGroup.name, schema: GradeGroupSchema },
      { name: GradeLevel.name, schema: GradeLevelSchema },
      // Registered directly (not via PricingModule) so the delete guard can
      // count referencing rules without a circular module dependency.
      { name: PricingRule.name, schema: PricingRuleSchema },
    ]),
  ],
  controllers: [GradeGroupController],
  providers: [GradeGroupService],
  exports: [GradeGroupService],
})
export class GradeGroupModule {}
