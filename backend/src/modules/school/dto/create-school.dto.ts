import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSchoolDto {
  @IsString({ message: 'Name is required.' })
  @MinLength(2, { message: 'Name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters.' })
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
