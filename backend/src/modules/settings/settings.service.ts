import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Setting, SettingDocument } from './setting.schema';
import { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(@InjectModel(Setting.name) private settingModel: Model<SettingDocument>) {}

  async get() {
    let settings = await this.settingModel.findOne().exec();
    if (!settings) {
      settings = await this.settingModel.create({
        systemName: 'El Renad',
        logo: '/logo2.png',
        primaryColor: '#4F46E5',
        secondaryColor: '#0EA5E9',
        maintenanceMode: false,
      });
    }
    // maintenanceMode and language were missing from this response, so the
    // settings page read them back as false/'en' after every save and the
    // toggle appeared to reset itself.
    return {
      systemName: settings.systemName,
      logo: settings.logo,
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      maintenanceMode: settings.maintenanceMode ?? false,
      maintenanceMessage: settings.maintenanceMessage ?? null,
      language: settings.language ?? 'en',
    };
  }

  async update(payload: UpdateSettingsDto) {
    // Upsert with an empty filter so the single settings document is created
    // on first save rather than silently doing nothing on a fresh database.
    await this.settingModel.findOneAndUpdate({}, { $set: payload }, { upsert: true });
    return { success: true, message: 'Settings saved.' };
  }

  async getMaintenanceMode() {
    const settings = await this.settingModel.findOne().exec();
    return { maintenanceMode: settings?.maintenanceMode || false };
  }
}
