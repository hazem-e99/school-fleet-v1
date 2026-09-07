import { SettingsService } from './settings.service';

/**
 * The settings endpoint's contract, which the admin page depends on.
 *
 * `get()` previously omitted `maintenanceMode` and had no `language` field at
 * all, so the page read both back as defaults after every save and the
 * maintenance toggle appeared to reset itself — on top of the frontend client
 * being a stub that never called the server in the first place.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService(existing: Doc | null) {
  const created: Doc[] = [];
  const updates: Doc[] = [];

  const settingModel: any = {
    findOne: () => execOf(existing),
    create: async (doc: Doc) => {
      created.push(doc);
      return doc;
    },
    findOneAndUpdate: async (filter: Doc, update: Doc, options: Doc) => {
      updates.push({ filter, update, options });
      return {};
    },
  };

  return { service: new SettingsService(settingModel), created, updates };
}

describe('SettingsService.get', () => {
  it('returns the maintenance flag and language the admin page needs', async () => {
    const { service } = makeService({
      systemName: 'School Fleet',
      logo: '/logo.png',
      primaryColor: '#111111',
      secondaryColor: '#222222',
      maintenanceMode: true,
      maintenanceMessage: 'Back at 9am',
      language: 'ar',
    });

    await expect(service.get()).resolves.toEqual({
      systemName: 'School Fleet',
      logo: '/logo.png',
      primaryColor: '#111111',
      secondaryColor: '#222222',
      maintenanceMode: true,
      maintenanceMessage: 'Back at 9am',
      language: 'ar',
    });
  });

  it('normalises a legacy document that predates the new fields', async () => {
    // Existing production rows have no `language` and may have no
    // `maintenanceMode`; they must read as sensible defaults, not undefined.
    const { service } = makeService({
      systemName: 'El Renad',
      logo: '/logo2.png',
      primaryColor: '#4F46E5',
      secondaryColor: '#0EA5E9',
    });

    const result = await service.get();
    expect(result.maintenanceMode).toBe(false);
    expect(result.language).toBe('en');
    expect(result.maintenanceMessage).toBeNull();
  });

  it('creates the settings document on a fresh database', async () => {
    const { service, created } = makeService(null);
    await service.get();
    expect(created).toHaveLength(1);
    expect(created[0].systemName).toBe('El Renad');
  });
});

describe('SettingsService.update', () => {
  it('upserts, so the first save on a fresh database is not silently lost', async () => {
    const { service, updates } = makeService(null);
    const result = await service.update({ systemName: 'School Fleet', maintenanceMode: true });

    expect(updates[0].options.upsert).toBe(true);
    expect(updates[0].update.$set).toEqual({ systemName: 'School Fleet', maintenanceMode: true });
    expect(result.success).toBe(true);
  });

  it('writes only the fields it was given', async () => {
    const { service, updates } = makeService({ systemName: 'Old' });
    await service.update({ language: 'ar' });
    expect(updates[0].update.$set).toEqual({ language: 'ar' });
  });
});

describe('SettingsService.getMaintenanceMode', () => {
  it('reports the stored flag', async () => {
    const { service } = makeService({ maintenanceMode: true });
    await expect(service.getMaintenanceMode()).resolves.toEqual({ maintenanceMode: true });
  });

  it('reports false when no settings document exists yet', async () => {
    // This is the pre-login check — it must never lock everyone out because
    // the row has not been created.
    const { service } = makeService(null);
    await expect(service.getMaintenanceMode()).resolves.toEqual({ maintenanceMode: false });
  });
});
