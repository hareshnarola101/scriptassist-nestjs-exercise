import { initializeTestApp, getTestApp, closeTestApp, supertest, authToken } from './jest-setup';

describe('TasksController (e2e)', () => {
  let createdTaskId: string;

  beforeAll(async () => {
    await initializeTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('POST /tasks', () => {
    it('should create a task', async () => {
      const response = await supertest(getTestApp().getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: 'PENDING',
          priority: 'MEDIUM',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(response.status).toBe(201);
      createdTaskId = response.body.id;
      expect(response.body.title).toBe('Test Task');
    });
  });

  describe('GET /tasks', () => {
    it('should get tasks', async () => {
      const response = await supertest(getTestApp().getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /tasks/:id', () => {
    it('should get task by id', async () => {
      await supertest(getTestApp().getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('should update task', async () => {
      const response = await supertest(getTestApp().getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'COMPLETED'
        });

        expect(response.status).toBe(200);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('should delete task', async () => {
      await supertest(getTestApp().getHttpServer())
        .delete(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});