import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { DbMigrationService } from './common/services/db-migration.service';
import { SeedDefaultsService } from './common/services/seed-defaults.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuditModule } from './common/audit/audit.module';
import { TripRoute, TripRouteSchema } from './modules/routes/route.schema';
import { GradeLevel, GradeLevelSchema } from './modules/grade-level/grade-level.schema';
import { GradeGroup, GradeGroupSchema } from './modules/grade-group/grade-group.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from './modules/subscription-plan/subscription-plan.schema';
import { DiscountRule, DiscountRuleSchema } from './modules/discount/discount-rule.schema';

import { AuthenticationModule } from './modules/authentication/authentication.module';
import { UsersModule } from './modules/users/users.module';
import { BusesModule } from './modules/buses/buses.module';
import { TripsModule } from './modules/trips/trips.module';
import { TripBookingModule } from './modules/trip-booking/trip-booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SubscriptionPlanModule } from './modules/subscription-plan/subscription-plan.module';
import { PreferredAreaModule } from './modules/preferred-area/preferred-area.module';
import { SchoolModule } from './modules/school/school.module';
import { YearOfStudyModule } from './modules/year-of-study/year-of-study.module';
import { ChildModule } from './modules/child/child.module';
import { StudentSubscriptionModule } from './modules/student-subscription/student-subscription.module';
import { RoutesModule } from './modules/routes/routes.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { StudentDashboardModule } from './modules/student-dashboard/student-dashboard.module';
import { SettingsModule } from './modules/settings/settings.module';
import { FormsModule } from './modules/forms/forms.module';
import { TripRoutesModule } from './modules/trip-routes/trip-routes.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BusTrackingModule } from './modules/bus-tracking/bus-tracking.module';
import { VotingModule } from './modules/voting/voting.module';
import { AdminSystemModule } from './modules/admin-system/admin-system.module';
import { FilesModule } from './modules/files/files.module';
import { GradeLevelModule } from './modules/grade-level/grade-level.module';
import { GradeGroupModule } from './modules/grade-group/grade-group.module';
import { AcademicTermModule } from './modules/academic-term/academic-term.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { DiscountModule } from './modules/discount/discount.module';
import { InstallmentModule } from './modules/installment/installment.module';
import { RouteChangeRequestModule } from './modules/route-change-request/route-change-request.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuditModule,
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    // Models the startup seeder writes through. Registered here rather than
    // by importing each feature module, because SeedDefaultsService is an
    // AppModule-level provider and importing five modules back into the root
    // for a boot-time task would couple them for no runtime benefit.
    MongooseModule.forFeature([
      { name: TripRoute.name, schema: TripRouteSchema },
      { name: GradeLevel.name, schema: GradeLevelSchema },
      { name: GradeGroup.name, schema: GradeGroupSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: DiscountRule.name, schema: DiscountRuleSchema },
    ]),
    AuthenticationModule,
    UsersModule,
    BusesModule,
    TripsModule,
    TripBookingModule,
    PaymentModule,
    NotificationsModule,
    SubscriptionPlanModule,
    PreferredAreaModule,
    SchoolModule,
    YearOfStudyModule,
    ChildModule,
    StudentSubscriptionModule,
    RoutesModule,
    TripRoutesModule,
    AttendanceModule,
    StudentDashboardModule,
    SettingsModule,
    FormsModule,
    BookingsModule,
    BusTrackingModule,
    VotingModule,
    AdminSystemModule,
    FilesModule,
    GradeLevelModule,
    GradeGroupModule,
    AcademicTermModule,
    PricingModule,
    DiscountModule,
    InstallmentModule,
    RouteChangeRequestModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    DbMigrationService,
    SeedDefaultsService,
  ],
})
export class AppModule {}
