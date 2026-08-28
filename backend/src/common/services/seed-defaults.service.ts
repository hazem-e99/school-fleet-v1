import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchoolService } from '../../modules/school/school.service';
import { PreferredAreaService } from '../../modules/preferred-area/preferred-area.service';

/**
 * Seeds the admin-managed School and Pickup-Area lists so the guardian
 * registration form's dropdowns are never empty on a fresh database.
 *
 * Runs on every boot but only inserts names that don't already exist (checked
 * by name), so it's safe to re-run and never resurrects a value the admin has
 * since deleted. Seeding goes through each service's real create() (which
 * calls Model.create(), triggering the schema's pre('save') numericId hook)
 * rather than a raw upsert, so every seeded document gets a correct numericId
 * immediately on first boot.
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
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seed(this.schoolService, this.DEFAULT_SCHOOLS, 'school');
      await this.seed(this.preferredAreaService, this.DEFAULT_PICKUP_AREAS, 'pickup area');
    } catch (error: any) {
      this.logger.error('❌ Failed to seed default schools/pickup areas:', error.stack);
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
