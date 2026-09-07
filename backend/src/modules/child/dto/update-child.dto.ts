import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Child name must be at least 2 characters long.' })
  @MaxLength(60, { message: 'Child name must not exceed 60 characters.' })
  name?: string;

  /**
   * Optional contact email. An empty string means "clear it" and skips
   * validation — otherwise a guardian could never remove an address once set.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(120, { message: 'Email must not exceed 120 characters.' })
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'School is required.' })
  schoolName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Pickup area is required.' })
  pickupAreaName?: string;

  @IsOptional()
  @IsIn(['Male', 'Female'], { message: 'Gender must be Male or Female.' })
  gender?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date.' })
  dateOfBirth?: string;

  /** numericId of a GradeLevel. Optional — a child without a grade is valid. */
  @IsOptional()
  @IsInt({ message: 'Grade must be a valid selection.' })
  @Min(0, { message: 'Grade must be a valid selection.' })
  gradeLevelId?: number;
}
