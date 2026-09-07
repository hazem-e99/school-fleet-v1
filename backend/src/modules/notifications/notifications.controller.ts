import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BroadcastNotificationDto, CreateNotificationDto } from './dto/notification.dto';

/**
 * Per-user endpoints (list/unread/mark-read/clear) are scoped by the caller's
 * own numericId and stay open to any authenticated user.
 *
 * The three system-wide endpoints — broadcast and the two `admin/*` ones — are
 * Admin-only. `broadcast` in particular fans a message out to every user in
 * the system when `userIds` is empty (notifications.service.ts), and it is
 * only ever called from the admin notifications page.
 *
 * `POST /` (create) intentionally stays open: the supervisor attendance page
 * uses it to notify a single student when they are marked absent.
 */
@Controller('api/Notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getAll(@CurrentUser('numericId') userId: number) {
    return this.notificationsService.getAll(userId);
  }

  @Get('unread')
  async getUnread(@CurrentUser('numericId') userId: number) {
    return this.notificationsService.getUnread(userId);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser('numericId') userId: number) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Get('admin/all')
  @Roles('Admin')
  async adminGetAll() {
    return this.notificationsService.adminGetAll();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.notificationsService.getById(parseInt(id));
  }

  @Post()
  async create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Post('broadcast')
  @Roles('Admin')
  async broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcast(dto);
  }

  @Put(':id/mark-read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(parseInt(id));
  }

  @Put('mark-all-read')
  async markAllAsRead(@CurrentUser('numericId') userId: number) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete('clear-all')
  async clearAll(@CurrentUser('numericId') userId: number) {
    return this.notificationsService.clearAll(userId);
  }

  @Delete('admin/:id')
  @Roles('Admin')
  async adminDelete(@Param('id') id: string) {
    return this.notificationsService.adminDelete(parseInt(id));
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.notificationsService.delete(parseInt(id));
  }
}
