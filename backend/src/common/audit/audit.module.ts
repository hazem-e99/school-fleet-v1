import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { User, UserSchema } from '../../modules/users/user.schema';

/**
 * Global so any feature module can inject AuditService without each one
 * re-registering the model — audit writes are cross-cutting by nature.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      // Resolves actor names for the admin view without a lookup per row.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
