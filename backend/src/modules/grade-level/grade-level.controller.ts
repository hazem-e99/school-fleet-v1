import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { GradeLevelService } from './grade-level.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateGradeLevelDto, UpdateGradeLevelDto } from './dto/grade-level.dto';

/**
 * Admin-managed grade catalog.
 *
 * `active` is readable by Admin and Guardian: the guardian's add/edit child
 * form needs the grade dropdown. It is NOT @Public() — unlike YearOfStudy,
 * which is public because student self-registration happens pre-login. There
 * is no pre-login form that needs grades, so it stays behind auth.
 */
@Controller('api/GradeLevel')
export class GradeLevelController {
  constructor(private readonly gradeLevelService: GradeLevelService) {}

  @Get('active')
  @Roles('Admin', 'Guardian')
  async getActive() {
    return this.gradeLevelService.getActive();
  }

  @Get()
  @Roles('Admin')
  async getAll() {
    return this.gradeLevelService.getAll();
  }

  @Get(':id')
  @Roles('Admin')
  async getById(@Param('id') id: string) {
    return this.gradeLevelService.getById(parseInt(id));
  }

  @Post()
  @Roles('Admin')
  async create(@Body() dto: CreateGradeLevelDto) {
    return this.gradeLevelService.create(dto);
  }

  @Put(':id')
  @Roles('Admin')
  async update(@Param('id') id: string, @Body() dto: UpdateGradeLevelDto) {
    return this.gradeLevelService.update(parseInt(id), dto);
  }

  @Put(':id/activate')
  @Roles('Admin')
  async activate(@Param('id') id: string) {
    return this.gradeLevelService.activate(parseInt(id));
  }

  @Put(':id/deactivate')
  @Roles('Admin')
  async deactivate(@Param('id') id: string) {
    return this.gradeLevelService.deactivate(parseInt(id));
  }

  @Delete(':id')
  @Roles('Admin')
  async delete(@Param('id') id: string) {
    return this.gradeLevelService.delete(parseInt(id));
  }
}
