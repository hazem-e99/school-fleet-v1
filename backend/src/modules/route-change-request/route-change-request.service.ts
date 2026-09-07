import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RouteChangeRequest, RouteChangeRequestDocument } from './route-change-request.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { TripRoute, TripRouteDocument } from '../routes/route.schema';
import { Bus, BusDocument } from '../buses/bus.schema';
import { User, UserDocument } from '../users/user.schema';
import { ChildService } from '../child/child.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { parsePagination } from '../../common/pagination/paginate';
import { CreateRouteChangeRequestDto, ReviewRouteChangeRequestDto } from './dto/route-change-request.dto';

@Injectable()
export class RouteChangeRequestService {
  private readonly logger = new Logger(RouteChangeRequestService.name);

  constructor(
    @InjectModel(RouteChangeRequest.name) private requestModel: Model<RouteChangeRequestDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(TripRoute.name) private routeModel: Model<TripRouteDocument>,
    @InjectModel(Bus.name) private busModel: Model<BusDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly childService: ChildService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Copied verbatim from StudentSubscriptionService: broadcast() with an empty
   * userIds list fans out to EVERY user, and a notification failure must never
   * fail the action that triggered it.
   */
  private async notifySafely(userIds: number[], title: string, message: string, type = 'Alert'): Promise<void> {
    if (!userIds.length) return;
    try {
      await this.notificationsService.broadcast({ userIds, title, message, type });
    } catch (error) {
      this.logger.error(`Failed to send notification: ${(error as Error)?.message}`, (error as Error)?.stack);
    }
  }

  private isRouteActive(route: TripRouteDocument): boolean {
    return route.isActive !== false;
  }

  private async toViewModels(requests: RouteChangeRequestDocument[]): Promise<any[]> {
    if (!requests.length) return [];

    const childIds = [...new Set(requests.map((r) => r.childId))];
    const routeIds = [
      ...new Set(
        requests
          .flatMap((r) => [r.currentRouteId, r.requestedRouteId, r.appliedRouteId])
          .filter((v): v is number => typeof v === 'number'),
      ),
    ];
    const busIds = [
      ...new Set(
        requests
          .flatMap((r) => [r.currentBusId, r.preferredBusId, r.appliedBusId])
          .filter((v): v is number => typeof v === 'number'),
      ),
    ];
    const guardianIds = [...new Set(requests.map((r) => r.guardianId))];

    const [children, routes, buses, guardians] = await Promise.all([
      this.childModel.find({ numericId: { $in: childIds } }).exec(),
      routeIds.length ? this.routeModel.find({ numericId: { $in: routeIds } }).exec() : Promise.resolve([] as TripRouteDocument[]),
      busIds.length ? this.busModel.find({ numericId: { $in: busIds } }).exec() : Promise.resolve([] as BusDocument[]),
      this.userModel.find({ numericId: { $in: guardianIds } }).exec(),
    ]);

    const childMap = new Map<number, ChildDocument>(children.map((c) => [c.numericId, c] as [number, ChildDocument]));
    const routeMap = new Map<number, TripRouteDocument>(routes.map((r) => [r.numericId, r] as [number, TripRouteDocument]));
    const busMap = new Map<number, BusDocument>(buses.map((b) => [b.numericId, b] as [number, BusDocument]));
    const guardianMap = new Map<number, UserDocument>(guardians.map((g) => [g.numericId, g] as [number, UserDocument]));

    const routeName = (id?: number | null) => (id != null ? routeMap.get(id)?.name ?? null : null);
    const busNumber = (id?: number | null) => (id != null ? busMap.get(id)?.busNumber ?? null : null);

    return requests.map((req) => {
      const guardian = guardianMap.get(req.guardianId);
      return {
        id: req.numericId,
        childId: req.childId,
        childName: childMap.get(req.childId)?.name ?? null,
        guardianId: req.guardianId,
        guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}`.trim() : null,
        guardianPhone: guardian?.phoneNumber ?? null,
        currentRouteId: req.currentRouteId ?? null,
        currentRouteName: routeName(req.currentRouteId),
        currentBusId: req.currentBusId ?? null,
        currentBusNumber: busNumber(req.currentBusId),
        requestedRouteId: req.requestedRouteId,
        requestedRouteName: routeName(req.requestedRouteId),
        preferredBusId: req.preferredBusId ?? null,
        preferredBusNumber: busNumber(req.preferredBusId),
        reason: req.reason ?? null,
        status: req.status,
        adminNotes: req.adminNotes ?? null,
        reviewedById: req.reviewedById ?? null,
        reviewedAt: req.reviewedAt?.toISOString() ?? null,
        appliedRouteId: req.appliedRouteId ?? null,
        appliedRouteName: routeName(req.appliedRouteId),
        appliedBusId: req.appliedBusId ?? null,
        appliedBusNumber: busNumber(req.appliedBusId),
        createdAt: (req as any).createdAt?.toISOString?.() ?? null,
      };
    });
  }

  /** A guardian may only ever act on their own child. */
  private async loadOwnedChild(childId: number, guardianId: number): Promise<ChildDocument> {
    const child = await this.childModel.findOne({ numericId: childId, status: 'Active' }).exec();
    if (!child || child.guardianId !== guardianId) {
      throw new AppException(
        403,
        ErrorCodes.VALIDATION_ERROR,
        'That child is not valid for this account.',
      );
    }
    return child;
  }

  async create(dto: CreateRouteChangeRequestDto, guardianId: number): Promise<ApiResponse<boolean>> {
    const child = await this.loadOwnedChild(dto.childId, guardianId);

    const route = await this.routeModel.findOne({ numericId: dto.requestedRouteId }).exec();
    if (!route) throw new NotFoundException('The selected route could not be found.');
    if (!this.isRouteActive(route)) {
      throw new AppException(409, ErrorCodes.CONFLICT, 'That route is not currently accepting students.');
    }

    if (child.routeId === dto.requestedRouteId && !dto.preferredBusId) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'That child is already on this route.',
      );
    }

    // A named bus must at least serve the requested route at request time; it
    // is re-validated again at approval, since it may fill up in between.
    if (dto.preferredBusId !== undefined && dto.preferredBusId !== null) {
      const bus = await this.busModel.findOne({ numericId: dto.preferredBusId }).exec();
      if (!bus) throw new NotFoundException('The selected bus could not be found.');
      if (bus.routeId !== dto.requestedRouteId) {
        throw new AppException(409, ErrorCodes.CONFLICT, 'That bus does not serve the selected route.');
      }
    }

    const open = await this.requestModel.findOne({ childId: child.numericId, status: 'Pending' }).exec();
    if (open) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        'There is already a route change request awaiting review for this child.',
      );
    }

    try {
      await this.requestModel.create({
        childId: child.numericId,
        guardianId,
        currentRouteId: child.routeId ?? undefined,
        currentBusId: child.busId ?? undefined,
        requestedRouteId: dto.requestedRouteId,
        preferredBusId: dto.preferredBusId ?? undefined,
        reason: dto.reason ?? undefined,
        status: 'Pending',
      });
    } catch (error: any) {
      // The partial unique index is the real guard — the check above is only
      // there to give a friendlier message first. Two submissions racing each
      // other land here.
      if (error?.code === 11000) {
        throw new AppException(
          409,
          ErrorCodes.CONFLICT,
          'There is already a route change request awaiting review for this child.',
        );
      }
      throw error;
    }

    const admins = await this.userModel.find({ role: 'Admin' }).exec();
    await this.notifySafely(
      admins.map((a) => a.numericId),
      'Route change requested',
      `A guardian has asked to move ${child.name} to ${route.name}.`,
    );

    return createApiResponse(true, 'Your route change request has been submitted for review.');
  }

  async getAll(params?: { status?: string; page?: string; pageSize?: string }): Promise<ApiResponse<any[]>> {
    const query: any = {};
    if (params?.status) query.status = params.status;

    const pagination = parsePagination(params?.page, params?.pageSize);
    const [requests, total] = await Promise.all([
      this.requestModel
        .find(query)
        // Pending first, then newest — the queue is a worklist, so anything
        // still awaiting a decision belongs at the top regardless of age.
        .sort({ status: 1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.pageSize)
        .exec(),
      this.requestModel.countDocuments(query).exec(),
    ]);

    const data = await this.toViewModels(requests);
    return createApiResponse(data, null, true, total);
  }

  async getMyRequests(guardianId: number): Promise<ApiResponse<any[]>> {
    const requests = await this.requestModel.find({ guardianId }).sort({ createdAt: -1 }).exec();
    const data = await this.toViewModels(requests);
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const request = await this.requestModel.findOne({ numericId: id }).exec();
    if (!request) throw new NotFoundException('Route change request not found');
    const [vm] = await this.toViewModels([request]);
    return createApiResponse(vm);
  }

  /**
   * Buses on the requested route that could actually take this child right
   * now: active, serving the route, and below capacity.
   *
   * Full buses are returned too, flagged rather than hidden — an admin using
   * the override needs to see them, and a picker that silently omits the
   * obvious choice is more confusing than one that explains why it is
   * unavailable.
   */
  async getEligibleBuses(id: number): Promise<ApiResponse<any[]>> {
    const request = await this.requestModel.findOne({ numericId: id }).exec();
    if (!request) throw new NotFoundException('Route change request not found');

    const buses = await this.busModel
      .find({ routeId: request.requestedRouteId })
      .sort({ busNumber: 1 })
      .exec();
    if (!buses.length) return createApiResponse([], null, true, 0);

    const counts = await this.childModel.aggregate<{ _id: number; count: number }>([
      { $match: { busId: { $in: buses.map((b) => b.numericId) }, status: 'Active' } },
      { $group: { _id: '$busId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map<number, number>(counts.map((c) => [c._id, c.count]));

    const data = buses.map((bus) => {
      // The child already occupies their seat if they are on this bus, so they
      // must not be counted against themselves.
      const raw = countMap.get(bus.numericId) ?? 0;
      const assigned = request.currentBusId === bus.numericId ? Math.max(0, raw - 1) : raw;
      const capacity = bus.capacity ?? 0;
      return {
        id: bus.numericId,
        busNumber: bus.busNumber,
        capacity,
        status: bus.status,
        assignedStudents: assigned,
        availableSeats: Math.max(0, capacity - assigned),
        isEligible: bus.status === 'Active' && assigned < capacity,
        ineligibleReason:
          bus.status !== 'Active'
            ? `Bus is ${bus.status}`
            : assigned >= capacity
              ? 'Bus is full'
              : null,
      };
    });

    return createApiResponse(data, null, true, data.length);
  }

  /**
   * Approve or reject.
   *
   * Everything is re-validated HERE, not at request time: a route may have
   * been disabled, a bus taken off the route or filled up, in the days a
   * request sat in the queue.
   *
   * The status transition uses a conditional findOneAndUpdate rather than a
   * read-then-write, so two admins reviewing the same request cannot both
   * apply — the loser matches nothing and gets a 409. That works on the
   * standalone production MongoDB, where a transaction is unavailable.
   *
   * Order matters on the non-atomic path: the assignment is applied FIRST and
   * the request is only then marked Approved. A failure in between leaves a
   * still-Pending request that the admin can retry, rather than an approved
   * request whose child was never moved.
   */
  async review(
    id: number,
    dto: ReviewRouteChangeRequestDto,
    admin: { numericId: number; role?: string },
  ): Promise<ApiResponse<any>> {
    const request = await this.requestModel.findOne({ numericId: id }).exec();
    if (!request) throw new NotFoundException('Route change request not found');
    if (request.status !== 'Pending') {
      throw new AppException(409, ErrorCodes.CONFLICT, 'This request has already been reviewed.');
    }

    const child = await this.childModel.findOne({ numericId: request.childId }).exec();
    const now = new Date();

    if (dto.status === 'Rejected') {
      const claimed = await this.requestModel
        .findOneAndUpdate(
          { numericId: id, status: 'Pending' },
          {
            $set: {
              status: 'Rejected',
              adminNotes: dto.adminNotes || null,
              reviewedById: admin.numericId,
              reviewedAt: now,
            },
          },
          { new: true },
        )
        .exec();
      if (!claimed) {
        throw new AppException(409, ErrorCodes.CONFLICT, 'This request has already been reviewed.');
      }

      await this.notifySafely(
        [request.guardianId],
        'Route change request rejected',
        dto.adminNotes
          ? `Your route change request for ${child?.name ?? 'your child'} was rejected. Note: ${dto.adminNotes}`
          : `Your route change request for ${child?.name ?? 'your child'} was rejected.`,
      );

      return createApiResponse({ applied: false }, 'Route change request rejected.');
    }

    // --- Approved ---
    const route = await this.routeModel.findOne({ numericId: request.requestedRouteId }).exec();
    if (!route) throw new NotFoundException('The requested route no longer exists.');
    if (!this.isRouteActive(route)) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `"${route.name}" has been disabled and cannot take new students. Reject this request, or re-enable the route first.`,
      );
    }

    const busId = dto.assignedBusId ?? request.preferredBusId ?? null;
    if (busId === null) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'Choose a bus on this route before approving — the guardian did not name one.',
      );
    }

    // ChildService.assign owns every assignment rule — route active, bus
    // serves the route, bus is Active, capacity, and the audited
    // over-capacity override. Reusing it means the approval path cannot
    // drift from the direct admin assignment path.
    await this.childService.assign(
      request.childId,
      {
        routeId: request.requestedRouteId,
        busId,
        allowOverCapacity: dto.allowOverCapacity,
      },
      admin,
    );

    // Only now is the request closed: had the assignment failed above, this
    // stays Pending and the admin can fix the cause and retry.
    const claimed = await this.requestModel
      .findOneAndUpdate(
        { numericId: id, status: 'Pending' },
        {
          $set: {
            status: 'Approved',
            adminNotes: dto.adminNotes || null,
            reviewedById: admin.numericId,
            reviewedAt: now,
            appliedRouteId: request.requestedRouteId,
            appliedBusId: busId,
          },
        },
        { new: true },
      )
      .exec();

    if (!claimed) {
      // Another admin closed it between the assignment and here. The child is
      // already where this request asked them to be, so the assignment stands
      // and only the bookkeeping is reported as lost.
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        'This request was reviewed by someone else while you were approving it. The child’s assignment has been applied — reload to see the current state.',
      );
    }

    const bus = await this.busModel.findOne({ numericId: busId }).exec();
    await this.notifySafely(
      [request.guardianId],
      'Route change approved',
      `${child?.name ?? 'Your child'} has been moved to ${route.name}${bus ? ` on bus ${bus.busNumber}` : ''}.`,
    );

    const [vm] = await this.toViewModels([claimed]);
    return createApiResponse(vm, 'Route change approved and applied.');
  }

  /** A guardian may withdraw their own request while it is still open. */
  async cancel(id: number, guardianId: number): Promise<ApiResponse<boolean>> {
    const request = await this.requestModel.findOne({ numericId: id }).exec();
    if (!request) throw new NotFoundException('Route change request not found');
    if (request.guardianId !== guardianId) {
      throw new AppException(403, ErrorCodes.VALIDATION_ERROR, 'That request does not belong to your account.');
    }

    const claimed = await this.requestModel
      .findOneAndUpdate({ numericId: id, status: 'Pending' }, { $set: { status: 'Cancelled' } }, { new: true })
      .exec();

    if (!claimed) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        'This request has already been reviewed and can no longer be withdrawn.',
      );
    }

    return createApiResponse(true, 'Route change request withdrawn.');
  }
}
