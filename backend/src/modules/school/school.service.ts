import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { School, SchoolDocument } from './school.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';

@Injectable()
export class SchoolService {
  constructor(
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
  ) {}

  private getNumericId(doc: any): number {
    return parseInt((doc._id as any).toString().slice(-8), 16) % 100000;
  }

  private toViewModel(school: SchoolDocument): any {
    return {
      id: this.getNumericId(school),
      name: school.name,
      isActive: school.isActive,
    };
  }

  /**
   * Resolves a school by the id the UI shows.
   *
   * `toViewModel` derives that id from `_id`, but rows created outside
   * Mongoose's pre('save') hook (a seed script, insertMany, an upsert) have no
   * stored `numericId` — so a plain lookup on the field missed them and the
   * admin page reported "School not found" for a row it had just listed.
   *
   * The stored field is still tried first, since it is indexed. Only when that
   * misses does this fall back to matching the derived id, which costs a scan
   * of what is a short admin-managed list. DbMigrationService backfills the
   * missing values on boot, after which the fallback stops being reached.
   */
  private async findByNumericId(id: number): Promise<SchoolDocument | null> {
    const byField = await this.schoolModel.findOne({ numericId: id }).exec();
    if (byField) return byField;

    const legacy = await this.schoolModel.find({ numericId: { $exists: false } }).exec();
    return legacy.find((doc) => this.getNumericId(doc) === id) ?? null;
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const schools = await this.schoolModel.find().sort({ name: 1 }).exec();
    const data = schools.map((d) => this.toViewModel(d));
    return createApiResponse(data, null, true, data.length);
  }

  async getActive(): Promise<ApiResponse<any[]>> {
    const schools = await this.schoolModel.find({ isActive: true }).sort({ name: 1 }).exec();
    const data = schools.map((d) => this.toViewModel(d));
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const school = await this.findByNumericId(id);
    if (!school) throw new NotFoundException('School not found');
    return createApiResponse(this.toViewModel(school));
  }

  async create(dto: CreateSchoolDto): Promise<ApiResponse<boolean>> {
    await this.schoolModel.create(dto);
    return createApiResponse(true, 'School created successfully');
  }

  async update(id: number, dto: UpdateSchoolDto): Promise<ApiResponse<boolean>> {
    const school = await this.findByNumericId(id);
    if (!school) throw new NotFoundException('School not found');
    await this.schoolModel.findByIdAndUpdate(school._id, { $set: dto });
    return createApiResponse(true, 'School updated successfully');
  }

  async delete(id: number): Promise<ApiResponse<boolean>> {
    const school = await this.findByNumericId(id);
    if (!school) throw new NotFoundException('School not found');
    await this.schoolModel.findByIdAndDelete(school._id);
    return createApiResponse(true, 'School deleted');
  }

  async activate(id: number): Promise<ApiResponse<boolean>> {
    const school = await this.findByNumericId(id);
    if (!school) throw new NotFoundException('School not found');
    await this.schoolModel.findByIdAndUpdate(school._id, { isActive: true });
    return createApiResponse(true, 'School activated');
  }

  async deactivate(id: number): Promise<ApiResponse<boolean>> {
    const school = await this.findByNumericId(id);
    if (!school) throw new NotFoundException('School not found');
    await this.schoolModel.findByIdAndUpdate(school._id, { isActive: false });
    return createApiResponse(true, 'School deactivated');
  }
}
