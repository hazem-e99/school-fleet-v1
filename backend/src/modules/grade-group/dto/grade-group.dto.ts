import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateGradeGroupDto {
  @IsString({ message: 'Group name is required.' })
  @MinLength(2, { message: 'Group name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Group name must not exceed 100 characters.' })
  name: string;

  @IsArray({ message: 'Grades must be a list.' })
  @ArrayUnique({ message: 'The same grade cannot be added twice.' })
  @ArrayMaxSize(50, { message: 'A group cannot contain more than 50 grades.' })
  @IsInt({ each: true, message: 'Each grade must be a valid id.' })
  gradeLevelIds: number[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGradeGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Group name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Group name must not exceed 100 characters.' })
  name?: string;

  @IsOptional()
  @IsArray({ message: 'Grades must be a list.' })
  @ArrayUnique({ message: 'The same grade cannot be added twice.' })
  @ArrayMaxSize(50, { message: 'A group cannot contain more than 50 grades.' })
  @IsInt({ each: true, message: 'Each grade must be a valid id.' })
  gradeLevelIds?: number[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
