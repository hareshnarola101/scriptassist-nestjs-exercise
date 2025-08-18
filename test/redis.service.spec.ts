import { Test } from '@nestjs/testing';
import { RedisService } from '../src/common/cache/redis.service';
import { RedisModule } from '../src/common/cache/redis.module';

describe('RedisService', () => {
  let redisService: RedisService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [RedisModule],
    }).compile();

    redisService = module.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    await redisService.onModuleDestroy();
  });

  it('should set and get value', async () => {
    await redisService.set('test', 'value', 60);
    const value = await redisService.get('test');
    expect(value).toBe('value');
  });

  it('should delete key', async () => {
    await redisService.set('test', 'value', 60);
    await redisService.del('test');
    const value = await redisService.get('test');
    expect(value).toBeNull();
  });
});