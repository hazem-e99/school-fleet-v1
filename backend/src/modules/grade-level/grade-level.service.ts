import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GradeLevel, GradeLevelDocument } from './grade-level.schema';
import { GradeGroup, GradeGroupDocument } from '../grade-group/grade-group.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { CreateGradeLevelDto, UpdateGradeLevelDto } from './dto/grade-level.dto';

@Injectable()
export class GradeLevelService {
  constructor(
    @InjectModel(GradeLevel.name) private gradeModel: Model<GradeLevelDocument>,
    @InjectModel(GradeGroup.name) private groupModel: Model<GradeGroupDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
  ) {}

  private toViewModel(grade: GradeLevelDocument): any {
    return {
      id: grade.numericId,
      name: grade.name,
      order: grade.order ?? 0,
      isActive: grade.isActive,
    };
  }

  private async findByNumericId(id: number): Promise<GradeLevelDocument | null> {
    return this.gradeModel.findOne({ numericId: id }).exec();
  }

  /** Grades sort by `order`, not name — "Grade 10" must not sort before "Grade 2". */
  async getAll(): Promise<ApiResponse<any[]>> {
    const grades = await this.gradeModel.find().sort({ order: 1, name: 1 }).exec();
    const data = grades.map((g) => this.toViewModel(g));
    return createApiResponse(data, null, true, data.length);
  }

  async getActive(): Promise<ApiResponse<any[]>> {
    const grades = await this.gradeModel.find({ isActive: true }).sort({ order: 1, name: 1 }).exec();
    const data = grades.map((g) => this.toViewModel(g));
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const grade = await this.findByNumericId(id);
    if (!grade) throw new NotFoundException('Grade level not found');
    return createApiResponse(this.toViewModel(grade));
  }

  async create(dto: CreateGradeLevelDto): Promise<ApiResponse<boolean>> {
    await this.gradeModel.create(dto);
    return createApiResponse(true, 'Grade level created successfully');
  }

  async update(id: number, dto: UpdateGradeLevelDto): Promise<ApiResponse<boolean>> {
    const grade = await this.findByNumericId(id);
    if (!grade) throw new NotFoundException('Grade level not found');
    await this.gradeModel.findByIdAndUpdate(grade._id, { $set: dto });
    return createApiResponse(true, 'Grade level updated successfully');
  }

  /**
   * Hard delete is allowed only while nothing references this grade. Once a
   * child or a grade group points at it, deleting would strand those
   * references (there are no DB-level foreign keys in this architecture), and
   * a subscription's snapshotted grade name would no longer be explainable.
   * Deactivating instead hides it from pickers while keeping history intact.
   */
  async delete(id: number): Promise<ApiResponse<boolean>> {
    const grade = await this.findByNumericId(id);
    if (!grade) throw new NotFoundException('Grade level not found');

    const [childCount, groupCount] = await Promise.all([
      this.childModel.countDocuments({ gradeLevelId: grade.numericId }).exec(),
      this.groupModel.countDocuments({ gradeLevelIds: grade.numericId }).exec(),
    ]);

    if (childCount > 0 || groupCount > 0) {
      const parts: string[] = [];
      if (childCount > 0) parts.push(`${childCount} student(s)`);
      if (groupCount > 0) parts.push(`${groupCount} grade group(s)`);
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `This grade is still used by ${parts.join(' and ')}. Deactivate it instead of deleting it.`,
      );
    }

    await this.gradeModel.findByIdAndDelete(grade._id);
    return createApiResponse(true, 'Grade level deleted');
  }

  async activate(id: number): Promise<ApiResponse<boolean>> {
    const grade = await this.findByNumericId(id);
    if (!grade) throw new NotFoundException('Grade level not found');
    await this.gradeModel.findByIdAndUpdate(grade._id, { isActive: true });
    return createApiResponse(true, 'Grade level activated');
  }

  async deactivate(id: number): Promise<ApiResponse<boolean>> {
    const grade = await this.findByNumericId(id);
    if (!grade) throw new NotFoundException('Grade level not found');
    await this.gradeModel.findByIdAndUpdate(grade._id, { isActive: false });
    return createApiResponse(true, 'Grade level deactivated');
  }

  /** Internal helper for other services (pricing resolves a child's grade group through this). */
  async findActiveByNumericIds(ids: number[]): Promise<GradeLevelDocument[]> {
    if (!ids.length) return [];
    return this.gradeModel.find({ numericId: { $in: ids } }).exec();
  }
}
