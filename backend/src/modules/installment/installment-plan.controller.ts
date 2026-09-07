import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { InstallmentPlanService } from './installment-plan.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateInstallmentPlanDto, UpdateInstallmentPlanDto } from './dto/installment-plan.dto';

/**
 * Instalment plan templates.
 *
 * `active` is readable by a Guardian as well as an Admin: the guardian has to
 * see which payment schedules are on offer before choosing one at checkout.
 * Everything else is Admin-only.
 */
@Controller('api/InstallmentPlan')
export class InstallmentPlanController {
  constructor(private readonly installmentPlanService: InstallmentPlanService) {}

  @Get('active')
  @Roles('Admin', 'Guardian')
  async getActive(@Query('subscriptionPlanId') subscriptionPlanId?: string) {
    return this.installmentPlanService.getActive(
      subscriptionPlanId ? parseInt(subscriptionPlanId, 10) : undefined,
    );
  }

  @Get()
  @Roles('Admin')
  async getAll() {
    return this.installmentPlanService.getAll();
  }

  @Get(':id')
  @Roles('Admin')
  async getById(@Param('id') id: string) {
    return this.installmentPlanService.getById(parseInt(id));
  }

  @Post()
  @Roles('Admin')
  async create(@Body() dto: CreateInstallmentPlanDto, @CurrentUser() user: any) {
    return this.installmentPlanService.create(dto, { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id/activate')
  @Roles('Admin')
  async activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.installmentPlanService.activate(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id/deactivate')
  @Roles('Admin')
  async deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.installmentPlanService.deactivate(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }

  @Put(':id')
  @Roles('Admin')
  async update(@Param('id') id: string, @Body() dto: UpdateInstallmentPlanDto, @CurrentUser() user: any) {
    return this.installmentPlanService.update(parseInt(id), dto, { numericId: user?.numericId, role: user?.role });
  }

  @Delete(':id')
  @Roles('Admin')
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.installmentPlanService.delete(parseInt(id), { numericId: user?.numericId, role: user?.role });
  }
}
