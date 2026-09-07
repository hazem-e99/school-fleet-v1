import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRouteChangeRequestDto {
  @IsInt({ message: 'Select a child.' })
  childId: number;

  @IsInt({ message: 'Select the route you would like to move to.' })
  requestedRouteId: number;

  /** Optional — the admin picks a bus at approval time when this is absent. */
  @IsOptional()
  @IsInt({ message: 'Preferred bus must be a valid id.' })
  preferredBusId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters.' })
  reason?: string;
}

export class ReviewRouteChangeRequestDto {
  @IsIn(['Approved', 'Rejected'], { message: 'Decision must be Approved or Rejected.' })
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes must not exceed 500 characters.' })
  adminNotes?: string;

  /**
   * The bus to place the child on. Optional when the guardian named a
   * preferred bus, required otherwise — the service enforces that rather than
   * the DTO, so the message can explain why.
   */
  @IsOptional()
  @IsInt({ message: 'Assigned bus must be a valid id.' })
  assignedBusId?: number;

  /** Explicit, audited override of the bus capacity limit. */
  @IsOptional()
  @IsBoolean()
  allowOverCapacity?: boolean;
}
