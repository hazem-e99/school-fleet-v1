import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { LoginDTO } from './dto/login.dto';
import { StudentRegistrationDTO } from './dto/student-registration.dto';
import { GuardianRegistrationDTO } from './dto/guardian-registration.dto';
import { StaffRegistrationDTO } from './dto/staff-registration.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/Authentication')
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDTO) {
    return this.authService.login(loginDto);
  }

  /** @deprecated Students no longer self-register — see registration-guardian. Kept for back-compat. */
  @Public()
  @Post('registration-student')
  async registerStudent(@Body() dto: StudentRegistrationDTO) {
    return this.authService.registerStudent(dto);
  }

  @Public()
  @Post('registration-guardian')
  async registerGuardian(@Body() dto: GuardianRegistrationDTO) {
    return this.authService.registerGuardian(dto);
  }

  @Public()
  @Post('registration-staff')
  async registerStaff(@Body() dto: StaffRegistrationDTO) {
    return this.authService.registerStaff(dto);
  }
}
