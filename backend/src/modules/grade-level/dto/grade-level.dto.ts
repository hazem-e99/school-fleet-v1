import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateGradeLevelDto {
  @IsString({ message: 'Grade name is required.' })
  @MinLength(1, { message: 'Grade name is required.' })
  @MaxLength(60, { message: 'Grade name must not exceed 60 characters.' })
  name: string;

  @IsOptional()
  @IsInt({ message: 'Order must be a whole number.' })
  @Min(0, { message: 'Order cannot be negative.' })
  @Max(100, { message: 'Order must not exceed 100.' })
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGradeLevelDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Grade name is required.' })
  @MaxLength(60, { message: 'Grade name must not exceed 60 characters.' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Order must be a whole number.' })
  @Min(0, { message: 'Order cannot be negative.' })
  @Max(100, { message: 'Order must not exceed 100.' })
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
