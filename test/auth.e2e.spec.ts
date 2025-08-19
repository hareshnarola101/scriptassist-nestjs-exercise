import { initializeTestApp, getTestApp, closeTestApp, supertest } from './jest-setup';

describe('AuthController (e2e)', () => {
  beforeAll(async () => {
    await initializeTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const response = await supertest(getTestApp().getHttpServer())
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Password123!',
          name: 'New User',
          deviceId: 'test-new-device-id',
          confirmPassword: 'Password123!'
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('should reject duplicate email', async () => {
      await supertest(getTestApp().getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          name: 'Duplicate User',
          deviceId: 'test-duplicate-device-id',
          confirmPassword: 'Password123!'
        });

      await supertest(getTestApp().getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          name: 'Duplicate User',
          deviceId: 'test-duplicate-device-id',
          confirmPassword: 'Password123!'
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      await supertest(getTestApp().getHttpServer())
        .post('/auth/register')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
          name: 'Login User',
          deviceId: 'test-new-device-id',
          confirmPassword: 'Password123!'
        });

      const response = await supertest(getTestApp().getHttpServer())
        .post('/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
          deviceId: 'test-new-device-id',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('should reject invalid credentials', async () => {
      await supertest(getTestApp().getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'WrongPassword!',
          deviceId: 'test-new-device-id',
        })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token', async () => {
      await supertest(getTestApp().getHttpServer())
        .post('/auth/register')
        .send({
          email: 'refresh@example.com',
          password: 'Password123!',
          name: 'Refresh User',
          deviceId: 'test-new-device-1-id',
          confirmPassword: 'Password123!'
        });

      const loginResponse = await supertest(getTestApp().getHttpServer())
        .post('/auth/login')
        .send({
          email: 'refresh@example.com',
          password: 'Password123!',
          deviceId: 'test-new-device-1-id',
        });

      const refreshResponse = await supertest(getTestApp().getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: loginResponse.body.refreshToken,
          deviceId: 'test-new-device-1-id',
        })
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('accessToken');
    });
  });
});