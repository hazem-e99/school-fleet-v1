import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { DiscountRuleService } from './discount-rule.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDiscountRuleDto, UpdateDiscountRuleDto } from './dto/discount-rule.dto';

/**
 * Admin-only end to end, for the same reason as PricingRuleController: these
 * endpoints decide what a guardian is charged. Guardians see the effect of a
 * discount in the breakdown POST /api/Pricing/quote returns, never the rules.
 */
@Controller('api/DiscountRule')
@Roles('Admin')
export class DiscountRuleController {
  constructor(private readonly discountRuleService: DiscountRuleService) {}

  @Get('active')
  async getActive() {
    return this.discountRuleService.getActive();
  }

  @Get()
  async getAll() {
    return this.discountRuleService.getAll();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.discountRuleService.getById(parseInt(id));
  }

  @Post()
  async create(@Body() dto: CreateDiscountRuleDto, @CurrentUser() user: any) {
    return this.discountRuleService.create(dto, { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id/activate')
  async activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.discountRuleService.activate(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.discountRuleService.deactivate(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDiscountRuleDto, @CurrentUser() user: any) {
    return this.discountRuleService.update(parseInt(id), dto, { numericId: user?.numericId, role: user?.role });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.discountRuleService.delete(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }
}
