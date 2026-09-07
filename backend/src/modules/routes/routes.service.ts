import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TripRoute, TripRouteDocument } from './route.schema';
import { Trip, TripDocument } from '../trips/trip.schema';
import { Bus, BusDocument } from '../buses/bus.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { parsePagination } from '../../common/pagination/paginate';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

@Injectable()
export class RoutesService {
  constructor(
    @InjectModel(TripRoute.name) private routeModel: Model<TripRouteDocument>,
    @InjectModel(Trip.name) private tripModel: Model<TripDocument>,
    @InjectModel(Bus.name) private busModel: Model<BusDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
  ) {}

  /** Routes saved before `isActive` existed read `undefined` and count as active. */
  private isRouteActive(route: TripRouteDocument): boolean {
    return route.isActive !== false;
  }

  private toViewModel(route: TripRouteDocument): any {
    return {
      id: route.numericId,
      name: route.name,
      code: route.code ?? null,
      startLocation: route.startLocation,
      endLocation: route.endLocation,
      distance: route.distance,
      estimatedTime: route.estimatedTime,
      stopLocations: route.stopLocations || [],
      stopLocationsCount: route.stopLocations?.length || 0,
      isActive: this.isRouteActive(route),
      createdAt: (route as any).createdAt,
      updatedAt: (route as any).updatedAt,
    };
  }

  async findByNumericId(id: number): Promise<TripRouteDocument | null> {
    return this.routeModel.findOne({ numericId: id }).exec();
  }

  private async loadRouteOrThrow(id: number): Promise<TripRouteDocument> {
    const route = await this.findByNumericId(id);
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  /**
   * Returns the ApiResponse envelope like every other service. This previously
   * returned a bare array; `routeAPI` in the frontend unwraps `.data`, so both
   * sides moved together.
   */
  async getAll(params?: { page?: string; pageSize?: string; search?: string; isActive?: string }): Promise<ApiResponse<any[]>> {
    const query: any = {};
    if (params?.search) {
      const rx = new RegExp(params.search, 'i');
      query.$or = [{ name: rx }, { code: rx }, { startLocation: rx }, { endLocation: rx }];
    }
    if (params?.isActive === 'true') query.isActive = { $ne: false };
    if (params?.isActive === 'false') query.isActive = false;

    // Pagination is opt-in: without a `page` parameter every route is returned,
    // so the existing driver/supervisor/trip-form callers keep working.
    if (!params?.page && !params?.pageSize) {
      const routes = await this.routeModel.find(query).sort({ name: 1 }).exec();
      const data = routes.map((r) => this.toViewModel(r));
      return createApiResponse(data, null, true, data.length);
    }

    const pagination = parsePagination(params.page, params.pageSize);
    const [routes, total] = await Promise.all([
      this.routeModel.find(query).sort({ name: 1 }).skip(pagination.skip).limit(pagination.pageSize).exec(),
      this.routeModel.countDocuments(query).exec(),
    ]);
    return createApiResponse(routes.map((r) => this.toViewModel(r)), null, true, total);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const route = await this.loadRouteOrThrow(id);
    return createApiResponse(this.toViewModel(route));
  }

  async create(dto: CreateRouteDto): Promise<ApiResponse<any>> {
    const route = await this.routeModel.create(dto);
    return createApiResponse(this.toViewModel(route), 'Route created successfully');
  }

  async update(id: number, dto: UpdateRouteDto): Promise<ApiResponse<any>> {
    const route = await this.loadRouteOrThrow(id);
    const updated = await this.routeModel
      .findByIdAndUpdate(route._id, { $set: dto }, { new: true })
      .exec();
    return createApiResponse(this.toViewModel(updated!), 'Route updated successfully');
  }

  /**
   * Deletable only while unreferenced. Buses and children point at a route by
   * numericId with no database-level foreign key, so deleting a route in use
   * would strand those references silently.
   */
  async delete(id: number): Promise<ApiResponse<boolean>> {
    const route = await this.loadRouteOrThrow(id);

    const [busCount, childCount] = await Promise.all([
      this.busModel.countDocuments({ routeId: route.numericId }).exec(),
      this.childModel.countDocuments({ routeId: route.numericId }).exec(),
    ]);

    if (busCount > 0 || childCount > 0) {
      const parts: string[] = [];
      if (busCount > 0) parts.push(`${busCount} bus(es)`);
      if (childCount > 0) parts.push(`${childCount} student(s)`);
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `This route still has ${parts.join(' and ')} assigned to it. Deactivate it instead of deleting it.`,
      );
    }

    await this.routeModel.findByIdAndDelete(route._id);
    return createApiResponse(true, 'Route deleted');
  }

  async activate(id: number): Promise<ApiResponse<boolean>> {
    const route = await this.loadRouteOrThrow(id);
    await this.routeModel.findByIdAndUpdate(route._id, { isActive: true });
    return createApiResponse(true, 'Route activated');
  }

  async deactivate(id: number): Promise<ApiResponse<boolean>> {
    const route = await this.loadRouteOrThrow(id);
    await this.routeModel.findByIdAndUpdate(route._id, { isActive: false });
    return createApiResponse(true, 'Route deactivated');
  }

  /** Buses serving a route, each with its current occupancy against capacity. */
  async getBuses(id: number): Promise<ApiResponse<any[]>> {
    const route = await this.loadRouteOrThrow(id);
    const buses = await this.busModel.find({ routeId: route.numericId }).sort({ busNumber: 1 }).exec();
    if (!buses.length) return createApiResponse([], null, true, 0);

    // One grouped count for the whole page rather than a query per bus.
    const counts = await this.childModel.aggregate<{ _id: number; count: number }>([
      { $match: { busId: { $in: buses.map((b) => b.numericId) }, status: 'Active' } },
      { $group: { _id: '$busId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map<number, number>(counts.map((c) => [c._id, c.count]));

    const data = buses.map((bus) => {
      const assigned = countMap.get(bus.numericId) ?? 0;
      return {
        id: bus.numericId,
        busNumber: bus.busNumber,
        capacity: bus.capacity,
        status: bus.status,
        assignedStudents: assigned,
        availableSeats: Math.max(0, (bus.capacity ?? 0) - assigned),
      };
    });
    return createApiResponse(data, null, true, data.length);
  }

  /** Server-paginated students on a route. */
  async getStudents(
    id: number,
    params?: { page?: string; pageSize?: string; search?: string; busId?: string },
  ): Promise<ApiResponse<any[]>> {
    const route = await this.loadRouteOrThrow(id);
    return this.listAssignedChildren({ routeId: route.numericId }, params);
  }

  /**
   * Shared implementation behind the route and bus student lists.
   *
   * Guardian and bus names are resolved with two `$in` queries over the page
   * rather than the per-row lookups the older view-model builders use, so cost
   * is fixed regardless of page size.
   */
  async listAssignedChildren(
    baseFilter: Record<string, any>,
    params?: { page?: string; pageSize?: string; search?: string; busId?: string },
  ): Promise<ApiResponse<any[]>> {
    const filter: any = { ...baseFilter, status: 'Active' };
    if (params?.busId) filter.busId = parseInt(params.busId, 10);
    if (params?.search) {
      const rx = new RegExp(params.search, 'i');
      filter.$or = [{ name: rx }, { schoolName: rx }, { pickupAreaName: rx }];
    }

    const pagination = parsePagination(params?.page, params?.pageSize);
    const [children, total] = await Promise.all([
      this.childModel.find(filter).sort({ name: 1 }).skip(pagination.skip).limit(pagination.pageSize).exec(),
      this.childModel.countDocuments(filter).exec(),
    ]);

    if (!children.length) return createApiResponse([], null, true, total);

    const busIds = [...new Set(children.map((c) => c.busId).filter((v): v is number => typeof v === 'number'))];
    const routeIds = [...new Set(children.map((c) => c.routeId).filter((v): v is number => typeof v === 'number'))];
    const [buses, routes] = await Promise.all([
      busIds.length
        ? this.busModel.find({ numericId: { $in: busIds } }).exec()
        : Promise.resolve([] as BusDocument[]),
      routeIds.length
        ? this.routeModel.find({ numericId: { $in: routeIds } }).exec()
        : Promise.resolve([] as TripRouteDocument[]),
    ]);
    const busMap = new Map<number, BusDocument>(buses.map((b) => [b.numericId, b] as [number, BusDocument]));
    const routeMap = new Map<number, TripRouteDocument>(
      routes.map((r) => [r.numericId, r] as [number, TripRouteDocument]),
    );

    const data = children.map((child) => ({
      id: child.numericId,
      name: child.name,
      schoolName: child.schoolName,
      pickupAreaName: child.pickupAreaName,
      guardianId: child.guardianId,
      gradeLevelId: child.gradeLevelId ?? null,
      routeId: child.routeId ?? null,
      routeName: child.routeId ? routeMap.get(child.routeId)?.name ?? null : null,
      busId: child.busId ?? null,
      busNumber: child.busId ? busMap.get(child.busId)?.busNumber ?? null : null,
    }));

    return createApiResponse(data, null, true, total);
  }
}
