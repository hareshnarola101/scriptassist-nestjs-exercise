// test/setup.ts
import { config } from 'dotenv';
config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';

process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '60s'
process.env.JWT_ACCESS_TOKEN_EXPIRATION = '15m',
process.env.JWT_REFRESH_TOKEN_EXPIRATION = '7d',
process.env.JWT_REFRESH_SECRET = 'your-refresh-secret-key',

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USERNAME = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_DATABASE = 'taskflow_test';

process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';