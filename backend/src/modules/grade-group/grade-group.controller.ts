import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { GradeGroupService } from './grade-group.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateGradeGroupDto, UpdateGradeGroupDto } from './dto/grade-group.dto';

/**
 * Grade groups are pure pricing configuration — no guardian-facing form needs
 * them, so every endpoint here is Admin-only.
 */
@Controller('api/GradeGroup')
@Roles('Admin')
export class GradeGroupController {
  constructor(private readonly gradeGroupService: GradeGroupService) {}

  @Get('active')
  async getActive() {
    return this.gradeGroupService.getActive();
  }

  @Get()
  async getAll() {
    return this.gradeGroupService.getAll();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.gradeGroupService.getById(parseInt(id));
  }

  @Post()
  async create(@Body() dto: CreateGradeGroupDto) {
    return this.gradeGroupService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateGradeGroupDto) {
    return this.gradeGroupService.update(parseInt(id), dto);
  }

  @Put(':id/activate')
  async activate(@Param('id') id: string) {
    return this.gradeGroupService.activate(parseInt(id));
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.gradeGroupService.deactivate(parseInt(id));
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.gradeGroupService.delete(parseInt(id));
  }
}
