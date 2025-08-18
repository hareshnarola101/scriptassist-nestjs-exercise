import type { Request } from 'express';
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  prefix?: string;
  skipIf?: (req: Request) => boolean;
  keyGenerator?: (req: Request) => string;
  errorMessage?: string;
}

export type RequiredRateLimitOptions = Required<RateLimitOptions>;