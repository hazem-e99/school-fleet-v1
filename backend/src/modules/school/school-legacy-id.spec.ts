import { SchoolService } from './school.service';

/**
 * Regression guard for a production bug: the admin settings page listed the
 * schools correctly, but Edit / Deactivate / Delete on any of them returned
 * "School not found".
 *
 * Cause: `toViewModel` derives the displayed id from `_id`, while every lookup
 * read the stored `numericId` field. Rows created outside Mongoose's
 * pre('save') hook — a seed script, insertMany, an upsert — have no stored
 * value, so the two disagreed and the lookup missed a row the table had just
 * rendered.
 *
 * `schools`, `preferredareas` and `yearsofstudy` were also absent from
 * DbMigrationService's backfill list, so nothing repaired them on boot.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

/** The id the UI shows, derived the same way toViewModel derives it. */
const derivedId = (id: string) => parseInt(id.slice(-8), 16) % 100000;

const LEGACY_OID = '66f0a1b2c3d4e5f6a7b8c9d0';
const LEGACY_ID = derivedId(LEGACY_OID);

function makeService(docs: Doc[]) {
  const updates: Doc[] = [];
  const deletes: any[] = [];

  const schoolModel: any = {
    // Mirrors Mongoose: a filter on a field absent from the document matches
    // nothing, which is precisely why the original lookup failed.
    findOne: (q: Doc) => execOf(docs.find((d) => d.numericId === q.numericId) ?? null),
    // find() is called bare by the lookup fallback and with .sort() by
    // getAll(), so the stub answers both shapes.
    find: (q: Doc) => {
      const rows =
        q?.numericId?.$exists === false
          ? docs.filter((d) => d.numericId === undefined)
          : docs;
      return { ...execOf(rows), sort: () => execOf(rows) };
    },
    findByIdAndUpdate: (id: any, update: Doc) => {
      updates.push({ id, update });
      return execOf({});
    },
    findByIdAndDelete: async (id: any) => { deletes.push(id); },
  };

  return { service: new SchoolService(schoolModel), updates, deletes };
}

/** A row written without pre('save') — no numericId field at all. */
const legacySchool = { _id: LEGACY_OID, name: 'مدرسة الأندلس', isActive: true };

/** A row written normally — numericId present and consistent with _id. */
const modernOid = '66f0a1b2c3d4e5f6a7b8ccc1';
const modernSchool = {
  _id: modernOid,
  name: 'مدرسة النيل الدولية',
  isActive: true,
  numericId: derivedId(modernOid),
};

describe('SchoolService — rows stored without a numericId', () => {
  it('lists a legacy row under the id derived from its _id', async () => {
    const { service } = makeService([legacySchool]);
    const res = await service.getAll();
    expect(res.data?.[0].id).toBe(LEGACY_ID);
  });

  it('finds that same row by the id it just displayed', async () => {
    // The exact production failure: visible in the table, 404 on lookup.
    const { service } = makeService([legacySchool]);
    const res = await service.getById(LEGACY_ID);
    expect(res.data.name).toBe('مدرسة الأندلس');
  });

  it('updates a legacy row instead of reporting it missing', async () => {
    const { service, updates } = makeService([legacySchool]);
    await service.update(LEGACY_ID, { name: 'مدرسة الأندلس الجديدة' } as any);
    expect(updates[0].id).toBe(LEGACY_OID);
  });

  it('deactivates a legacy row', async () => {
    const { service, updates } = makeService([legacySchool]);
    await service.deactivate(LEGACY_ID);
    expect(updates[0].id).toBe(LEGACY_OID);
  });

  it('deletes a legacy row', async () => {
    const { service, deletes } = makeService([legacySchool]);
    await service.delete(LEGACY_ID);
    expect(deletes).toEqual([LEGACY_OID]);
  });

  it('still resolves a normal row through the indexed field', async () => {
    // The fallback must not regress the common path.
    const { service } = makeService([modernSchool, legacySchool]);
    const res = await service.getById(modernSchool.numericId);
    expect(res.data.name).toBe('مدرسة النيل الدولية');
  });

  it('reports a genuinely unknown id as missing', async () => {
    const { service } = makeService([legacySchool, modernSchool]);
    await expect(service.getById(99999)).rejects.toThrow('School not found');
  });
});
