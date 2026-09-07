import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GradeLevelController } from './grade-level.controller';
import { GradeLevelService } from './grade-level.service';
import { GradeLevel, GradeLevelSchema } from './grade-level.schema';
import { GradeGroup, GradeGroupSchema } from '../grade-group/grade-group.schema';
import { Child, ChildSchema } from '../child/child.schema';

/**
 * GradeGroup and Child models are registered here (rather than importing their
 * modules) so the delete guard can count references without creating a
 * circular module dependency — GradeGroupModule already depends on GradeLevel.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GradeLevel.name, schema: GradeLevelSchema },
      { name: GradeGroup.name, schema: GradeGroupSchema },
      { name: Child.name, schema: ChildSchema },
    ]),
  ],
  controllers: [GradeLevelController],
  providers: [GradeLevelService],
  exports: [GradeLevelService],
})
export class GradeLevelModule {}
