import {
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
} from 'class-validator';

export class CreateDiscountRuleDto {
  @IsString({ message: 'Rule name is required.' })
  @MinLength(2, { message: 'Rule name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Rule name must not exceed 120 characters.' })
  name: string;

  @IsIn(['Fixed', 'Percentage'], { message: 'Discount type must be Fixed or Percentage.' })
  discountType: string;

  @IsNumber({}, { message: 'Discount value must be a number.' })
  @Min(0, { message: 'Discount value cannot be negative.' })
  value: number;

  @IsOptional()
  @IsInt({ message: 'Starting sibling position must be a whole number.' })
  @Min(2, { message: 'The eldest child always pays full price, so the discount must start at position 2 or later.' })
  startingSiblingPosition?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Maximum discount must be a number.' })
  @Min(0, { message: 'Maximum discount cannot be negative.' })
  maxDiscountAmount?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  applicablePlanIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  applicableGradeGroupIds?: number[];

  @IsDateString({}, { message: 'Effective-from must be a valid date.' })
  effectiveFrom: string;

  @IsOptional()
  @IsDateString({}, { message: 'Effective-to must be a valid date.' })
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDiscountRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Rule name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Rule name must not exceed 120 characters.' })
  name?: string;

  @IsOptional()
  @IsIn(['Fixed', 'Percentage'], { message: 'Discount type must be Fixed or Percentage.' })
  discountType?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Discount value must be a number.' })
  @Min(0, { message: 'Discount value cannot be negative.' })
  value?: number;

  @IsOptional()
  @IsInt({ message: 'Starting sibling position must be a whole number.' })
  @Min(2, { message: 'The eldest child always pays full price, so the discount must start at position 2 or later.' })
  startingSiblingPosition?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Maximum discount must be a number.' })
  @Min(0, { message: 'Maximum discount cannot be negative.' })
  maxDiscountAmount?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  applicablePlanIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  applicableGradeGroupIds?: number[];

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
