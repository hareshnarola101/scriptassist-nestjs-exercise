export const AUTH_CACHE_KEYS = {
    USER_SESSION: (userId: string) => `user:session:${userId}`,
    BLACKLISTED_TOKEN: (token: string) => `token:blacklisted:${token}`,
  };
  
  export const AUTH_ERRORS = {
    INVALID_CREDENTIALS: 'Invalid credentials',
    ACCOUNT_LOCKED: 'Account temporarily locked',
    INVALID_TOKEN: 'Invalid or expired token',
    TOKEN_REUSE: 'Potential token reuse detected',
  };