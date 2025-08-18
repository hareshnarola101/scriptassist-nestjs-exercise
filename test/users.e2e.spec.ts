import { initializeTestApp, getTestApp, closeTestApp, supertest, authToken } from './jest-setup';

describe('UsersController (e2e)', () => {

  beforeAll(async () => {
    await initializeTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('GET /users/profile', () => {
    it('should get user profile', async () => {
      const response = await supertest(getTestApp().getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
    });

    it('should reject unauthorized access', async () => {
      await supertest(getTestApp().getHttpServer())
        .get('/users/profile')
        .expect(401);
    });
  });

  describe('PATCH /users/profile', () => {
    it('should update user profile', async () => {
      const updateData = { name: 'Updated Name' };
      
      const response = await supertest(getTestApp().getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe(updateData.name);
      
      // Verify the update persisted
      const verifyResponse = await supertest(getTestApp().getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(verifyResponse.body.name).toBe(updateData.name);
    });

    it('should reject invalid updates', async () => {
      await supertest(getTestApp().getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'invalid-email' }) // Assuming email has validation
        .expect(400);
    });
  });
});