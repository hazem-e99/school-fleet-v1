import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { BusesService } from './buses.service';
import { BusDto } from './dto/bus.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssignBusRouteDto } from '../routes/dto/route.dto';

/**
 * Reads stay open to any authenticated user — drivers, supervisors, the live
 * tracking map and the trip forms all read the fleet.
 *
 * Mutations are Admin + MovementManager: both roles have a buses management
 * screen (dashboard/admin/buses and dashboard/movement-manager/buses).
 */
@Controller('api/Buses')
export class BusesController {
  constructor(private readonly busesService: BusesService) {}

  @Get()
  async getAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('busNumber') busNumber?: string,
    @Query('status') status?: string,
    @Query('minSpeed') minSpeed?: string,
    @Query('maxSpeed') maxSpeed?: string,
    @Query('minCapacity') minCapacity?: string,
    @Query('maxCapacity') maxCapacity?: string,
  ) {
    return this.busesService.getAll({
      page: page ? parseInt(page) : 0,
      pageSize: pageSize ? parseInt(pageSize) : 1000,
      busNumber: busNumber || '',
      status: status || '',
      minSpeed: minSpeed ? parseInt(minSpeed) : 0,
      maxSpeed: maxSpeed ? parseInt(maxSpeed) : 0,
      minCapacity: minCapacity ? parseInt(minCapacity) : 0,
      maxCapacity: maxCapacity ? parseInt(maxCapacity) : 0,
    });
  }

  @Post()
  @Roles('Admin', 'MovementManager')
  async create(@Body() busData: BusDto) {
    return this.busesService.create(busData);
  }

  @Get(':id/students')
  @Roles('Admin')
  async getStudents(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.busesService.getStudents(parseInt(id), { page, pageSize, search });
  }

  @Put(':id/route')
  @Roles('Admin', 'MovementManager')
  async assignRoute(@Param('id') id: string, @Body() dto: AssignBusRouteDto) {
    return this.busesService.assignRoute(parseInt(id), dto.routeId);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.busesService.getById(parseInt(id));
  }

  @Put(':id')
  @Roles('Admin', 'MovementManager')
  async update(@Param('id') id: string, @Body() busData: BusDto) {
    return this.busesService.update(parseInt(id), busData);
  }

  @Delete(':id')
  @Roles('Admin', 'MovementManager')
  async delete(@Param('id') id: string) {
    return this.busesService.delete(parseInt(id));
  }
}
