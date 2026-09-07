import { Body, Controller, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QuoteDto } from './dto/quote.dto';

/**
 * The only endpoint that hands a price to a client.
 *
 * It is a POST because it takes a basket, not because it changes anything —
 * nothing is written here. A guardian is scoped to their own children; an
 * admin may quote for any family, which is what the student detail and future
 * admin-side purchase screens need.
 */
@Controller('api/Pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('quote')
  @Roles('Admin', 'Guardian')
  async quote(
    @Body() dto: QuoteDto,
    @CurrentUser('numericId') userId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.pricingService.quoteResponse({
      subscriptionPlanId: dto.subscriptionPlanId,
      childIds: dto.childIds,
      installmentPlanId: dto.installmentPlanId,
      restrictToGuardianId: role === 'Admin' ? undefined : userId,
    });
  }
}
