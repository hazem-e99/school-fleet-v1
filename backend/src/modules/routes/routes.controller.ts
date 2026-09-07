import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

/**
 * Reads stay open to any authenticated user — drivers and supervisors read
 * routes from their trip pages. The student list is Admin-only, since it
 * exposes every child on a route.
 *
 * Mutations are Admin + MovementManager: both roles have a routes management
 * screen (dashboard/admin/routes and dashboard/movement-manager/routes).
 */
@Controller('api/Routes')
export class RoutesController {
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

  @Get(':id/buses')
  @Roles('Admin', 'MovementManager')
  async getBuses(@Param('id') id: string) {
    return this.routesService.getBuses(parseInt(id));
  }

  @Get(':id/students')
  @Roles('Admin')
  async getStudents(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('busId') busId?: string,
  ) {
    return this.routesService.getStudents(parseInt(id), { page, pageSize, search, busId });
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

  @Put(':id/activate')
  @Roles('Admin', 'MovementManager')
  async activate(@Param('id') id: string) {
    return this.routesService.activate(parseInt(id));
  }

  @Put(':id/deactivate')
  @Roles('Admin', 'MovementManager')
  async deactivate(@Param('id') id: string) {
    return this.routesService.deactivate(parseInt(id));
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
