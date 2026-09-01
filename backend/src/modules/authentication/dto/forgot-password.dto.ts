import { IsString, MinLength, Matches } from 'class-validator';

/**
 * There is no email or SMS channel in this app, so password reset is a single
 * direct step: prove ownership with phone number + national ID, then set a new
 * password. The national ID acts as the shared secret.
 */
export class ForgotPasswordDTO {
  @IsString()
  @Matches(/^01[0-2,5]{1}[0-9]{8}$/, { message: 'Please enter a valid Egyptian phone number.' })
  phoneNumber: string;

  @IsString()
  @Matches(/^\d{14}$/, { message: 'National ID must be exactly 14 digits.' })
  nationalId: string;

  @IsString({ message: 'Password is required.' })
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  newPassword: string;

  @IsString({ message: 'Please confirm your password.' })
  @MinLength(1, { message: 'Please confirm your password.' })
  confirmPassword: string;
}
