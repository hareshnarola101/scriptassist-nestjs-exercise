import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface CacheItem<T = any> {
  value: T;
  expiresAt: number;
  namespace?: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  expirations: number;
  size: number;
  lastCleaned: Date;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cache: Map<string, CacheItem> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    expirations: 0,
    size: 0,
    lastCleaned: new Date(),
  };
  private readonly maxSize: number = 10000; // Adjust based on your needs
  private cleanupInterval: NodeJS.Timeout;
  private readonly lruKeys: string[] = []; // For LRU eviction tracking

  constructor(private eventEmitter: EventEmitter2) {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60 * 1000);
    process.on('beforeExit', () => clearInterval(this.cleanupInterval));
  }

  private generateKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private cloneValue<T>(value: T): T {
    // Simple clone - consider using a library like lodash for complex objects
    return typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.stats.expirations += cleaned;
    this.stats.size = this.cache.size;
    this.stats.lastCleaned = new Date();
    
    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} expired items from cache`);
      this.eventEmitter.emit('cache.cleanup', { count: cleaned });
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxSize) {
      // Evict least recently used items (10% of max size)
      const evictCount = Math.floor(this.maxSize * 0.1);
      const toEvict = this.lruKeys.splice(0, evictCount);
      
      for (const key of toEvict) {
        this.cache.delete(key);
      }
      
      this.stats.size = this.cache.size;
      this.logger.warn(`Evicted ${evictCount} items due to cache limit`);
      this.eventEmitter.emit('cache.evicted', { count: evictCount });
    }
  }

  private updateLru(key: string): void {
    const index = this.lruKeys.indexOf(key);
    if (index > -1) {
      this.lruKeys.splice(index, 1);
    }
    this.lruKeys.push(key);
  }

  async set<T>(key: string, value: T, ttlSeconds = 300, namespace?: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid cache key');
    }

    const cacheKey = this.generateKey(key, namespace);
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const clonedValue = this.cloneValue(value);

    this.evictIfNeeded();
    
    this.cache.set(cacheKey, {
      value: clonedValue,
      expiresAt,
      namespace,
    });
    
    this.updateLru(cacheKey);
    this.stats.size = this.cache.size;
    
    this.logger.debug(`Cache set: ${cacheKey}`);
    this.eventEmitter.emit('cache.set', { key: cacheKey, namespace });
  }

  async get<T>(key: string, namespace?: string): Promise<T | null> {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid cache key');
    }

    const cacheKey = this.generateKey(key, namespace);
    const item = this.cache.get(cacheKey);

    if (!item) {
      this.stats.misses++;
      this.eventEmitter.emit('cache.miss', { key: cacheKey, namespace });
      return null;
    }

    if (item.expiresAt < Date.now()) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      this.stats.expirations++;
      this.stats.size = this.cache.size;
      this.eventEmitter.emit('cache.expired', { key: cacheKey, namespace });
      return null;
    }

    this.updateLru(cacheKey);
    this.stats.hits++;
    this.eventEmitter.emit('cache.hit', { key: cacheKey, namespace });
    return this.cloneValue(item.value) as T;
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const cacheKey = this.generateKey(key, namespace);
    const existed = this.cache.delete(cacheKey);
    
    if (existed) {
      const index = this.lruKeys.indexOf(cacheKey);
      if (index > -1) {
        this.lruKeys.splice(index, 1);
      }
      this.stats.size = this.cache.size;
      this.eventEmitter.emit('cache.deleted', { key: cacheKey, namespace });
    }
    
    return existed;
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      for (const [key, item] of this.cache.entries()) {
        if (item.namespace === namespace) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.lruKeys.length = 0;
    }
    
    this.stats.size = this.cache.size;
    this.eventEmitter.emit('cache.cleared', { namespace });
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
        throw new Error('Invalid cache key');
    }

    const cacheKey = this.generateKey(key, namespace);
    const item = this.cache.get(cacheKey);
    
    // Explicitly check for undefined and expiration
    return item !== undefined && item.expiresAt >= Date.now();
}

  async getStats(): Promise<CacheStats> {
    return {
      ...this.stats,
      size: this.cache.size,
    };
  }

  async keys(namespace?: string): Promise<string[]> {
    const keys: string[] = [];
    
    for (const [key, item] of this.cache.entries()) {
      if (!namespace || item.namespace === namespace) {
        keys.push(key);
      }
    }
    
    return keys;
  }

  async ttl(key: string, namespace?: string): Promise<number> {
    const cacheKey = this.generateKey(key, namespace);
    const item = this.cache.get(cacheKey);
    
    if (!item) return -2;
    if (item.expiresAt < Date.now()) return -1;
    
    return Math.floor((item.expiresAt - Date.now()) / 1000);
  }
}