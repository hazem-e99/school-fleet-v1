import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateChildDto {
  @IsString({ message: 'First name is required.' })
  @MinLength(2, { message: 'First name must be at least 2 characters long.' })
  @MaxLength(20, { message: 'First name must not exceed 20 characters.' })
  firstName: string;

  @IsString({ message: 'Second name is required.' })
  @MinLength(2, { message: 'Second name must be at least 2 characters long.' })
  @MaxLength(20, { message: 'Second name must not exceed 20 characters.' })
  secondName: string;

  @IsString({ message: 'Third name is required.' })
  @MinLength(2, { message: 'Third name must be at least 2 characters long.' })
  @MaxLength(20, { message: 'Third name must not exceed 20 characters.' })
  thirdName: string;

  @IsString({ message: 'Last name is required.' })
  @MinLength(2, { message: 'Last name must be at least 2 characters long.' })
  @MaxLength(20, { message: 'Last name must not exceed 20 characters.' })
  lastName: string;

  @IsString({ message: 'School is required.' })
  @MinLength(1, { message: 'School is required.' })
  schoolName: string;

  @IsString({ message: 'Pickup area is required.' })
  @MinLength(1, { message: 'Pickup area is required.' })
  pickupAreaName: string;

  @IsOptional()
  @IsIn(['Male', 'Female'], { message: 'Gender must be Male or Female.' })
  gender?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date.' })
  dateOfBirth?: string;
}
