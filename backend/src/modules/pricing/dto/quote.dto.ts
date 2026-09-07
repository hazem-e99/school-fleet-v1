import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsOptional } from 'class-validator';

/**
 * A priced basket request. There is deliberately no `amount` field: the client
 * never proposes a price, it only asks what one would be.
 */
export class QuoteDto {
  @IsInt({ message: 'Select a subscription plan.' })
  subscriptionPlanId: number;

  @IsArray({ message: 'Select at least one child.' })
  @ArrayNotEmpty({ message: 'Select at least one child.' })
  @ArrayUnique({ message: 'The same child cannot be added twice.' })
  @ArrayMaxSize(20, { message: 'A single payment cannot cover more than 20 children.' })
  @IsInt({ each: true, message: 'Each child must be a valid id.' })
  childIds: number[];

  /** Optional: preview what this basket would look like on a payment schedule. */
  @IsOptional()
  @IsInt({ message: 'Instalment plan must be a valid id.' })
  installmentPlanId?: number;
}
