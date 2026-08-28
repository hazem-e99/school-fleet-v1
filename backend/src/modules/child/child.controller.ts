import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ChildService } from './child.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';

/**
 * Guardian-facing CRUD for a guardian's own children, plus admin read
 * endpoints. Route order: literal segments before the `:id` wildcard.
 */
@Controller('api/Child')
export class ChildController {
  constructor(private readonly childService: ChildService) {}

  @Get('my-children')
  @Roles('Guardian')
  async getMyChildren(@CurrentUser('numericId') guardianId: number) {
    return this.childService.getMyChildren(guardianId);
  }

  @Post()
  @Roles('Guardian')
  async create(
    @CurrentUser('numericId') guardianId: number,
    @Body() dto: CreateChildDto,
  ) {
    return this.childService.createForGuardian(guardianId, dto);
  }

  @Get('all')
  @Roles('Admin')
  async getAll() {
    return this.childService.getAll();
  }

  @Get('by-guardian/:guardianId')
  @Roles('Admin')
  async getByGuardian(@Param('guardianId') guardianId: string) {
    return this.childService.getByGuardian(parseInt(guardianId));
  }

  @Put(':id')
  @Roles('Guardian')
  async update(
    @Param('id') id: string,
    @CurrentUser('numericId') guardianId: number,
    @Body() dto: UpdateChildDto,
  ) {
    return this.childService.update(parseInt(id), guardianId, dto);
  }

  @Delete(':id')
  @Roles('Guardian')
  async remove(
    @Param('id') id: string,
    @CurrentUser('numericId') guardianId: number,
  ) {
    return this.childService.remove(parseInt(id), guardianId);
  }

  @Get(':id')
  @Roles('Admin', 'Guardian')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const childId = parseInt(id);
    if (user?.role === 'Guardian') {
      return this.childService.getByIdForGuardian(childId, user.numericId);
    }
    return this.childService.getById(childId);
  }
}
