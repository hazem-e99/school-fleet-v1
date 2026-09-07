import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AcademicTerm, AcademicTermDocument } from './academic-term.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { CreateAcademicTermDto, UpdateAcademicTermDto } from './dto/academic-term.dto';

@Injectable()
export class AcademicTermService {
  constructor(
    @InjectModel(AcademicTerm.name) private termModel: Model<AcademicTermDocument>,
  ) {}

  private toViewModel(term: AcademicTermDocument): any {
    return {
      id: term.numericId,
      name: term.name,
      startDate: term.startDate?.toISOString() ?? null,
      endDate: term.endDate?.toISOString() ?? null,
      paymentDueDate: term.paymentDueDate?.toISOString() ?? null,
      dueDateRules: (term.dueDateRules ?? []).map((d) => ({
        label: d.label,
        date: d.date instanceof Date ? d.date.toISOString() : d.date,
      })),
      isActive: term.isActive,
    };
  }

  private async findByNumericId(id: number): Promise<AcademicTermDocument | null> {
    return this.termModel.findOne({ numericId: id }).exec();
  }

  /** A term that ends before it starts would silently produce negative-length subscriptions. */
  private assertDateOrder(startDate?: string, endDate?: string): void {
    if (!startDate || !endDate) return;
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'The term end date must be after its start date.',
        { endDate: 'End date must be after the start date.' },
      );
    }
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const terms = await this.termModel.find().sort({ startDate: -1 }).exec();
    const data = terms.map((t) => this.toViewModel(t));
    return createApiResponse(data, null, true, data.length);
  }

  async getActive(): Promise<ApiResponse<any[]>> {
    const terms = await this.termModel.find({ isActive: true }).sort({ startDate: -1 }).exec();
    const data = terms.map((t) => this.toViewModel(t));
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const term = await this.findByNumericId(id);
    if (!term) throw new NotFoundException('Academic term not found');
    return createApiResponse(this.toViewModel(term));
  }

  async create(dto: CreateAcademicTermDto): Promise<ApiResponse<boolean>> {
    this.assertDateOrder(dto.startDate, dto.endDate);
    await this.termModel.create({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : undefined,
      dueDateRules: (dto.dueDateRules ?? []).map((d) => ({ label: d.label, date: new Date(d.date) })),
    });
    return createApiResponse(true, 'Academic term created successfully');
  }

  async update(id: number, dto: UpdateAcademicTermDto): Promise<ApiResponse<boolean>> {
    const term = await this.findByNumericId(id);
    if (!term) throw new NotFoundException('Academic term not found');

    // Validate against the resulting document, not just the patch — changing
    // only startDate must still be checked against the stored endDate.
    this.assertDateOrder(
      dto.startDate ?? term.startDate?.toISOString(),
      dto.endDate ?? term.endDate?.toISOString(),
    );

    const patch: any = { ...dto };
    if (dto.startDate) patch.startDate = new Date(dto.startDate);
    if (dto.endDate) patch.endDate = new Date(dto.endDate);
    if (dto.paymentDueDate !== undefined) {
      patch.paymentDueDate = dto.paymentDueDate ? new Date(dto.paymentDueDate) : null;
    }
    if (dto.dueDateRules) {
      patch.dueDateRules = dto.dueDateRules.map((d) => ({ label: d.label, date: new Date(d.date) }));
    }

    await this.termModel.findByIdAndUpdate(term._id, { $set: patch });
    return createApiResponse(true, 'Academic term updated successfully');
  }

  /**
   * Pricing rules and subscriptions will reference terms once those land
   * (plan phases 4 and 6); the reference guard is added with them. Until then
   * nothing points at a term, so deletion is safe.
   */
  async delete(id: number): Promise<ApiResponse<boolean>> {
    const term = await this.findByNumericId(id);
    if (!term) throw new NotFoundException('Academic term not found');
    await this.termModel.findByIdAndDelete(term._id);
    return createApiResponse(true, 'Academic term deleted');
  }

  async activate(id: number): Promise<ApiResponse<boolean>> {
    const term = await this.findByNumericId(id);
    if (!term) throw new NotFoundException('Academic term not found');
    await this.termModel.findByIdAndUpdate(term._id, { isActive: true });
    return createApiResponse(true, 'Academic term activated');
  }

  async deactivate(id: number): Promise<ApiResponse<boolean>> {
    const term = await this.findByNumericId(id);
    if (!term) throw new NotFoundException('Academic term not found');
    await this.termModel.findByIdAndUpdate(term._id, { isActive: false });
    return createApiResponse(true, 'Academic term deactivated');
  }

  /** Internal helper for the pricing/installment engines. */
  async findActiveByNumericId(id?: number | null): Promise<AcademicTermDocument | null> {
    if (id === undefined || id === null) return null;
    return this.termModel.findOne({ numericId: id, isActive: true }).exec();
  }
}
