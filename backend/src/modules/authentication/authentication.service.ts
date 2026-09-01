import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../users/user.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { LoginDTO } from './dto/login.dto';
import { StudentRegistrationDTO } from './dto/student-registration.dto';
import { GuardianRegistrationDTO } from './dto/guardian-registration.dto';
import { StaffRegistrationDTO } from './dto/staff-registration.dto';
import { ForgotPasswordDTO } from './dto/forgot-password.dto';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Injectable()
export class AuthenticationService {
  private idCounter = 1000;
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    private jwtService: JwtService,
  ) {
    this.initIdCounter();
  }

  private async initIdCounter() {
    const maxUser = await this.userModel.findOne().sort({ _id: -1 }).exec();
    if (maxUser) {
      this.idCounter = Math.max(this.idCounter, parseInt((maxUser._id as any).toString().slice(-4), 16) + 1000);
    }
  }

  private getNextId(): number {
    return ++this.idCounter;
  }

  async login(loginDto: LoginDTO): Promise<ApiResponse<any>> {
    const user = await this.userModel.findOne({ phoneNumber: loginDto.phoneNumber }).exec();
    if (!user) {
      throw new AppException(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid phone number or password.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new AppException(401, ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid phone number or password.');
    }

    if (user.status === 'Suspended') {
      throw new AppException(
        403,
        ErrorCodes.AUTH_ACCOUNT_SUSPENDED,
        'Your account has been suspended. Please contact support.',
      );
    }

    const numericId = parseInt((user._id as any).toString().slice(-8), 16) % 100000;
    const payload = {
      sub: user._id,
      role: user.role,
      numericId,
    };
    const token = this.jwtService.sign(payload);

    const loginViewModel = {
      id: numericId,
      profileId: numericId,
      token,
      phoneNumber: user.phoneNumber,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      role: user.role,
      expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    return createApiResponse(loginViewModel, 'Login successful', true);
  }

  async registerStudent(dto: StudentRegistrationDTO): Promise<ApiResponse<boolean>> {
    if (dto.password !== dto.confirmPassword) {
      throw new AppException(400, ErrorCodes.PASSWORD_MISMATCH, 'Passwords do not match.');
    }

    const existingPhone = await this.userModel.findOne({ phoneNumber: dto.phoneNumber }).exec();
    if (existingPhone) {
      throw new AppException(
        409,
        ErrorCodes.PHONE_ALREADY_REGISTERED,
        'An account with this phone number already exists.',
      );
    }

    const existingNationalId = await this.userModel.findOne({ nationalId: dto.nationalId }).exec();
    if (existingNationalId) {
      throw new AppException(
        409,
        ErrorCodes.NATIONAL_ID_ALREADY_REGISTERED,
        'An account with this national ID already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.userModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalId: dto.nationalId,
      phoneNumber: dto.phoneNumber,
      studentAcademicNumber: dto.studentAcademicNumber,
      department: dto.department,
      preferredArea: dto.preferredArea,
      yearOfStudy: dto.yearOfStudy,
      password: hashedPassword,
      role: 'Student',
      status: 'Active',
    });

    return createApiResponse(true, 'Student registered successfully. You can now sign in.', true);
  }

  /**
   * A guardian (parent) self-registers and adds one or more children in the
   * same request. The guardian is a User with role 'Guardian'; each child is a
   * document in the `children` collection linked by `guardianId` (the
   * guardian's numericId). Non-transactional to match the rest of the codebase;
   * a failure part-way surfaces as an error.
   */
  async registerGuardian(dto: GuardianRegistrationDTO): Promise<ApiResponse<boolean>> {
    if (dto.password !== dto.confirmPassword) {
      throw new AppException(400, ErrorCodes.PASSWORD_MISMATCH, 'Passwords do not match.');
    }

    const existingPhone = await this.userModel.findOne({ phoneNumber: dto.phoneNumber }).exec();
    if (existingPhone) {
      throw new AppException(
        409,
        ErrorCodes.PHONE_ALREADY_REGISTERED,
        'An account with this phone number already exists.',
      );
    }

    const existingNationalId = await this.userModel.findOne({ nationalId: dto.nationalId }).exec();
    if (existingNationalId) {
      throw new AppException(
        409,
        ErrorCodes.NATIONAL_ID_ALREADY_REGISTERED,
        'An account with this national ID already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const guardian = await this.userModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalId: dto.nationalId,
      phoneNumber: dto.phoneNumber,
      password: hashedPassword,
      role: 'Guardian',
      status: 'Active',
    });

    const guardianNumericId =
      guardian.numericId ??
      parseInt((guardian._id as any).toString().slice(-8), 16) % 100000;

    for (const child of dto.children) {
      await this.childModel.create({
        guardianId: guardianNumericId,
        name: child.name,
        schoolName: child.schoolName,
        pickupAreaName: child.pickupAreaName,
        gender: child.gender,
        dateOfBirth: child.dateOfBirth ? new Date(child.dateOfBirth) : undefined,
        status: 'Active',
      });
    }

    return createApiResponse(
      true,
      'Account created successfully. You can now sign in.',
      true,
    );
  }

  async registerStaff(dto: StaffRegistrationDTO): Promise<ApiResponse<boolean>> {
    const existingPhone = await this.userModel.findOne({ phoneNumber: dto.phoneNumber }).exec();
    if (existingPhone) {
      throw new AppException(
        409,
        ErrorCodes.PHONE_ALREADY_REGISTERED,
        'An account with this phone number already exists.',
      );
    }

    const defaultPassword = await bcrypt.hash('DefaultPass123!', 10);

    await this.userModel.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalId: dto.nationalId,
      phoneNumber: dto.phoneNumber,
      role: dto.role,
      password: defaultPassword,
      status: 'Active',
    });

    return createApiResponse(true, `${dto.role} registered successfully`, true);
  }

  /**
   * Password reset with no email/SMS channel: the caller proves ownership with
   * phone number + national ID, then sets a new password in the same request.
   */
  async forgotPassword(dto: ForgotPasswordDTO): Promise<ApiResponse<boolean>> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new AppException(400, ErrorCodes.PASSWORD_MISMATCH, 'Passwords do not match.');
    }

    const user = await this.userModel
      .findOne({ phoneNumber: dto.phoneNumber, nationalId: dto.nationalId })
      .exec();
    if (!user) {
      throw new AppException(
        400,
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        'No account matches that phone number and national ID.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userModel.findByIdAndUpdate(user._id, { password: hashedPassword });

    return createApiResponse(true, 'Password reset successfully. You can now sign in.', true);
  }
}
