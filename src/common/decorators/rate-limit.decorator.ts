import { SetMetadata } from '@nestjs/common';
import { RateLimitOptions } from '../interfaces/rate-limit-options.interface';

export const RATE_LIMIT_KEY = 'rate_limit';

export const RateLimit = (options: RateLimitOptions) => {
  return SetMetadata(RATE_LIMIT_KEY, {
    limit: options.limit,
    windowMs: options.windowMs,
    // Optional configuration
    prefix: options.prefix ?? 'global',
    skipIf: options.skipIf ?? (() => false),
    keyGenerator: options.keyGenerator ?? ((req) => req.ip),
    errorMessage: options.errorMessage ?? 'Rate limit exceeded',
  });
};