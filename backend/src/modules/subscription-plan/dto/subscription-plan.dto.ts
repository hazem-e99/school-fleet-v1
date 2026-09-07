import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SUBSCRIPTION_TYPES = ['Monthly', 'Term', 'Annual'] as const;

/**
 * A subscription plan carries the price every guardian is charged, so these
 * fields are validated rather than accepted as `any` — the global
 * ValidationPipe runs with `forbidNonWhitelisted: true`, which additionally
 * rejects any property not declared here.
 *
 * Field set matches what the admin plans page actually sends
 * (frontend/src/app/dashboard/admin/plans/page.tsx): name, description,
 * price, maxNumberOfRides, durationInDays, isActive.
 */
export class CreateSubscriptionPlanDto {
  @IsString({ message: 'Plan name is required.' })
  @MinLength(2, { message: 'Plan name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Plan name must not exceed 100 characters.' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be text.' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters.' })
  description?: string;

  // Money is stored as a plain number throughout this codebase; 2dp is the
  // display convention (see frontend formatCurrency).
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price must be a number with at most 2 decimal places.' })
  @Min(0, { message: 'Price cannot be negative.' })
  @Max(1000000, { message: 'Price must not exceed 1,000,000.' })
  price: number;

  @IsInt({ message: 'Maximum number of rides must be a whole number.' })
  @Min(1, { message: 'Maximum number of rides must be at least 1.' })
  @Max(1000, { message: 'Maximum number of rides must not exceed 1000.' })
  maxNumberOfRides: number;

  @IsInt({ message: 'Duration must be a whole number of days.' })
  @Min(1, { message: 'Duration must be at least 1 day.' })
  @Max(3650, { message: 'Duration must not exceed 3650 days.' })
  durationInDays: number;

  /** Omitted by older clients — the schema defaults it to 'Monthly'. */
  @IsOptional()
  @IsIn(SUBSCRIPTION_TYPES, {
    message: `Subscription type must be one of ${SUBSCRIPTION_TYPES.join(', ')}.`,
  })
  subscriptionType?: string;

  @IsOptional()
  @IsBoolean({ message: 'Active status must be true or false.' })
  isActive?: boolean;
}

/** Every field optional — the plans page sends a full object, but PUT is a patch. */
export class UpdateSubscriptionPlanDto {
  @IsOptional()
  @IsString({ message: 'Plan name must be text.' })
  @MinLength(2, { message: 'Plan name must be at least 2 characters long.' })
  @MaxLength(100, { message: 'Plan name must not exceed 100 characters.' })
  name?: string;

  // The admin page sends `description: null` when the field is cleared, so
  // null must be accepted here rather than rejected as a type error.
  @IsOptional()
  @IsString({ message: 'Description must be text.' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters.' })
  description?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price must be a number with at most 2 decimal places.' })
  @Min(0, { message: 'Price cannot be negative.' })
  @Max(1000000, { message: 'Price must not exceed 1,000,000.' })
  price?: number;

  @IsOptional()
  @IsInt({ message: 'Maximum number of rides must be a whole number.' })
  @Min(1, { message: 'Maximum number of rides must be at least 1.' })
  @Max(1000, { message: 'Maximum number of rides must not exceed 1000.' })
  maxNumberOfRides?: number;

  @IsOptional()
  @IsInt({ message: 'Duration must be a whole number of days.' })
  @Min(1, { message: 'Duration must be at least 1 day.' })
  @Max(3650, { message: 'Duration must not exceed 3650 days.' })
  durationInDays?: number;

  @IsOptional()
  @IsIn(SUBSCRIPTION_TYPES, {
    message: `Subscription type must be one of ${SUBSCRIPTION_TYPES.join(', ')}.`,
  })
  subscriptionType?: string;

  @IsOptional()
  @IsBoolean({ message: 'Active status must be true or false.' })
  isActive?: boolean;
}
