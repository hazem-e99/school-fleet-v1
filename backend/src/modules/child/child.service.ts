import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Child, ChildDocument } from './child.schema';
import { User, UserDocument } from '../users/user.schema';
import {
  StudentSubscription,
  StudentSubscriptionDocument,
} from '../student-subscription/student-subscription.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from '../subscription-plan/subscription-plan.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';

@Injectable()
export class ChildService {
  constructor(
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentSubscription.name)
    private subModel: Model<StudentSubscriptionDocument>,
    @InjectModel(SubscriptionPlan.name)
    private planModel: Model<SubscriptionPlanDocument>,
  ) {}

  private async findByNumericId(id: number): Promise<ChildDocument | null> {
    return this.childModel.findOne({ numericId: id }).exec();
  }

  private async toViewModel(child: ChildDocument): Promise<any> {
    const guardian = await this.userModel.findOne({ numericId: child.guardianId }).exec();
    const activeSub = await this.subModel
      .findOne({ studentId: child.numericId, isActive: true, status: 'Active' })
      .exec();
    let activeSubscription: any = null;
    if (activeSub) {
      const plan = await this.planModel
        .findOne({ numericId: activeSub.subscriptionPlanId })
        .exec();
      activeSubscription = {
        id: activeSub.numericId,
        subscriptionPlanId: activeSub.subscriptionPlanId,
        subscriptionPlanName: plan?.name ?? null,
        subscriptionPlanPrice: plan?.price ?? 0,
        startDate: activeSub.startDate?.toISOString() ?? null,
        endDate: activeSub.endDate?.toISOString() ?? null,
        status: activeSub.status,
        cancellationStatus: activeSub.cancellationStatus ?? 'None',
      };
    }
    return {
      id: child.numericId,
      guardianId: child.guardianId,
      guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : null,
      guardianEmail: guardian?.email ?? null,
      guardianPhone: guardian?.phoneNumber ?? null,
      firstName: child.firstName,
      secondName: child.secondName,
      thirdName: child.thirdName,
      lastName: child.lastName,
      fullName: `${child.firstName} ${child.secondName} ${child.thirdName} ${child.lastName}`.trim(),
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      gender: child.gender ?? null,
      dateOfBirth: child.dateOfBirth?.toISOString() ?? null,
      status: child.status,
      activeSubscription,
      createdAt: (child as any).createdAt ?? null,
    };
  }

  /** Loads a child and asserts the given guardian owns it. */
  private async loadOwned(id: number, guardianId: number): Promise<ChildDocument> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');
    if (child.guardianId !== guardianId) {
      throw new ForbiddenException('You do not have access to this child.');
    }
    return child;
  }

  async createForGuardian(guardianId: number, dto: CreateChildDto): Promise<ApiResponse<any>> {
    const child = await this.childModel.create({
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      guardianId,
      status: 'Active',
    });
    return createApiResponse(await this.toViewModel(child), 'Child added successfully');
  }

  async getMyChildren(guardianId: number): Promise<ApiResponse<any[]>> {
    const children = await this.childModel
      .find({ guardianId, status: 'Active' })
      .sort({ createdAt: 1 })
      .exec();
    const data = await Promise.all(children.map((c) => this.toViewModel(c)));
    return createApiResponse(data, null, true, data.length);
  }

  async update(id: number, guardianId: number, dto: UpdateChildDto): Promise<ApiResponse<any>> {
    const child = await this.loadOwned(id, guardianId);
    const patch: any = { ...dto };
    if (dto.dateOfBirth !== undefined) {
      patch.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    await this.childModel.findByIdAndUpdate(child._id, { $set: patch });
    const updated = await this.findByNumericId(id);
    return createApiResponse(await this.toViewModel(updated!), 'Child updated successfully');
  }

  /**
   * Soft-remove: mark the child Inactive (never hard-delete — payments,
   * subscriptions and bookings reference the numericId). Also cancel any
   * active subscription the child has so it stops counting as active.
   */
  async remove(id: number, guardianId: number): Promise<ApiResponse<boolean>> {
    const child = await this.loadOwned(id, guardianId);
    await this.childModel.findByIdAndUpdate(child._id, { status: 'Inactive' });
    await this.subModel.updateMany(
      { studentId: child.numericId, isActive: true },
      { $set: { isActive: false, status: 'Cancelled', suspendReason: 'Child removed by guardian' } },
    );
    return createApiResponse(true, 'Child removed');
  }

  // ---- Admin ----

  async getById(id: number): Promise<ApiResponse<any>> {
    const child = await this.findByNumericId(id);
    if (!child) throw new NotFoundException('Child not found');
    return createApiResponse(await this.toViewModel(child));
  }

  async getByIdForGuardian(id: number, guardianId: number): Promise<ApiResponse<any>> {
    const child = await this.loadOwned(id, guardianId);
    return createApiResponse(await this.toViewModel(child));
  }

  async getByGuardian(guardianId: number): Promise<ApiResponse<any[]>> {
    const children = await this.childModel.find({ guardianId }).sort({ createdAt: 1 }).exec();
    const data = await Promise.all(children.map((c) => this.toViewModel(c)));
    return createApiResponse(data, null, true, data.length);
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const children = await this.childModel.find().sort({ createdAt: -1 }).exec();
    const data = await Promise.all(children.map((c) => this.toViewModel(c)));
    return createApiResponse(data, null, true, data.length);
  }

  /** Internal helper for other services: active children owned by a guardian. */
  async findActiveOwned(guardianId: number, ids: number[]): Promise<ChildDocument[]> {
    return this.childModel
      .find({ numericId: { $in: ids }, guardianId, status: 'Active' })
      .exec();
  }
}
