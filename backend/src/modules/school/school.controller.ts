import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { SchoolService } from './school.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';

/**
 * Admin-managed "School" list shown as a dropdown on the guardian
 * registration form, the child add/edit modal, and the admin child-edit
 * page. `active` must stay @Public() — registration happens before login
 * (see AuthenticationController.registerGuardian). Every mutating route,
 * plus the full unfiltered list (admin CRUD page only), is @Roles('Admin')
 * — the global RolesGuard is permissive when no @Roles() metadata is
 * present, so this must be explicit or any authenticated user could
 * create/edit/delete schools.
 */
@Controller('api/School')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  @Public()
  @Get('active')
  async getActive() {
    return this.schoolService.getActive();
  }

  @Roles('Admin')
  @Get()
  async getAll() {
    return this.schoolService.getAll();
  }

  @Roles('Admin')
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.schoolService.getById(parseInt(id));
  }

  @Roles('Admin')
  @Post()
  async create(@Body() dto: CreateSchoolDto) {
    return this.schoolService.create(dto);
  }

  @Roles('Admin')
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.update(parseInt(id), dto);
  }

  @Roles('Admin')
  @Put(':id/activate')
  async activate(@Param('id') id: string) {
    return this.schoolService.activate(parseInt(id));
  }

  @Roles('Admin')
  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.schoolService.deactivate(parseInt(id));
  }

  @Roles('Admin')
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.schoolService.delete(parseInt(id));
  }
}
