import { Test } from '@nestjs/testing';
import { CacheService } from '../src/common/services/cache.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [CacheService],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);
  });

  it('should set and get value', async () => {
    await cacheService.set('test', 'value', 60);
    const value = await cacheService.get<string>('test');
    expect(value).toBe('value');
  });

  it('should return null for expired key', async () => {
    await cacheService.set('test', 'value', -1); // Expired immediately
    const value = await cacheService.get<string>('test');
    expect(value).toBeNull();
  });

  it('should delete key', async () => {
    await cacheService.set('test', 'value', 60);
    await cacheService.delete('test');
    const value = await cacheService.get<string>('test');
    expect(value).toBeNull();
  });
});