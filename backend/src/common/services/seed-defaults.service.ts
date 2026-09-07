import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SchoolService } from '../../modules/school/school.service';
import { PreferredAreaService } from '../../modules/preferred-area/preferred-area.service';
import { TripRoute, TripRouteDocument } from '../../modules/routes/route.schema';
import { GradeLevel, GradeLevelDocument } from '../../modules/grade-level/grade-level.schema';
import { GradeGroup, GradeGroupDocument } from '../../modules/grade-group/grade-group.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from '../../modules/subscription-plan/subscription-plan.schema';
import { DiscountRule, DiscountRuleDocument } from '../../modules/discount/discount-rule.schema';
import { runMasterSeed, formatMasterSeedSummary } from '../seed/master-seed.runner';

/**
 * Seeds the school's business master data on startup.
 *
 * This is the PRODUCTION seeder. It knows about five entity types and nothing
 * else — routes, grade levels, grade groups, subscription plans and the sibling
 * discount. It can never create a user, child, bus, payment, subscription or
 * academic term, because the runner it delegates to has no notion of them.
 * Demo data is a separate, Atlas-only tool (scripts/seed-atlas.js).
 *
 * The seeding itself lives in common/seed/master-seed.runner.ts so that the
 * command-line entry points share one implementation with startup: two copies
 * would eventually disagree about what "already exists" means, and the whole
 * guarantee here is that a re-run changes nothing.
 *
 * It uses the application's configured Mongoose connection, so it seeds
 * whichever database the process is pointed at — local, staging or the VPS —
 * with no environment-specific branching and no hardcoded connection details.
 */
@Injectable()
export class SeedDefaultsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedDefaultsService.name);

  private readonly DEFAULT_SCHOOLS = [
    'مدرسة النيل الدولية',
    'مدرسة المستقبل',
    'مدرسة الأندلس',
    'مدرسة النصر',
    'مدرسة السلام',
    'مدرسة المنارة',
  ];

  private readonly DEFAULT_PICKUP_AREAS = [
    'المعادي',
    'مدينة نصر',
    'مصر الجديدة',
    'الهرم',
    'شبرا',
    '6 أكتوبر',
  ];

  constructor(
    private readonly schoolService: SchoolService,
    private readonly preferredAreaService: PreferredAreaService,
    @InjectModel(TripRoute.name) private routeModel: Model<TripRouteDocument>,
    @InjectModel(GradeLevel.name) private gradeModel: Model<GradeLevelDocument>,
    @InjectModel(GradeGroup.name) private groupModel: Model<GradeGroupDocument>,
    @InjectModel(SubscriptionPlan.name) private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(DiscountRule.name) private discountModel: Model<DiscountRuleDocument>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seed(this.schoolService, this.DEFAULT_SCHOOLS, 'school');
      await this.seed(this.preferredAreaService, this.DEFAULT_PICKUP_AREAS, 'pickup area');
    } catch (error: any) {
      this.logger.error('❌ Failed to seed default schools/pickup areas:', error.stack);
    }

    try {
      const result = await runMasterSeed(
        {
          routeModel: this.routeModel,
          gradeModel: this.gradeModel,
          groupModel: this.groupModel,
          planModel: this.planModel,
          discountModel: this.discountModel,
        },
        { warn: (message) => this.logger.warn(message) },
      );

      this.logger.log(formatMasterSeedSummary(result));

      if (result.seededTermPlan) {
        // Said plainly rather than buried: a Term package's real length comes
        // from an AcademicTerm, and none were supplied.
        this.logger.warn(
          'Seeded Term packages use a placeholder durationInDays (182). Define academic terms in the dashboard and bind them, or confirm the duration.',
        );
      }
    } catch (error: any) {
      // A seeding failure must not stop the application from starting — the app
      // is fully functional without defaults, and an admin can add them by
      // hand. The error is logged loudly instead.
      this.logger.error('❌ Failed to seed business defaults:', error?.stack ?? error);
    }
  }

  private async seed(
    service: { getAll(): Promise<{ data: any[] | null }>; create(dto: { name: string; isActive: boolean }): Promise<any> },
    names: string[],
    label: string,
  ) {
    const existing = new Set((await service.getAll()).data?.map((item) => item.name) ?? []);
    let seededCount = 0;
    for (const name of names) {
      if (!existing.has(name)) {
        await service.create({ name, isActive: true });
        seededCount++;
      }
    }
    if (seededCount > 0) {
      this.logger.log(`  Seeded ${seededCount} default ${label}(s).`);
    }
  }
}
