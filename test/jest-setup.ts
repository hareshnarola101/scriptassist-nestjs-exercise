import { Test } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationPipe, Logger } from '@nestjs/common';
import supertest from 'supertest';
import { DataSource } from 'typeorm';
import { cleanDatabase, getAuthToken } from './test-utils';
import { RefreshTokenRepository } from '@modules/auth/repositories/refresh-token.repository';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';

let app: INestApplication;
let dataSource: DataSource;
let authToken: string;
let jwtService: JwtService;
const logger = new Logger('TestSetup');

export async function initializeTestApp() {
  const { AppModule } = await import('../src/app.module');

  const testConfig = {
    jwt: {
      secret: 'test-secret-key-12345',
      accessTokenExpiry: '15m',
      refreshTokenSecret: 'test-refresh-secret-67890',
      refreshTokenExpiry: '7d'
    }
  };

  const moduleFixture = await Test.createTestingModule({
    imports: [
      AppModule,
      ConfigModule.forRoot({
        load: [() => testConfig],
        isGlobal: true
      }),
      JwtModule.registerAsync({
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          secret: configService.get<string>('jwt.secret'),
          signOptions: { expiresIn: configService.get<string>('jwt.accessTokenExpiry') }
        }),
        inject: [ConfigService]
      }),
    ],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        console.log('Validation errors:', JSON.stringify(errors, null, 2));
        return new BadRequestException(errors);
      }
    }),
  );
  await app.init();
  
  dataSource = moduleFixture.get<DataSource>(DataSource);
  jwtService = moduleFixture.get<JwtService>(JwtService);
  const refreshTokenRepo = moduleFixture.get<RefreshTokenRepository>(RefreshTokenRepository);

  await cleanDatabase(dataSource);

  authToken = await getAuthToken(app);

}

export function getTestApp() {
  if (!app) {
    throw new Error('Test app not initialized. Call initializeTestApp() first.');
  }
  return app;
}

export function getJwtService() {
  if (!jwtService) {
    throw new Error('JWT Service not available. Call initializeTestApp() first.');
  }
  return jwtService;
}

export function getAuthTokenForTesting(): string {
  if (!authToken) {
    throw new Error('Auth token not available. Call initializeTestApp() first.');
  }
  return authToken;
}

export async function closeTestApp() {
  await app?.close();
}

export { dataSource, authToken, supertest };
