/**
 * Unit-test config. `testRegex` matches `*.spec.ts` under src/ only.
 *
 * Note this deliberately does NOT match `test/api.e2e-spec.ts`: that file ends
 * in `-spec.ts` (hyphen, not dot) and requires a running server plus a live
 * database, so it must stay opt-in. Run it with `npm run test:e2e`.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
};
