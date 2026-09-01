import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Child name must be at least 2 characters long.' })
  @MaxLength(60, { message: 'Child name must not exceed 60 characters.' })
  name?: string;

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
}
