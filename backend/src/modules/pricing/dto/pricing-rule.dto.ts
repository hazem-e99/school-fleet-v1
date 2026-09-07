import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePricingRuleDto {
  @IsString({ message: 'Rule name is required.' })
  @MinLength(2, { message: 'Rule name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Rule name must not exceed 120 characters.' })
  name: string;

  @IsInt({ message: 'Select a subscription plan.' })
  subscriptionPlanId: number;

  @IsOptional()
  @IsInt({ message: 'Grade group must be a valid id.' })
  gradeGroupId?: number;

  @IsOptional()
  @IsInt({ message: 'Academic term must be a valid id.' })
  academicTermId?: number;

  @IsNumber({}, { message: 'Price must be a number.' })
  @Min(0, { message: 'Price cannot be negative.' })
  price: number;

  @IsDateString({}, { message: 'Effective-from must be a valid date.' })
  effectiveFrom: string;

  @IsOptional()
  @IsDateString({}, { message: 'Effective-to must be a valid date.' })
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePricingRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Rule name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Rule name must not exceed 120 characters.' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Select a subscription plan.' })
  subscriptionPlanId?: number;

  @IsOptional()
  @IsInt({ message: 'Grade group must be a valid id.' })
  gradeGroupId?: number;

  @IsOptional()
  @IsInt({ message: 'Academic term must be a valid id.' })
  academicTermId?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Price must be a number.' })
  @Min(0, { message: 'Price cannot be negative.' })
  price?: number;

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
