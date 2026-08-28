import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/Forms')
export class FormsController {
  @Public()
  @Get()
  async get() {
    return {
      busStatuses: ['Active', 'Inactive', 'UnderMaintenance', 'OutOfService'],
      tripStatuses: ['Scheduled', 'InProgress', 'Completed', 'Cancelled'],
      bookingStatuses: ['Confirmed', 'Cancelled', 'NoShow', 'Completed'],
      paymentMethods: ['Offline', 'Online'],
      paymentStatuses: ['Pending', 'Accepted', 'Rejected', 'Cancelled', 'Expired'],
      roles: ['Admin', 'Guardian', 'Driver', 'Conductor', 'MovementManager'],
      notificationTypes: ['System', 'Alert', 'Announcement', 'Reminder', 'Booking'],
    };
  }
}
