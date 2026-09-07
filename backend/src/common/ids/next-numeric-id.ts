import { Model } from 'mongoose';

/**
 * Collision-safe creation for collections that use the app's `numericId`
 * convention.
 *
 * Every schema generates `numericId` in a pre('save') hook as
 * `parseInt(_id.toString().slice(-8), 16) % 100000` and indexes it unique.
 * That namespace is only 100,000 values and there is NO collision handling
 * anywhere in the codebase — a collision surfaces to the user as a bare 409
 * "duplicate" from AllExceptionsFilter and the write is simply lost.
 *
 * The existing collections have lived with that. New high-volume collections
 * (installment schedules in particular: N rows per child per subscription)
 * make it materially more likely, so creates on those go through this helper,
 * which retries with a freshly generated id on a duplicate-key error.
 *
 * This deliberately does NOT change the existing id scheme or migrate
 * anything — it only makes new writes survive a collision.
 */

const DUPLICATE_KEY_ERROR = 11000;
const DEFAULT_ATTEMPTS = 5;

/** True when the error is a Mongo duplicate-key violation on `numericId`. */
function isNumericIdCollision(error: any): boolean {
  if (error?.code !== DUPLICATE_KEY_ERROR) return false;
  // keyPattern/keyValue name the offending index; fall back to the message.
  if (error?.keyPattern && 'numericId' in error.keyPattern) return true;
  if (error?.keyValue && 'numericId' in error.keyValue) return true;
  return /numericId/i.test(String(error?.message || ''));
}

/** Generates a candidate id in the same 0..99,999 space the schemas use. */
function randomNumericId(): number {
  return Math.floor(Math.random() * 100000);
}

/**
 * Creates a document, retrying on a `numericId` collision.
 *
 * The first attempt lets the schema's own pre('save') hook derive the id from
 * the ObjectId (preserving existing behaviour exactly); subsequent attempts
 * supply an explicit random id, which the hook leaves alone because it only
 * fills in a missing value.
 *
 * Any other duplicate-key error (e.g. a unique `busNumber`) is rethrown
 * untouched so callers keep their existing, more specific error handling.
 */
export async function createWithNumericId<T>(
  model: Model<T>,
  doc: Record<string, any>,
  attempts = DEFAULT_ATTEMPTS,
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const payload = attempt === 0 ? doc : { ...doc, numericId: randomNumericId() };
      const created = await model.create(payload as any);
      return created as T;
    } catch (error: any) {
      if (!isNumericIdCollision(error)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}
