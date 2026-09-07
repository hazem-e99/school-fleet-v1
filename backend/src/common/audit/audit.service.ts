import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './audit-log.schema';
import { User, UserDocument } from '../../modules/users/user.schema';
import { createApiResponse, ApiResponse } from '../interfaces/api-response.interface';
import { parsePagination } from '../pagination/paginate';

export interface AuditEntry {
  entityType: string;
  entityId: number;
  action: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  actorId?: number;
  actorRole?: string;
  note?: string;
}

/**
 * Escapes a caller-supplied string for safe use inside a RegExp.
 *
 * The action filter is a prefix match built from a query parameter, so an
 * unescaped `.` or `(` would either match more than intended or throw on an
 * invalid pattern. Written as an explicit character set rather than a
 * character-class regex because the escaping is easier to read and to verify.
 */
const REGEXP_SPECIAL_CHARS = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

function escapeRegExp(value: string): string {
  return Array.from(value)
    .map((char) => (REGEXP_SPECIAL_CHARS.has(char) ? `\\${char}` : char))
    .join('');
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Best-effort write — an audit failure must never fail the action that was
   * being audited, the same rule the codebase already applies to
   * notifications (see StudentSubscriptionService.notifySafely).
   *
   * The tradeoff is deliberate: losing an audit row is preferable to failing
   * a legitimate assignment. If audit becomes compliance-critical it should
   * move inside the caller's transaction instead.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.auditModel.create(entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.entityType}#${entry.entityId} (${entry.action}): ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
    }
  }

  /** Most recent entries for one entity, newest first. */
  async getForEntity(entityType: string, entityId: number, limit = 50): Promise<AuditLogDocument[]> {
    return this.auditModel
      .find({ entityType, entityId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Convenience wrapper for configuration changes, which all share the same
   * shape: an admin edited an admin-managed rule.
   *
   * Financial configuration is the case that most needs a trail — a pricing
   * rule quietly changed is not visible in any other record, because
   * subscriptions snapshot their price and therefore keep showing the old one.
   */
  async recordConfigChange(
    entityType: string,
    entityId: number,
    action: string,
    payload: { before?: Record<string, any>; after?: Record<string, any>; note?: string },
    actor?: { numericId?: number; role?: string },
  ): Promise<void> {
    await this.record({
      entityType,
      entityId,
      action,
      before: payload.before,
      after: payload.after,
      note: payload.note,
      actorId: actor?.numericId,
      actorRole: actor?.role,
    });
  }

  /** Paginated, filterable read for the admin audit view. */
  async search(params: {
    entityType?: string;
    entityId?: number;
    action?: string;
    actorId?: number;
    page?: string;
    pageSize?: string;
  }): Promise<ApiResponse<any[]>> {
    const query: any = {};
    if (params.entityType) query.entityType = params.entityType;
    if (params.entityId !== undefined && Number.isFinite(params.entityId)) query.entityId = params.entityId;
    // Prefix match, so 'assignment' finds both assignment.updated and
    // assignment.overCapacityOverride without the caller knowing every suffix.
    if (params.action) query.action = new RegExp('^' + escapeRegExp(params.action));
    if (params.actorId !== undefined && Number.isFinite(params.actorId)) query.actorId = params.actorId;

    const pagination = parsePagination(params.page, params.pageSize);
    const [entries, total] = await Promise.all([
      this.auditModel.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.pageSize).exec(),
      this.auditModel.countDocuments(query).exec(),
    ]);

    const actorIds = [...new Set(entries.map((e) => e.actorId).filter((v): v is number => typeof v === 'number'))];
    const actors = actorIds.length
      ? await this.userModel.find({ numericId: { $in: actorIds } }).exec()
      : ([] as UserDocument[]);
    const actorMap = new Map<number, UserDocument>(actors.map((a) => [a.numericId, a] as [number, UserDocument]));

    const data = entries.map((entry) => {
      const actor = entry.actorId != null ? actorMap.get(entry.actorId) : null;
      return {
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
        actorId: entry.actorId ?? null,
        actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : null,
        actorRole: entry.actorRole ?? null,
        note: entry.note ?? null,
        at: (entry as any).createdAt?.toISOString?.() ?? null,
      };
    });

    return createApiResponse(data, null, true, total);
  }

  /** Distinct action names present in the log, for the admin filter. */
  async getActions(): Promise<ApiResponse<string[]>> {
    const actions = (await this.auditModel.distinct('action').exec()) as string[];
    return createApiResponse(actions.sort(), null, true, actions.length);
  }
}
