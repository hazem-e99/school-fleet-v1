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

/**
 * Admin edit of a child.
 *
 * Separate from UpdateChildDto rather than shared, because the two have
 * genuinely different scopes: a guardian edits their own child's details, an
 * admin may additionally correct records across families. Keeping them apart
 * means widening one cannot silently widen the other.
 *
 * Notably absent: `guardianId`. Moving a child between families changes which
 * siblings they rank against and therefore what every one of those children is
 * charged — that belongs behind its own endpoint with its own audit, not
 * folded into a details form.
 */
export class AdminUpdateChildDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Child name must be at least 2 characters long.' })
  @MaxLength(60, { message: 'Child name must not exceed 60 characters.' })
  name?: string;

  /**
   * An empty string means "clear this", so validation is skipped for it and
   * the service turns it into an unset. Without the ValidateIf, clearing an
   * email would fail IsEmail and the admin could never remove one.
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

  @IsOptional()
  @IsInt({ message: 'Grade must be a valid selection.' })
  @Min(0, { message: 'Grade must be a valid selection.' })
  gradeLevelId?: number;
}
