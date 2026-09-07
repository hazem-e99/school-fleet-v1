import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TermDueDateDto {
  @IsString({ message: 'Due date label is required.' })
  @MinLength(1, { message: 'Due date label is required.' })
  @MaxLength(60, { message: 'Due date label must not exceed 60 characters.' })
  label: string;

  @IsDateString({}, { message: 'Due date must be a valid date.' })
  date: string;
}

export class CreateAcademicTermDto {
  @IsString({ message: 'Term name is required.' })
  @MinLength(2, { message: 'Term name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Term name must not exceed 100 characters.' })
  name: string;

  @IsDateString({}, { message: 'Start date must be a valid date.' })
  startDate: string;

  @IsDateString({}, { message: 'End date must be a valid date.' })
  endDate: string;

  @IsOptional()
  @IsDateString({}, { message: 'Payment due date must be a valid date.' })
  paymentDueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'A term cannot have more than 12 due dates.' })
  @ValidateNested({ each: true })
  @Type(() => TermDueDateDto)
  dueDateRules?: TermDueDateDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAcademicTermDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Term name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Term name must not exceed 100 characters.' })
  name?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid date.' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid date.' })
  endDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Payment due date must be a valid date.' })
  paymentDueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'A term cannot have more than 12 due dates.' })
  @ValidateNested({ each: true })
  @Type(() => TermDueDateDto)
  dueDateRules?: TermDueDateDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
