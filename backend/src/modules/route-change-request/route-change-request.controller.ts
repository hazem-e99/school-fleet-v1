import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { RouteChangeRequestService } from './route-change-request.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateRouteChangeRequestDto, ReviewRouteChangeRequestDto } from './dto/route-change-request.dto';

/**
 * Guardians raise and withdraw; admins review. A guardian can never reassign a
 * child directly — that is the whole point of the workflow.
 */
@Controller('api/RouteChangeRequest')
export class RouteChangeRequestController {
  constructor(private readonly service: RouteChangeRequestService) {}

  @Get('my-requests')
  @Roles('Guardian')
  async getMyRequests(@CurrentUser('numericId') userId: number) {
    return this.service.getMyRequests(userId);
  }

  @Get()
  @Roles('Admin')
  async getAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.getAll({ status, page, pageSize });
  }

  @Get(':id/eligible-buses')
  @Roles('Admin')
  async getEligibleBuses(@Param('id') id: string) {
    return this.service.getEligibleBuses(parseInt(id));
  }

  @Get(':id')
  @Roles('Admin')
  async getById(@Param('id') id: string) {
    return this.service.getById(parseInt(id));
  }

  @Post()
  @Roles('Guardian')
  async create(@Body() dto: CreateRouteChangeRequestDto, @CurrentUser('numericId') userId: number) {
    return this.service.create(dto, userId);
  }

  @Put(':id/review')
  @Roles('Admin')
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewRouteChangeRequestDto,
    @CurrentUser('numericId') userId: number,
    @CurrentUser('role') role: string,
  ) {
    return this.service.review(parseInt(id), dto, { numericId: userId, role });
  }

  @Put(':id/cancel')
  @Roles('Guardian')
  async cancel(@Param('id') id: string, @CurrentUser('numericId') userId: number) {
    return this.service.cancel(parseInt(id), userId);
  }
}
