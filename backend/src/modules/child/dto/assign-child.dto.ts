import { IsBoolean, IsInt, IsOptional } from 'class-validator';

/**
 * Body of `PUT /api/Child/:id/assignment`.
 *
 * Passing `null` for either id clears that assignment. Clearing the route also
 * clears the bus, since a bus is only meaningful within its route.
 */
export class AssignChildDto {
  @IsOptional()
  @IsInt({ message: 'Route must be a valid selection.' })
  routeId?: number | null;

  @IsOptional()
  @IsInt({ message: 'Bus must be a valid selection.' })
  busId?: number | null;

  /**
   * Deliberate admin override for putting a child on a bus that is already at
   * capacity. Defaults to false: over-assignment is blocked, and every
   * override is recorded in the audit log.
   */
  @IsOptional()
  @IsBoolean()
  allowOverCapacity?: boolean;
}
