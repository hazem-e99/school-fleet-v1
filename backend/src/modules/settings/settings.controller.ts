import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/settings.dto';

@Controller('api/Settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** Branding is read by every signed-in dashboard, so this stays open. */
  @Get()
  async get() {
    return this.settingsService.get();
  }

  /** Deliberately public: the login page checks it before authenticating. */
  @Get('maintenance-mode')
  @Public()
  async getMaintenanceMode() {
    return this.settingsService.getMaintenanceMode();
  }

  /**
   * Admin-only: this writes system branding and the maintenance-mode flag,
   * which can lock every other user out of the application.
   */
  @Put()
  @Roles('Admin')
  async update(@Body() payload: UpdateSettingsDto) {
    return this.settingsService.update(payload);
  }
}
