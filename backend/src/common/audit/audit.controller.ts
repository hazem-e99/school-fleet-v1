import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../decorators/roles.decorator';

/**
 * Admin-only read of the audit trail.
 *
 * There was no way to read this at all before: the over-capacity assignment
 * override is only an acceptable escape hatch because it leaves a record, and
 * a record nobody can see is not a control.
 */
@Controller('api/AuditLog')
@Roles('Admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('actions')
  async getActions() {
    return this.auditService.getActions();
  }

  @Get()
  async search(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditService.search({
      entityType,
      entityId: entityId !== undefined ? parseInt(entityId, 10) : undefined,
      action,
      actorId: actorId !== undefined ? parseInt(actorId, 10) : undefined,
      page,
      pageSize,
    });
  }
}
