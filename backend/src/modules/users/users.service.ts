import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './user.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { Payment, PaymentDocument } from '../payment/payment.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscription-plan/subscription-plan.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { FilesService } from '../files/files.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(SubscriptionPlan.name) private planModel: Model<SubscriptionPlanDocument>,
    private readonly filesService: FilesService,
  ) {}

  private toViewModel(user: UserDocument) {
    const id = parseInt((user._id as any).toString().slice(-8), 16) % 100000;
    return {
      id,
      profileId: id,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      nationalId: user.nationalId,
      profilePictureUrl: user.profilePictureUrl,
      status: user.status,
      role: user.role,
      createdAt: (user as any).createdAt,
      updatedAt: (user as any).updatedAt,
      studentAcademicNumber: user.studentAcademicNumber,
      department: user.department,
      preferredArea: user.preferredArea,
      yearOfStudy: user.yearOfStudy,
      emergencyContact: user.emergencyContact,
      emergencyPhone: user.emergencyPhone,
      licenseNumber: user.licenseNumber,
      studentProfileId: user.role === 'Student' ? id : undefined,
    };
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const users = await this.userModel.find().select('-password').exec();
    const data = users.map((u) => this.toViewModel(u));
    return createApiResponse(data, 'Users retrieved successfully', true, data.length);
  }

  async getByRole(role: string): Promise<ApiResponse<any[]>> {
    const users = await this.userModel.find({ role }).select('-password').exec();
    const data = users.map((u) => this.toViewModel(u));
    return createApiResponse(data, `Users with role ${role} retrieved`, true, data.length);
  }

  async getById(id: string): Promise<ApiResponse<any>> {
    const user = await this.findUserByNumericId(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return createApiResponse(this.toViewModel(user));
  }

  async getByPhone(phone: string): Promise<ApiResponse<any[]>> {
    const users = await this.userModel.find({ phoneNumber: new RegExp(phone, 'i') }).select('-password').exec();
    const data = users.map((u) => this.toViewModel(u));
    return createApiResponse(data, null, true, data.length);
  }

  async getProfile(userId: string): Promise<ApiResponse<any>> {
    const user = await this.userModel.findById(userId).select('-password').exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return createApiResponse(this.toViewModel(user));
  }

  async updateProfile(userId: string, payload: any): Promise<ApiResponse<any>> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: payload }, { new: true })
      .select('-password')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return createApiResponse(this.toViewModel(user), 'Profile updated successfully');
  }

  /**
   * Hard delete: the user document is physically removed from the `users`
   * collection (Model.findByIdAndDelete), not soft-deleted — there is no
   * `isDeleted`/`deletedAt` field on the User schema. Auth is stateless JWT
   * (JwtStrategy re-fetches the user by id on every request), so a deleted
   * user's existing token stops working immediately, with no separate
   * session/refresh-token store to invalidate.
   *
   * Consistent with this app's no-`ref` data model (see
   * AdminSystemService.deleteAllCollections for the same pattern at purge
   * scale): related records that reference this user by numericId
   * (payments, subscriptions, bookings, notifications, attendance) are left
   * in place rather than force-deleted, since they are financial/audit
   * records the business needs preserved even after the account is gone.
   */
  async deleteUser(id: string): Promise<ApiResponse<boolean>> {
    const user = await this.findUserByNumericId(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.userModel.findByIdAndDelete(user._id);
    return createApiResponse(true, 'User deleted successfully');
  }

  async updateUser(id: string, payload: any): Promise<ApiResponse<any>> {
    const user = await this.findUserByNumericId(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.userModel
      .findByIdAndUpdate(user._id, { $set: payload }, { new: true })
      .select('-password')
      .exec();
    return createApiResponse(this.toViewModel(updated!), 'User updated');
  }

  async changePassword(userId: string, payload: { currentPassword: string; password: string; confirmPassword: string }): Promise<ApiResponse<boolean>> {
    if (payload.password !== payload.confirmPassword) {
      throw new AppException(400, ErrorCodes.PASSWORD_MISMATCH, 'Passwords do not match.');
    }
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isValid = await bcrypt.compare(payload.currentPassword, user.password);
    if (!isValid) {
      throw new AppException(400, ErrorCodes.CURRENT_PASSWORD_INCORRECT, 'Current password is incorrect.');
    }
    const hashed = await bcrypt.hash(payload.password, 10);
    await this.userModel.findByIdAndUpdate(userId, { password: hashed });
    return createApiResponse(true, 'Password changed successfully');
  }

  async updateProfilePicture(userId: string, fileUrl: string): Promise<ApiResponse<any>> {
    // Free the previous GridFS file (if the old value was one) so replacing an
    // avatar doesn't orphan chunks. Best-effort — never block the update on it.
    const current = await this.userModel.findById(userId).select('profilePictureUrl').exec();
    const prevMatch = current?.profilePictureUrl?.match(/^\/files\/([a-f0-9]{24})$/);
    if (prevMatch) {
      try {
        await this.filesService.deleteById(prevMatch[1]);
      } catch {
        // ignore
      }
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { profilePictureUrl: fileUrl }, { new: true })
      .select('-password')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return createApiResponse(this.toViewModel(user), 'Profile picture updated');
  }

  async getStudentsData(): Promise<ApiResponse<any[]>> {
    const students = await this.userModel.find({ role: 'Student' }).select('-password').exec();
    const data = students.map((u) => this.toViewModel(u));
    return createApiResponse(data, null, true, data.length);
  }

  async getStudentDataById(id: string): Promise<ApiResponse<any>> {
    const user = await this.findUserByNumericId(id);
    if (!user || user.role !== 'Student') {
      throw new NotFoundException('Student not found');
    }
    return createApiResponse(this.toViewModel(user));
  }

  /**
   * Admin overview: one row per student, joined with their current subscription
   * and most relevant payment. Does exactly 3 extra parallel queries (subs,
   * payments, plans) regardless of student count -- same fixed-query-count
   * pattern as PaymentService.getSubscriptionReport().
   *
   * Subscription selection: prefer the student's Active subscription; if none,
   * fall back to their most recently created subscription (any status).
   * Payment selection: prefer the student's most recent Accepted payment; if
   * none, fall back to their most recently created payment (any status).
   * Students with neither still get a row -- all subscription/payment fields null.
   */
  async getStudentsOverview(): Promise<ApiResponse<any[]>> {
    const [students, subs, payments, plans] = await Promise.all([
      this.userModel.find({ role: 'Student' }).select('-password').exec(),
      this.subModel.find().sort({ createdAt: -1 }).exec(),
      this.paymentModel.find().sort({ createdAt: -1 }).exec(),
      this.planModel.find().exec(),
    ]);

    const planMap = new Map<number, any>(plans.map((p) => [p.numericId, p]));

    const subsByStudent = new Map<number, typeof subs>();
    for (const s of subs) {
      const list = subsByStudent.get(s.studentId) ?? [];
      list.push(s);
      subsByStudent.set(s.studentId, list);
    }
    const paymentsByStudent = new Map<number, typeof payments>();
    for (const p of payments) {
      const list = paymentsByStudent.get(p.studentId) ?? [];
      list.push(p);
      paymentsByStudent.set(p.studentId, list);
    }

    const data = students.map((student) => {
      const id = student.numericId;
      const studentSubs = subsByStudent.get(id) ?? []; // already createdAt-desc from the sorted query
      const currentSub = studentSubs.find((s) => s.status === 'Active') ?? studentSubs[0] ?? null;
      const currentPlan = currentSub ? planMap.get(currentSub.subscriptionPlanId) : null;

      const studentPayments = paymentsByStudent.get(id) ?? []; // already createdAt-desc
      const currentPayment = studentPayments.find((p) => p.status === 'Accepted') ?? studentPayments[0] ?? null;

      return {
        // --- Registration / identity ---
        id,
        firstName: student.firstName,
        lastName: student.lastName,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        phoneNumber: student.phoneNumber || null,
        nationalId: student.nationalId || null,
        status: student.status,
        studentAcademicNumber: student.studentAcademicNumber || null,
        department: student.department || null,
        preferredArea: student.preferredArea || null,
        yearOfStudy: student.yearOfStudy || null,
        emergencyContact: student.emergencyContact || null,
        emergencyPhone: student.emergencyPhone || null,
        profilePictureUrl: student.profilePictureUrl || null,
        registeredAt: (student as any).createdAt || null,

        // --- Current subscription ---
        subscriptionId: currentSub?.numericId ?? null,
        subscriptionPlanId: currentSub?.subscriptionPlanId ?? null,
        subscriptionPlanName: currentPlan?.name ?? null,
        subscriptionPlanPrice: currentPlan?.price ?? null,
        subscriptionStatus: currentSub?.status ?? null,
        subscriptionStartDate: currentSub?.startDate ?? null,
        subscriptionEndDate: currentSub?.endDate ?? null,
        subscriptionIsActive: currentSub?.isActive ?? null,
        cancellationStatus: currentSub?.cancellationStatus ?? null,

        // --- Most relevant payment ---
        paymentId: currentPayment?.numericId ?? null,
        paymentAmount: currentPayment?.amount ?? null,
        paymentMethod: currentPayment?.paymentMethod ?? null,
        paymentChannel: currentPayment?.paymentChannel ?? null,
        paymentStatus: currentPayment?.status ?? null,
        paymentReferenceCode: currentPayment?.paymentReferenceCode ?? null,
        paymentDate: (currentPayment as any)?.createdAt ?? null,

        // --- History counts (cheap extras from data already in memory) ---
        totalSubscriptionsCount: studentSubs.length,
        totalPaymentsCount: studentPayments.length,
      };
    });

    return createApiResponse(data, null, true, data.length);
  }

  /**
   * One row per active child, joined with the child's guardian, current
   * subscription and most relevant payment. Mirrors getStudentsOverview but
   * over the `children` collection.
   */
  async getChildrenOverview(): Promise<ApiResponse<any[]>> {
    const [children, guardians, subs, payments, plans] = await Promise.all([
      this.childModel.find({ status: 'Active' }).sort({ createdAt: -1 }).exec(),
      this.userModel.find({ role: 'Guardian' }).select('-password').exec(),
      this.subModel.find().sort({ createdAt: -1 }).exec(),
      this.paymentModel.find().sort({ createdAt: -1 }).exec(),
      this.planModel.find().exec(),
    ]);

    const guardianMap = new Map<number, any>(guardians.map((g) => [g.numericId, g]));
    const planMap = new Map<number, any>(plans.map((p) => [p.numericId, p]));

    const subsByRider = new Map<number, typeof subs>();
    for (const s of subs) {
      const list = subsByRider.get(s.studentId) ?? [];
      list.push(s);
      subsByRider.set(s.studentId, list);
    }
    const paymentsByRider = new Map<number, typeof payments>();
    for (const p of payments) {
      const list = paymentsByRider.get(p.studentId) ?? [];
      list.push(p);
      paymentsByRider.set(p.studentId, list);
    }

    const data = children.map((child) => {
      const id = child.numericId;
      const guardian = guardianMap.get(child.guardianId);
      const riderSubs = subsByRider.get(id) ?? [];
      const currentSub = riderSubs.find((s) => s.status === 'Active') ?? riderSubs[0] ?? null;
      const currentPlan = currentSub ? planMap.get(currentSub.subscriptionPlanId) : null;
      const riderPayments = paymentsByRider.get(id) ?? [];
      const currentPayment = riderPayments.find((p) => p.status === 'Accepted') ?? riderPayments[0] ?? null;

      return {
        id,
        name: child.name,
        fullName: child.name,
        schoolName: child.schoolName,
        pickupAreaName: child.pickupAreaName,
        gender: child.gender || null,
        dateOfBirth: child.dateOfBirth || null,
        status: child.status,
        registeredAt: (child as any).createdAt || null,

        guardianId: child.guardianId,
        guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : null,
        guardianPhone: guardian?.phoneNumber || null,

        subscriptionId: currentSub?.numericId ?? null,
        subscriptionPlanId: currentSub?.subscriptionPlanId ?? null,
        subscriptionPlanName: currentPlan?.name ?? null,
        subscriptionPlanPrice: currentPlan?.price ?? null,
        subscriptionStatus: currentSub?.status ?? null,
        subscriptionStartDate: currentSub?.startDate ?? null,
        subscriptionEndDate: currentSub?.endDate ?? null,
        subscriptionIsActive: currentSub?.isActive ?? null,
        cancellationStatus: currentSub?.cancellationStatus ?? null,

        paymentId: currentPayment?.numericId ?? null,
        paymentAmount: currentPayment?.amount ?? null,
        paymentMethod: currentPayment?.paymentMethod ?? null,
        paymentChannel: currentPayment?.paymentChannel ?? null,
        paymentStatus: currentPayment?.status ?? null,
        paymentReferenceCode: currentPayment?.paymentReferenceCode ?? null,
        paymentDate: (currentPayment as any)?.createdAt ?? null,

        totalSubscriptionsCount: riderSubs.length,
        totalPaymentsCount: riderPayments.length,
      };
    });

    return createApiResponse(data, null, true, data.length);
  }

  /** One row per guardian: identity + child counts + active-subscription count. */
  async getGuardiansOverview(): Promise<ApiResponse<any[]>> {
    const [guardians, children, subs] = await Promise.all([
      this.userModel.find({ role: 'Guardian' }).select('-password').sort({ createdAt: -1 }).exec(),
      this.childModel.find().exec(),
      this.subModel.find({ isActive: true, status: 'Active' }).exec(),
    ]);

    const activeRiderIds = new Set(subs.map((s) => s.studentId));
    const childrenByGuardian = new Map<number, typeof children>();
    for (const c of children) {
      const list = childrenByGuardian.get(c.guardianId) ?? [];
      list.push(c);
      childrenByGuardian.set(c.guardianId, list);
    }

    const data = guardians.map((g) => {
      const kids = (childrenByGuardian.get(g.numericId) ?? []).filter((c) => c.status === 'Active');
      return {
        id: g.numericId,
        fullName: `${g.firstName} ${g.lastName}`.trim(),
        firstName: g.firstName,
        lastName: g.lastName,
        phoneNumber: g.phoneNumber || null,
        nationalId: g.nationalId || null,
        status: g.status,
        registeredAt: (g as any).createdAt || null,
        childrenCount: kids.length,
        activeSubscriptionsCount: kids.filter((c) => activeRiderIds.has(c.numericId)).length,
        children: kids.map((c) => ({
          id: c.numericId,
          name: c.name,
          fullName: c.name,
          schoolName: c.schoolName,
          pickupAreaName: c.pickupAreaName,
          hasActiveSubscription: activeRiderIds.has(c.numericId),
        })),
      };
    });

    return createApiResponse(data, null, true, data.length);
  }

  private async findUserByNumericId(numericId: string): Promise<UserDocument | null> {
    const id = parseInt(numericId);
    return this.userModel.findOne({ numericId: id }).select('-password').exec();
  }

  async findByMongoId(mongoId: string): Promise<UserDocument | null> {
    return this.userModel.findById(mongoId).select('-password').exec();
  }

  async findUserDocByNumericId(numericId: number): Promise<UserDocument | null> {
    return this.userModel.findOne({ numericId }).exec();
  }
}
