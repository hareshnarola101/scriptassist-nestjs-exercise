import { initializeTestApp, getTestApp, closeTestApp, supertest, authToken } from './jest-setup';

describe('UsersController (e2e)', () => {

  beforeAll(async () => {
    await initializeTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

});