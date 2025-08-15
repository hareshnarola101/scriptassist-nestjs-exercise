import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  points: number;
  duration: number;
}

/**
 * Usage: @RateLimit({ points: 100, duration: 60 })
 */

export const RateLimit = (options: RateLimitOptions) => {
  // Problem: This decorator doesn't actually enforce rate limiting
  // It only sets metadata that is never used by the guard
  return SetMetadata(RATE_LIMIT_KEY, options);
}; 