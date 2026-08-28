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

  private async findByNumericId(id: number): Promise<SchoolDocument | null> {
    return this.schoolModel.findOne({ numericId: id }).exec();
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
