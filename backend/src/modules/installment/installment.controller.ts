import { Controller, Get, Param, Query } from '@nestjs/common';
import { InstallmentService } from './installment.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Child, ChildDocument } from '../child/child.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { createApiResponse } from '../../common/interfaces/api-response.interface';

/**
 * Schedules are readable by an admin, or by the guardian of the child the
 * schedule belongs to. Ownership is re-checked here rather than trusted from
 * the URL, following the `loadOwned` pattern in ChildService.
 */
@Controller('api/Installment')
export class InstallmentController {
  constructor(
    private readonly installmentService: InstallmentService,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
  ) {}

  private async assertMayRead(subscriptionId: number, userId: number, role: string): Promise<void> {
    if (role === 'Admin') return;
    const sub = await this.subModel.findOne({ numericId: subscriptionId }).exec();
    if (!sub) return; // an empty schedule is returned rather than leaking existence
    const child = await this.childModel.findOne({ numericId: sub.studentId }).exec();
    if (!child || child.guardianId !== userId) {
      throw new AppException(403, ErrorCodes.VALIDATION_ERROR, 'That subscription does not belong to your account.');
    }
  }

  @Get('subscription/:id')
  @Roles('Admin', 'Guardian')
  async getForSubscription(
    @Param('id') id: string,
    @CurrentUser('numericId') userId: number,
    @CurrentUser('role') role: string,
  ) {
    const subscriptionId = parseInt(id);
    await this.assertMayRead(subscriptionId, userId, role);
    return this.installmentService.getScheduleResponse(subscriptionId);
  }

  /** The guardian's own outstanding instalments across all their children. */
  @Get('my-outstanding')
  @Roles('Guardian')
  async getMyOutstanding(@CurrentUser('numericId') userId: number) {
    const children = await this.childModel.find({ guardianId: userId, status: 'Active' }).exec();
    return this.installmentService.getOutstandingForChildren(children.map((c) => c.numericId));
  }

  @Get('child/:id')
  @Roles('Admin')
  async getForChild(@Param('id') id: string, @Query('onlyOutstanding') onlyOutstanding?: string) {
    const childId = parseInt(id);
    if (onlyOutstanding === 'true') {
      return this.installmentService.getOutstandingForChildren([childId]);
    }
    const subs = await this.subModel.find({ studentId: childId }).exec();
    const all = await Promise.all(subs.map((s) => this.installmentService.getScheduleResponse(s.numericId)));
    // Built through createApiResponse rather than by spreading all[0], which
    // is undefined for a child who has never subscribed.
    const merged = all.flatMap((r) => r.data ?? []);
    return createApiResponse(merged, null, true, merged.length);
  }
}
