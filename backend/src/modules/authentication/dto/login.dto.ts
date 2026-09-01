import { IsString, MinLength, IsOptional, IsBoolean, Matches } from 'class-validator';

export class LoginDTO {
  @IsString({ message: 'Phone number is required.' })
  @Matches(/^01[0-2,5]{1}[0-9]{8}$/, { message: 'Please enter a valid Egyptian phone number.' })
  phoneNumber: string;

  @IsString({ message: 'Password is required.' })
  @MinLength(1, { message: 'Password is required.' })
  password: string;

  @IsOptional()
  @IsBoolean({ message: 'rememberMe must be true or false.' })
  rememberMe?: boolean;
}
