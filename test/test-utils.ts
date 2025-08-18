// test-utils.ts
import { DataSource } from 'typeorm';
import supertest from 'supertest';
import { v4 as uuidv4 } from 'uuid';

export async function cleanDatabase(dataSource: DataSource) {
  const entities = dataSource.entityMetadatas;
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();
    await queryRunner.query('SET session_replication_role = replica;');
    
    for (const entity of entities) {
      await queryRunner.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
    }
    
    await queryRunner.query('SET session_replication_role = origin;');
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function createTestUser(app: { getHttpServer: () => any }) {
  const uniqueId = uuidv4().substring(0, 8);
  const userData = {
    email: `testuser+${uniqueId}@example.com`,
    password: `Password123!${uniqueId}`,
    name: `Test User ${uniqueId}`,
    deviceId: `test-device-${uniqueId}`
  };

  const response = await supertest(app.getHttpServer())
    .post('/auth/register')
    .send(userData);

  if (response.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(response.body)}`);
  }

  return {
    response,
    userData
  };
}

export async function getAuthToken(app: { getHttpServer: () => any }) {
  const { userData } = await createTestUser(app);

  const loginResponse = await supertest(app.getHttpServer())
    .post('/auth/login')
    .send({
      email: userData.email,
      password: userData.password,
      deviceId: userData.deviceId
    });

  if (loginResponse.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(loginResponse.body)}`);
  }

  return loginResponse.body.accessToken;
}