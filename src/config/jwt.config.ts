import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || '81f181ed776ab0dd136bb19c9d0bf3e0',
  expiresIn: process.env.JWT_EXPIRATION || '1d',
})); 