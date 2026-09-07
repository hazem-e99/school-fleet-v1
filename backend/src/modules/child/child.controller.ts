import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ChildService } from './child.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildDto } from './dto/update-child.dto';
import { AssignChildDto } from './dto/assign-child.dto';
import { AdminUpdateChildDto } from './dto/admin-update-child.dto';

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

  /**
   * Admin assigns a child to a route and/or bus. Capacity is enforced here —
   * see ChildService.assign.
   */
  @Put(':id/assignment')
  @Roles('Admin')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignChildDto,
    @CurrentUser() user: any,
  ) {
    return this.childService.assign(parseInt(id), dto, {
      numericId: user?.numericId,
      role: user?.role,
    });
  }

  /**
   * Admin edit of a child's details. Declared before the bare `:id` PUT so the
   * more specific route wins — Nest matches in declaration order.
   *
   * Separate from the guardian PUT because it is not scoped to one family:
   * before this existed, an admin could not edit a child at all, and the
   * admin edit form silently did nothing.
   */
  /**
   * Everything the admin child detail page needs, in one call. Declared before
   * the bare `:id` GET so the more specific route wins.
   */
  @Get(':id/detail')
  @Roles('Admin')
  async getDetail(@Param('id') id: string) {
    return this.childService.getDetail(parseInt(id));
  }

  @Put(':id/admin')
  @Roles('Admin')
  async adminUpdate(
    @Param('id') id: string,
    @Body() dto: AdminUpdateChildDto,
    @CurrentUser() user: any,
  ) {
    return this.childService.adminUpdate(parseInt(id), dto, {
      numericId: user?.numericId,
      role: user?.role,
    });
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
