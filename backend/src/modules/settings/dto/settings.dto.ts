import { IsBoolean, IsHexColor, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The first real DTO this endpoint has had. It was `@Body() payload: any`,
 * which the global ValidationPipe skips entirely (no metatype to validate
 * against), so it accepted anything — including a client-invented `id` and
 * `updatedAt` that Mongoose then silently discarded.
 *
 * Every field is optional: the settings page saves the whole form, but other
 * callers (and future partial updates) should not have to send colours to
 * change a name.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'System name cannot be empty.' })
  @MaxLength(100, { message: 'System name must not exceed 100 characters.' })
  systemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Logo path must not exceed 500 characters.' })
  logo?: string;

  @IsOptional()
  @IsHexColor({ message: 'Primary colour must be a hex colour, e.g. #4F46E5.' })
  primaryColor?: string;

  @IsOptional()
  @IsHexColor({ message: 'Secondary colour must be a hex colour, e.g. #0EA5E9.' })
  secondaryColor?: string;

  /**
   * Turning this on blocks every non-admin from signing in — see the
   * maintenance check in useAuth. Admin-only, enforced on the controller.
   */
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Maintenance message must not exceed 500 characters.' })
  maintenanceMessage?: string;

  @IsOptional()
  @IsIn(['en', 'ar'], { message: 'Language must be en or ar.' })
  language?: string;
}
