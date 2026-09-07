import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Route validation, introduced together with the frontend payload fix.
 *
 * Until now both routes pages posted `startPoint`/`endPoint`/
 * `estimatedDuration`, which do not exist on the schema — those three fields
 * were silently dropped on every create, leaving incomplete route documents.
 * The pages now send the real field names; with the global
 * `forbidNonWhitelisted: true` pipe, anything else is a hard 422 rather than
 * another silent data loss.
 */
export class CreateRouteDto {
  @IsString({ message: 'Route name is required.' })
  @MinLength(2, { message: 'Route name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Route name must not exceed 120 characters.' })
  name: string;

  @IsString({ message: 'Start location is required.' })
  @MinLength(1, { message: 'Start location is required.' })
  @MaxLength(200, { message: 'Start location must not exceed 200 characters.' })
  startLocation: string;

  @IsString({ message: 'End location is required.' })
  @MinLength(1, { message: 'End location is required.' })
  @MaxLength(200, { message: 'End location must not exceed 200 characters.' })
  endLocation: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Distance must be a number.' })
  @Min(0.1, { message: 'Distance must be at least 0.1 km.' })
  @Max(1000, { message: 'Distance must not exceed 1000 km.' })
  distance: number;

  /** Free text on the schema ("45 min"), so validated as a string, not a number. */
  @IsString({ message: 'Estimated time is required.' })
  @MinLength(1, { message: 'Estimated time is required.' })
  @MaxLength(50, { message: 'Estimated time must not exceed 50 characters.' })
  estimatedTime: string;

  @IsOptional()
  @IsArray({ message: 'Stops must be a list.' })
  @ArrayMaxSize(100, { message: 'A route cannot have more than 100 stops.' })
  @IsString({ each: true, message: 'Each stop must be text.' })
  stopLocations?: string[];

  @IsOptional()
  @IsString({ message: 'Route code must be text.' })
  @MaxLength(30, { message: 'Route code must not exceed 30 characters.' })
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Route name must be at least 2 characters long.' })
  @MaxLength(120, { message: 'Route name must not exceed 120 characters.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Start location is required.' })
  @MaxLength(200, { message: 'Start location must not exceed 200 characters.' })
  startLocation?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'End location is required.' })
  @MaxLength(200, { message: 'End location must not exceed 200 characters.' })
  endLocation?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Distance must be a number.' })
  @Min(0.1, { message: 'Distance must be at least 0.1 km.' })
  @Max(1000, { message: 'Distance must not exceed 1000 km.' })
  distance?: number;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Estimated time is required.' })
  @MaxLength(50, { message: 'Estimated time must not exceed 50 characters.' })
  estimatedTime?: string;

  @IsOptional()
  @IsArray({ message: 'Stops must be a list.' })
  @ArrayMaxSize(100, { message: 'A route cannot have more than 100 stops.' })
  @IsString({ each: true, message: 'Each stop must be text.' })
  stopLocations?: string[];

  @IsOptional()
  @IsString({ message: 'Route code must be text.' })
  @MaxLength(30, { message: 'Route code must not exceed 30 characters.' })
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Body of `PUT /api/Buses/:id/route`. `routeId: null` clears the assignment. */
export class AssignBusRouteDto {
  @IsOptional()
  @IsNumber({}, { message: 'Route must be a valid selection.' })
  routeId?: number | null;
}
