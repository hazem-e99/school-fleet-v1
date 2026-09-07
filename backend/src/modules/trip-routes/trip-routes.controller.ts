import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { RoutesService } from '../routes/routes.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRouteDto, UpdateRouteDto } from '../routes/dto/route.dto';

/**
 * A second surface over the same RoutesService as `api/Routes` — kept because
 * the frontend still calls both. Guarding mirrors RoutesController exactly:
 * open reads, Admin/MovementManager mutations.
 *
 * Note the query parameters below are accepted and then ignored (getAll takes
 * no arguments). Wiring real pagination/filtering here is plan phase 3, along
 * with the shared pagination helper.
 */
@Controller('api/TripRoutes')
export class TripRoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  async getAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.routesService.getAll({ page, pageSize, search, isActive });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.routesService.getById(parseInt(id));
  }

  @Post()
  @Roles('Admin', 'MovementManager')
  async create(@Body() dto: CreateRouteDto) {
    return this.routesService.create(dto);
  }

  @Put(':id')
  @Roles('Admin', 'MovementManager')
  async update(@Param('id') id: string, @Body() dto: UpdateRouteDto) {
    return this.routesService.update(parseInt(id), dto);
  }

  @Delete(':id')
  @Roles('Admin', 'MovementManager')
  async delete(@Param('id') id: string) {
    return this.routesService.delete(parseInt(id));
  }
}
