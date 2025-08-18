import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || '81f181ed776ab0dd136bb19c9d0bf3e0',
  accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '15m',
  refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '7d',
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'ks9aLz#3qPp!8zVnTg6$wR@2YfKdXmNpR7cZbGt*QhJuLx9o',
}));