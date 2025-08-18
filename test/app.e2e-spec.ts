import { initializeTestApp, getTestApp, closeTestApp, supertest } from './jest-setup';

describe('AppController (e2e)', () => {
  beforeAll(async () => {
    await initializeTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('/ (GET) - should be protected', () => {
    return supertest(getTestApp().getHttpServer())
      .get('/')
      .expect(401);
  });

});