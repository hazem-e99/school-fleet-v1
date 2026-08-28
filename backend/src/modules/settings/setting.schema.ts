import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingDocument = Setting & Document;

@Schema({ timestamps: true, collection: 'settings' })
export class Setting {
  @Prop({ default: 'School' })
  systemName: string;

  @Prop({ default: '/logo2.png' })
  logo: string;

  @Prop({ default: '#F6B900' })
  primaryColor: string;

  @Prop({ default: '#2E7D32' })
  secondaryColor: string;

  @Prop({ default: false })
  maintenanceMode: boolean;

  @Prop()
  maintenanceMessage: string;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
