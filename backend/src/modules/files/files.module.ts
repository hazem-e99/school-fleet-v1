import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

// The Mongoose connection is global (MongooseModule.forRootAsync in app.module),
// so FilesService can @InjectConnection() without a forFeature here.
@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
