import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as jwt from 'jsonwebtoken';
// `import * as` rather than a default import: this tsconfig has
// esModuleInterop off, so the default binding is undefined at runtime.
import * as request from 'supertest';
import { Model } from 'mongoose';

import { SettingsModule } from '../src/modules/settings/settings.module';
import { User, UserSchema, UserDocument } from '../src/modules/users/user.schema';
import { JwtStrategy } from '../src/modules/authentication/jwt.strategy';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Pre-deployment verification of maintenance mode, end to end.
 *
 * Maintenance mode is the one feature that can lock users out of the system,
 * and it never worked before this release — the frontend client returned a
 * hardcoded `false`, so it has never been exercised in reality. A code trace
 * is not enough for that.
 *
 * This runs against a REAL MongoDB started in-process by mongodb-memory-server
 * — an isolated, throwaway database. It never touches a shared or production
 * cluster, which is why it is safe to run anywhere.
 *
 * It boots the settings surface with the application's real global guards
 * (JwtAuthGuard + RolesGuard) and its real ValidationPipe, so the
 * authorisation behaviour under test is the deployed behaviour, not a mock.
 *
 * Excluded from `npm test` (which must stay fast) — run with
 * `npm run test:integration`.
 *
 * Deployment note: `deploy/lib/build.sh` runs a plain `npm ci`, which installs
 * devDependencies (the build needs the Nest CLI and TypeScript). To stop that
 * pulling a ~100MB MongoDB binary onto the VPS on every deploy — and failing
 * the build outright if the host cannot reach fastdl.mongodb.org —
 * package.json sets `config.mongodbMemoryServer.disablePostinstall`. The
 * binary is fetched lazily the first time a server is actually started, which
 * only happens when this suite runs.
 */

const JWT_SECRET = 'integration-test-secret';

describe('Maintenance mode — pre-deployment verification', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let userModel: Model<UserDocument>;
  let adminToken: string;
  let guardianToken: string;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        PassportModule,
        SettingsModule,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    userModel = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));

    // The JWT strategy resolves the user from the DATABASE and reads `role`
    // from that record, not from the token — so real users are required.
    const admin = await userModel.create({
      firstName: 'Hala', lastName: 'Saleh', phoneNumber: '01000000001',
      password: 'x', role: 'Admin', numericId: 1,
    });
    const guardian = await userModel.create({
      firstName: 'Omar', lastName: 'Ali', phoneNumber: '01000000002',
      password: 'x', role: 'Guardian', numericId: 2,
    });

    const sign = (u: UserDocument) =>
      jwt.sign({ sub: (u._id as any).toString(), numericId: u.numericId }, JWT_SECRET, { expiresIn: '1h' });

    adminToken = sign(admin);
    guardianToken = sign(guardian);
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('1. an admin enables maintenance mode', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/Settings')
      .set(authed(adminToken))
      .send({ systemName: 'School Fleet', maintenanceMode: true })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('2. the setting persists and survives a fresh read (the hard-reload case)', async () => {
    // Read through a separate request, so nothing in-memory can mask a
    // failure to write — this is what a hard reload does.
    const res = await request(app.getHttpServer()).get('/api/Settings').set(authed(adminToken)).expect(200);

    expect(res.body.maintenanceMode).toBe(true);
    expect(res.body.systemName).toBe('School Fleet');
  });

  it('3. the public maintenance-mode endpoint reports it to the login page', async () => {
    // Deliberately unauthenticated: the login page calls this BEFORE the user
    // has a token. If this required auth, nobody could ever be told.
    const res = await request(app.getHttpServer()).get('/api/Settings/maintenance-mode').expect(200);

    expect(res.body.maintenanceMode).toBe(true);
  });

  it('4. a non-admin cannot change settings while maintenance is on', async () => {
    await request(app.getHttpServer())
      .put('/api/Settings')
      .set(authed(guardianToken))
      .send({ maintenanceMode: false })
      .expect(403);
  });

  it('5. the admin retains access and can turn maintenance mode back off', async () => {
    // The lockout question. The admin must be able to reach this endpoint
    // while maintenance is active, or enabling it would be irreversible.
    await request(app.getHttpServer())
      .put('/api/Settings')
      .set(authed(adminToken))
      .send({ maintenanceMode: false })
      .expect(200);

    const res = await request(app.getHttpServer()).get('/api/Settings').set(authed(adminToken)).expect(200);
    expect(res.body.maintenanceMode).toBe(false);
  });

  it('6. turning it off restores normal operation', async () => {
    const res = await request(app.getHttpServer()).get('/api/Settings/maintenance-mode').expect(200);
    expect(res.body.maintenanceMode).toBe(false);
  });

  it('7. no lockout: the toggle survives repeated on/off cycles', async () => {
    for (const value of [true, false, true, false]) {
      await request(app.getHttpServer())
        .put('/api/Settings')
        .set(authed(adminToken))
        .send({ maintenanceMode: value })
        .expect(200);

      const res = await request(app.getHttpServer()).get('/api/Settings/maintenance-mode').expect(200);
      expect(res.body.maintenanceMode).toBe(value);
    }
  });
});
