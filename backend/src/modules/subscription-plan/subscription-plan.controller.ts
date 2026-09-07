import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateSubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from './dto/subscription-plan.dto';

/**
 * Reads are open to any authenticated user — guardians and students need the
 * plan catalogue to choose a subscription (see the guardian children page and
 * the student subscription page).
 *
 * Every mutation is Admin-only: these endpoints set `price`, which is what a
 * guardian is charged. Before this guard existed the global RolesGuard was
 * permissive for this controller (it only enforces when @Roles is present),
 * so any authenticated user could have changed plan pricing.
 */
@Controller('api/SubscriptionPlan')
export class SubscriptionPlanController {
  constructor(private readonly planService: SubscriptionPlanService) {}

  @Get()
  async getAll() {
    return this.planService.getAll();
  }

  @Get('active')
  async getActive() {
    return this.planService.getActive();
  }

  @Get('by-price-range')
  async getByPriceRange(
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    return this.planService.getByPriceRange(
      minPrice ? parseFloat(minPrice) : undefined,
      maxPrice ? parseFloat(maxPrice) : undefined,
    );
  }

  @Get('by-duration')
  async getByDuration(@Query('durationInDays') durationInDays?: string) {
    return this.planService.getByDuration(durationInDays ? parseInt(durationInDays) : undefined);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.planService.getById(parseInt(id));
  }

  @Post()
  @Roles('Admin')
  async create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.planService.create(dto);
  }

  @Put(':id')
  @Roles('Admin')
  async update(@Param('id') id: string, @Body() dto: UpdateSubscriptionPlanDto) {
    return this.planService.update(parseInt(id), dto);
  }

  @Put(':id/activate')
  @Roles('Admin')
  async activate(@Param('id') id: string) {
    return this.planService.activate(parseInt(id));
  }

  @Put(':id/deactivate')
  @Roles('Admin')
  async deactivate(@Param('id') id: string) {
    return this.planService.deactivate(parseInt(id));
  }

  @Delete(':id')
  @Roles('Admin')
  async delete(@Param('id') id: string) {
    return this.planService.delete(parseInt(id));
  }
}
