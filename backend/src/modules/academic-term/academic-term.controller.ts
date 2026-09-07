import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { AcademicTermService } from './academic-term.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateAcademicTermDto, UpdateAcademicTermDto } from './dto/academic-term.dto';

/**
 * Admin-managed academic calendar. `active` is also readable by Guardians so
 * the subscription UI can show which term a Term/Annual plan covers.
 */
@Controller('api/AcademicTerm')
export class AcademicTermController {
  constructor(private readonly academicTermService: AcademicTermService) {}

  @Get('active')
  @Roles('Admin', 'Guardian')
  async getActive() {
    return this.academicTermService.getActive();
  }

  @Get()
  @Roles('Admin')
  async getAll() {
    return this.academicTermService.getAll();
  }

  @Get(':id')
  @Roles('Admin')
  async getById(@Param('id') id: string) {
    return this.academicTermService.getById(parseInt(id));
  }

  @Post()
  @Roles('Admin')
  async create(@Body() dto: CreateAcademicTermDto) {
    return this.academicTermService.create(dto);
  }

  @Put(':id')
  @Roles('Admin')
  async update(@Param('id') id: string, @Body() dto: UpdateAcademicTermDto) {
    return this.academicTermService.update(parseInt(id), dto);
  }

  @Put(':id/activate')
  @Roles('Admin')
  async activate(@Param('id') id: string) {
    return this.academicTermService.activate(parseInt(id));
  }

  @Put(':id/deactivate')
  @Roles('Admin')
  async deactivate(@Param('id') id: string) {
    return this.academicTermService.deactivate(parseInt(id));
  }

  @Delete(':id')
  @Roles('Admin')
  async delete(@Param('id') id: string) {
    return this.academicTermService.delete(parseInt(id));
  }
}
