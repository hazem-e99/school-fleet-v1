import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GuardianChildDTO {
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

export class GuardianRegistrationDTO {
  @IsString({ message: 'First name is required.' })
  @MinLength(2, { message: 'First name must be at least 2 characters long.' })
  @MaxLength(20, { message: 'First name must not exceed 20 characters.' })
  firstName: string;

  @IsString({ message: 'Last name is required.' })
  @MinLength(2, { message: 'Last name must be at least 2 characters long.' })
  @MaxLength(20, { message: 'Last name must not exceed 20 characters.' })
  lastName: string;

  @IsString()
  @Matches(/^\d{14}$/, { message: 'National ID must be exactly 14 digits.' })
  nationalId: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @MinLength(1, { message: 'Email address is required.' })
  email: string;

  @IsString()
  @Matches(/^01[0-2,5]{1}[0-9]{8}$/, { message: 'Please enter a valid Egyptian phone number.' })
  phoneNumber: string;

  @IsString({ message: 'Password is required.' })
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  password: string;

  @IsString({ message: 'Please confirm your password.' })
  @MinLength(1, { message: 'Please confirm your password.' })
  confirmPassword: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Please add at least one child.' })
  @ValidateNested({ each: true })
  @Type(() => GuardianChildDTO)
  children: GuardianChildDTO[];
}
