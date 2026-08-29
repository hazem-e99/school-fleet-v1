import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { FilesService } from './files.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Public: <img> tags and the frontend image-proxy don't send an
   * Authorization header, so avatar URLs must load without a token — same
   * exposure as the old static /uploads/<hex> path. Ids are random 24-hex
   * ObjectIds, not enumerable.
   *
   * @Res() opts this handler out of the global response-envelope filter so the
   * raw byte stream is returned unwrapped.
   */
  @Public()
  @Get(':id')
  async getFile(@Param('id') id: string, @Res() res: Response): Promise<void> {
    return this.filesService.streamById(id, res);
  }
}
