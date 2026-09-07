import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Bus, BusDocument } from './bus.schema';
import { TripRoute, TripRouteDocument } from '../routes/route.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { parsePagination } from '../../common/pagination/paginate';

@Injectable()
export class BusesService {
  constructor(
    @InjectModel(Bus.name) private busModel: Model<BusDocument>,
    @InjectModel(TripRoute.name) private routeModel: Model<TripRouteDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
  ) {}

  private toViewModel(bus: BusDocument) {
    const id = parseInt((bus._id as any).toString().slice(-8), 16) % 100000;
    return {
      id,
      busNumber: bus.busNumber,
      speed: bus.speed,
      capacity: bus.capacity,
      status: bus.status,
      fuelLevel: bus.fuelLevel,
      location: bus.location,
      routeId: bus.routeId ?? null,
      updatedAt: (bus as any).updatedAt,
    };
  }

  /**
   * Number of children holding a seat on a bus.
   *
   * Counts EVERY assigned active child regardless of subscription or payment
   * status — an assignment is a reserved operational seat, so an unpaid child
   * still occupies one until they are unassigned.
   */
  async countAssignedChildren(busNumericId: number): Promise<number> {
    return this.childModel.countDocuments({ busId: busNumericId, status: 'Active' }).exec();
  }

  async getAll(params?: any): Promise<ApiResponse<any[]>> {
    const query: any = {};
    if (params?.busNumber) query.busNumber = new RegExp(params.busNumber, 'i');
    if (params?.status) query.status = params.status;
    if (params?.minSpeed > 0) query.speed = { ...query.speed, $gte: params.minSpeed };
    if (params?.maxSpeed > 0) query.speed = { ...query.speed, $lte: params.maxSpeed };
    if (params?.minCapacity > 0) query.capacity = { ...query.capacity, $gte: params.minCapacity };
    if (params?.maxCapacity > 0) query.capacity = { ...query.capacity, $lte: params.maxCapacity };

    const page = params?.page || 0;
    const pageSize = params?.pageSize || 1000;

    const buses = await this.busModel
      .find(query)
      .skip(page * pageSize)
      .limit(pageSize)
      .exec();

    const data = buses.map((b) => this.toViewModel(b));
    const total = await this.busModel.countDocuments(query);
    return createApiResponse(data, 'Buses retrieved successfully', true, total);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const bus = await this.findByNumericId(id);
    if (!bus) throw new NotFoundException('Bus not found');
    return createApiResponse(this.toViewModel(bus));
  }

  async create(busData: any): Promise<ApiResponse<any>> {
    try {
      const bus = await this.busModel.create(busData);
      return createApiResponse(this.toViewModel(bus), 'Bus created successfully', true);
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException('A bus with this number already exists.');
      }
      throw error;
    }
  }

  async update(id: number, busData: any): Promise<ApiResponse<any>> {
    const bus = await this.findByNumericId(id);
    if (!bus) throw new NotFoundException('Bus not found');
    const updated = await this.busModel
      .findByIdAndUpdate(bus._id, { $set: busData }, { new: true })
      .exec();
    return createApiResponse(this.toViewModel(updated!), 'Bus updated successfully');
  }

  async delete(id: number): Promise<ApiResponse<null>> {
    const bus = await this.findByNumericId(id);
    if (!bus) throw new NotFoundException('Bus not found');
    await this.busModel.findByIdAndDelete(bus._id);
    return createApiResponse(null, 'Bus deleted successfully');
  }

  /**
   * Indexed lookup on the stored `numericId`, matching every other service in
   * the codebase (child, payment, trips, routes, ...).
   *
   * This previously loaded the ENTIRE buses collection and recomputed each
   * id from `_id` in JS, on every getById/update/delete. The stored field is
   * written by the schema's pre('save') hook and backfilled for legacy rows by
   * DbMigrationService using the identical formula, so both paths resolve the
   * same bus — this is a pure performance fix, not a behaviour change.
   */
  async findByNumericId(numericId: number): Promise<BusDocument | null> {
    return this.busModel.findOne({ numericId }).exec();
  }

  /**
   * Assigns the bus to a route, or clears the assignment with `routeId: null`.
   *
   * Reassigning a bus that already carries children would silently move those
   * children onto a route they were never assigned to, so that is refused —
   * the children must be reassigned first.
   */
  async assignRoute(id: number, routeId: number | null | undefined): Promise<ApiResponse<any>> {
    const bus = await this.findByNumericId(id);
    if (!bus) throw new NotFoundException('Bus not found');

    if (routeId === null || routeId === undefined) {
      const assigned = await this.countAssignedChildren(bus.numericId);
      if (assigned > 0) {
        throw new AppException(
          409,
          ErrorCodes.CONFLICT,
          `This bus still carries ${assigned} student(s). Reassign them before removing it from its route.`,
        );
      }
      const cleared = await this.busModel
        .findByIdAndUpdate(bus._id, { $unset: { routeId: '' } }, { new: true })
        .exec();
      return createApiResponse(this.toViewModel(cleared!), 'Bus removed from its route');
    }

    const route = await this.routeModel.findOne({ numericId: routeId }).exec();
    if (!route) throw new NotFoundException('Route not found');
    if (route.isActive === false) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        'That route is disabled and cannot take new bus assignments.',
      );
    }

    if (bus.routeId && bus.routeId !== routeId) {
      const assigned = await this.countAssignedChildren(bus.numericId);
      if (assigned > 0) {
        throw new AppException(
          409,
          ErrorCodes.CONFLICT,
          `This bus still carries ${assigned} student(s) on its current route. Reassign them before moving the bus.`,
        );
      }
    }

    const updated = await this.busModel
      .findByIdAndUpdate(bus._id, { $set: { routeId } }, { new: true })
      .exec();
    return createApiResponse(this.toViewModel(updated!), 'Bus assigned to route');
  }

  /** Server-paginated students riding a bus. */
  async getStudents(
    id: number,
    params?: { page?: string; pageSize?: string; search?: string },
  ): Promise<ApiResponse<any[]>> {
    const bus = await this.findByNumericId(id);
    if (!bus) throw new NotFoundException('Bus not found');

    const filter: any = { busId: bus.numericId, status: 'Active' };
    if (params?.search) {
      const rx = new RegExp(params.search, 'i');
      filter.$or = [{ name: rx }, { schoolName: rx }, { pickupAreaName: rx }];
    }

    const pagination = parsePagination(params?.page, params?.pageSize);
    const [children, total] = await Promise.all([
      this.childModel.find(filter).sort({ name: 1 }).skip(pagination.skip).limit(pagination.pageSize).exec(),
      this.childModel.countDocuments(filter).exec(),
    ]);

    const data = children.map((child) => ({
      id: child.numericId,
      name: child.name,
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      guardianId: child.guardianId,
      gradeLevelId: child.gradeLevelId ?? null,
      routeId: child.routeId ?? null,
      busId: child.busId ?? null,
    }));

    return createApiResponse(data, null, true, total);
  }
}
