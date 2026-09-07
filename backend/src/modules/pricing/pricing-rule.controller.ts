import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { PricingRuleService } from './pricing-rule.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePricingRuleDto, UpdatePricingRuleDto } from './dto/pricing-rule.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * The pricing matrix. Admin-only end to end — every endpoint here decides what
 * a guardian is charged, so unlike the grade catalog there is no read that a
 * non-admin legitimately needs. Guardians see prices through
 * POST /api/Pricing/quote, which returns a total rather than the rules behind it.
 */
@Controller('api/PricingRule')
@Roles('Admin')
export class PricingRuleController {
  constructor(private readonly pricingRuleService: PricingRuleService) {}

  @Get('active')
  async getActive() {
    return this.pricingRuleService.getActive();
  }

  @Get()
  async getAll(
    @Query('subscriptionPlanId') subscriptionPlanId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.pricingRuleService.getAll({ subscriptionPlanId, isActive });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.pricingRuleService.getById(parseInt(id));
  }

  @Post()
  async create(@Body() dto: CreatePricingRuleDto, @CurrentUser() user: any) {
    return this.pricingRuleService.create(dto, { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id/activate')
  async activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricingRuleService.activate(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricingRuleService.deactivate(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePricingRuleDto, @CurrentUser() user: any) {
    return this.pricingRuleService.update(parseInt(id), dto, { numericId: user?.numericId, role: user?.role });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pricingRuleService.delete(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }
}
