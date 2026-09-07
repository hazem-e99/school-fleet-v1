import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GradeGroup, GradeGroupDocument } from './grade-group.schema';
import { GradeLevel, GradeLevelDocument } from '../grade-level/grade-level.schema';
import { PricingRule, PricingRuleDocument } from '../pricing/pricing-rule.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { CreateGradeGroupDto, UpdateGradeGroupDto } from './dto/grade-group.dto';

@Injectable()
export class GradeGroupService {
  constructor(
    @InjectModel(GradeGroup.name) private groupModel: Model<GradeGroupDocument>,
    @InjectModel(GradeLevel.name) private gradeModel: Model<GradeLevelDocument>,
    @InjectModel(PricingRule.name) private ruleModel: Model<PricingRuleDocument>,
  ) {}

  /**
   * Resolves member grade names for display. Done as one `$in` query over the
   * whole page of groups rather than per-group, to avoid the N+1 lookups that
   * the older view-model builders in this codebase do.
   */
  private async toViewModels(groups: GradeGroupDocument[]): Promise<any[]> {
    const allIds = [...new Set(groups.flatMap((g) => g.gradeLevelIds ?? []))];
    const grades = allIds.length
      ? await this.gradeModel.find({ numericId: { $in: allIds } }).sort({ order: 1 }).exec()
      : [];
    const gradeMap = new Map<number, GradeLevelDocument>(grades.map((g) => [g.numericId, g]));

    return groups.map((group) => {
      const ids = group.gradeLevelIds ?? [];
      const members = ids
        .map((id) => gradeMap.get(id))
        .filter((g): g is GradeLevelDocument => !!g)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return {
        id: group.numericId,
        name: group.name,
        gradeLevelIds: ids,
        gradeLevelNames: members.map((g) => g.name),
        gradeCount: ids.length,
        isActive: group.isActive,
      };
    });
  }

  private async findByNumericId(id: number): Promise<GradeGroupDocument | null> {
    return this.groupModel.findOne({ numericId: id }).exec();
  }

  /** Rejects ids that don't exist, so a group can never reference a missing grade. */
  private async assertGradesExist(ids: number[]): Promise<void> {
    if (!ids?.length) return;
    const found = await this.gradeModel.countDocuments({ numericId: { $in: ids } }).exec();
    if (found !== new Set(ids).size) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'One or more selected grades no longer exist.',
      );
    }
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const groups = await this.groupModel.find().sort({ name: 1 }).exec();
    const data = await this.toViewModels(groups);
    return createApiResponse(data, null, true, data.length);
  }

  async getActive(): Promise<ApiResponse<any[]>> {
    const groups = await this.groupModel.find({ isActive: true }).sort({ name: 1 }).exec();
    const data = await this.toViewModels(groups);
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const group = await this.findByNumericId(id);
    if (!group) throw new NotFoundException('Grade group not found');
    const [vm] = await this.toViewModels([group]);
    return createApiResponse(vm);
  }

  async create(dto: CreateGradeGroupDto): Promise<ApiResponse<boolean>> {
    await this.assertGradesExist(dto.gradeLevelIds);
    await this.groupModel.create(dto);
    return createApiResponse(true, 'Grade group created successfully');
  }

  async update(id: number, dto: UpdateGradeGroupDto): Promise<ApiResponse<boolean>> {
    const group = await this.findByNumericId(id);
    if (!group) throw new NotFoundException('Grade group not found');
    if (dto.gradeLevelIds) await this.assertGradesExist(dto.gradeLevelIds);
    await this.groupModel.findByIdAndUpdate(group._id, { $set: dto });
    return createApiResponse(true, 'Grade group updated successfully');
  }

  /**
   * Pricing rules reference grade groups by numericId with no database-level
   * foreign key, so a deleted group would strand every rule pointing at it —
   * and those rules would silently stop matching anyone. The PricingRule model
   * is injected directly rather than through PricingService to keep the module
   * dependency one-way (PricingModule already reads GradeGroup).
   */
  async delete(id: number): Promise<ApiResponse<boolean>> {
    const group = await this.findByNumericId(id);
    if (!group) throw new NotFoundException('Grade group not found');

    const ruleCount = await this.ruleModel.countDocuments({ gradeGroupId: group.numericId }).exec();
    if (ruleCount > 0) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `${ruleCount} pricing rule(s) price this grade group. Deactivate it instead of deleting it.`,
      );
    }

    await this.groupModel.findByIdAndDelete(group._id);
    return createApiResponse(true, 'Grade group deleted');
  }

  async activate(id: number): Promise<ApiResponse<boolean>> {
    const group = await this.findByNumericId(id);
    if (!group) throw new NotFoundException('Grade group not found');
    await this.groupModel.findByIdAndUpdate(group._id, { isActive: true });
    return createApiResponse(true, 'Grade group activated');
  }

  async deactivate(id: number): Promise<ApiResponse<boolean>> {
    const group = await this.findByNumericId(id);
    if (!group) throw new NotFoundException('Grade group not found');
    await this.groupModel.findByIdAndUpdate(group._id, { isActive: false });
    return createApiResponse(true, 'Grade group deactivated');
  }

  /**
   * The active group containing a given grade — the lookup the pricing engine
   * will use to turn a child's grade into a price band. Returns null when the
   * child has no grade or the grade is in no group (caller falls back to the
   * plan's own price).
   */
  async findActiveGroupForGrade(gradeLevelId?: number | null): Promise<GradeGroupDocument | null> {
    if (gradeLevelId === undefined || gradeLevelId === null) return null;
    return this.groupModel.findOne({ isActive: true, gradeLevelIds: gradeLevelId }).exec();
  }
}
