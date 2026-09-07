import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DbMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DbMigrationService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async onApplicationBootstrap() {
    this.logger.log('🔄 Checking database for missing numeric IDs...');
    try {
      const db = this.connection.db;
      if (!db) {
        this.logger.error('❌ Mongoose connection DB is undefined.');
        return;
      }
      const collections = await db.listCollections().toArray();
      const targetCollections = [
        'users',
        'children',
        'buses',
        'trips',
        'tripbookings',
        'payments',
        'notifications',
        'subscriptionplans',
        'studentsubscriptions',
        'routes',
        'attendance',
        'voting_surveys',
        'vote_responses',
        // Every new collection MUST be listed here, or documents inserted
        // outside Mongoose (seed scripts use the raw driver) never receive a
        // numericId and become unreachable by every findOne({ numericId })
        // lookup in the app.
        'gradelevels',
        'gradegroups',
        'academicterms',
        'pricingrules',
        'discountrules',
        'installmentplans',
        'studentinstallments',
        'routechangerequests',
      ];

      for (const col of collections) {
        if (!targetCollections.includes(col.name)) continue;
        const collection = db.collection(col.name);
        
        // Find all documents missing numericId
        const cursor = collection.find({ numericId: { $exists: false } });
        let count = 0;
        
        while (await cursor.hasNext()) {
          const doc = await cursor.next();
          if (doc) {
            const numericId = parseInt(doc._id.toString().slice(-8), 16) % 100000;
            await collection.updateOne({ _id: doc._id }, { $set: { numericId } });
            count++;
          }
        }
        
        if (count > 0) {
          this.logger.log(`  Updated ${count} documents in collection '${col.name}' with numericId.`);
        }
      }
      this.logger.log('✅ Database numeric ID check complete.');

      await this.backfillSubscriptionType(db);
      await this.backfillRouteIsActive(db);
      await this.reportIncompleteRoutes(db);
    } catch (error: any) {
      this.logger.error('❌ Failed to run database migration:', error.stack);
    }
  }

  /**
   * Backfills `subscriptionType` on plans created before the field existed.
   *
   * 'Monthly' is the correct value for every legacy plan: it means "rolling,
   * dated by durationInDays", which is exactly how all of them have always
   * behaved. Without this, a legacy plan reads `undefined` and would be
   * indistinguishable from a Term plan awaiting an academic term.
   *
   * Idempotent — only touches documents where the field is absent.
   */
  // Typed off the Mongoose connection rather than importing from 'mongodb':
  // the project resolves two copies of the driver (a direct dependency plus
  // mongoose's nested one) and their Db types are not assignable.
  private async backfillSubscriptionType(db: NonNullable<Connection['db']>): Promise<void> {
    const result = await db
      .collection('subscriptionplans')
      .updateMany({ subscriptionType: { $exists: false } }, { $set: { subscriptionType: 'Monthly' } });

    if (result.modifiedCount > 0) {
      this.logger.log(`  Backfilled subscriptionType='Monthly' on ${result.modifiedCount} plan(s).`);
    }
  }

  /**
   * Routes created before `isActive` existed read `undefined`. Every check
   * treats that as active, but backfilling makes the stored data match the
   * behaviour so admin filters and indexes work on a consistent field.
   */
  private async backfillRouteIsActive(db: NonNullable<Connection['db']>): Promise<void> {
    const result = await db
      .collection('routes')
      .updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });

    if (result.modifiedCount > 0) {
      this.logger.log(`  Backfilled isActive=true on ${result.modifiedCount} route(s).`);
    }
  }

  /**
   * Reports routes missing the fields the admin/movement-manager pages used to
   * drop silently.
   *
   * Both pages posted `startPoint`/`endPoint`/`estimatedDuration`, which are
   * not schema fields, so `startLocation`/`endLocation`/`estimatedTime` were
   * never saved on routes created through the UI. This only warns — the
   * missing values are real data an admin has to re-enter, and guessing them
   * would be worse than flagging them.
   */
  private async reportIncompleteRoutes(db: NonNullable<Connection['db']>): Promise<void> {
    const incomplete = await db
      .collection('routes')
      .find({
        $or: [
          { startLocation: { $in: [null, ''] } },
          { startLocation: { $exists: false } },
          { endLocation: { $in: [null, ''] } },
          { endLocation: { $exists: false } },
          { estimatedTime: { $in: [null, ''] } },
          { estimatedTime: { $exists: false } },
        ],
      })
      .project({ name: 1, numericId: 1 })
      .toArray();

    if (incomplete.length > 0) {
      const names = incomplete.map((r) => `${r.name ?? 'unnamed'}#${r.numericId ?? '?'}`).join(', ');
      this.logger.warn(
        `  ⚠ ${incomplete.length} route(s) are missing start/end/estimated-time — they were created while the admin form was posting the wrong field names. Re-enter these in the routes page: ${names}`,
      );
    }
  }
}
