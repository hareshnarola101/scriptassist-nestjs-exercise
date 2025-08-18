export interface TokenPayload {
  sub: string; 
  email: string;
  role: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface RefreshTokenPayload extends TokenPayload {
  deviceId: string;
}