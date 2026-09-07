import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicTermController } from './academic-term.controller';
import { AcademicTermService } from './academic-term.service';
import { AcademicTerm, AcademicTermSchema } from './academic-term.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AcademicTerm.name, schema: AcademicTermSchema },
    ]),
  ],
  controllers: [AcademicTermController],
  providers: [AcademicTermService],
  exports: [AcademicTermService],
})
export class AcademicTermModule {}
