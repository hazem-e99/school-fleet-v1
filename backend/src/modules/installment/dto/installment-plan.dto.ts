import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InstallmentDueRuleDto {
  @IsIn(['FixedDate', 'OffsetDays', 'TermStartOffset', 'TermDueDate'], {
    message: 'Unknown due-date rule type.',
  })
  type: string;

  @IsOptional()
  @IsDateString({}, { message: 'The fixed due date must be a valid date.' })
  date?: string;

  @IsOptional()
  @IsInt({ message: 'Offset days must be a whole number.' })
  offsetDays?: number;

  @IsOptional()
  @IsInt({ message: 'Term due-date index must be a whole number.' })
  @Min(0)
  termDueDateIndex?: number;
}

export class InstallmentDefinitionDto {
  @IsInt({ message: 'Instalment index must be a whole number.' })
  @Min(1, { message: 'Instalment numbering starts at 1.' })
  index: number;

  @IsOptional()
  @IsNumber({}, { message: 'Percentage must be a number.' })
  @Min(0)
  percentage?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Amount must be a number.' })
  @Min(0)
  amount?: number;

  @ValidateNested()
  @Type(() => InstallmentDueRuleDto)
  dueRule: InstallmentDueRuleDto;

  @IsOptional()
  @IsInt({ message: 'Grace period must be a whole number of days.' })
  @Min(0)
  gracePeriodDays?: number;
}

export class CreateInstallmentPlanDto {
  @IsString({ message: 'Plan name is required.' })
  @MinLength(2, { message: 'Plan name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Plan name must not exceed 120 characters.' })
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  applicablePlanIds?: number[];

  @IsIn(['Percentage', 'Fixed'], { message: 'Allocation type must be Percentage or Fixed.' })
  allocationType: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'An instalment plan needs at least one instalment.' })
  @ArrayMaxSize(24, { message: 'An instalment plan cannot have more than 24 instalments.' })
  @ValidateNested({ each: true })
  @Type(() => InstallmentDefinitionDto)
  installments: InstallmentDefinitionDto[];

  @IsOptional()
  @IsBoolean()
  activateOnFirstInstallment?: boolean;

  @IsDateString({}, { message: 'Effective-from must be a valid date.' })
  effectiveFrom: string;

  @IsOptional()
  @IsDateString({}, { message: 'Effective-to must be a valid date.' })
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateInstallmentPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Plan name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Plan name must not exceed 120 characters.' })
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  applicablePlanIds?: number[];

  @IsOptional()
  @IsIn(['Percentage', 'Fixed'], { message: 'Allocation type must be Percentage or Fixed.' })
  allocationType?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'An instalment plan needs at least one instalment.' })
  @ArrayMaxSize(24, { message: 'An instalment plan cannot have more than 24 instalments.' })
  @ValidateNested({ each: true })
  @Type(() => InstallmentDefinitionDto)
  installments?: InstallmentDefinitionDto[];

  @IsOptional()
  @IsBoolean()
  activateOnFirstInstallment?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'Effective-from must be a valid date.' })
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Effective-to must be a valid date.' })
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
