// src/auth/dto/refresh-token.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;

  @ApiProperty({ example: 'test-device' })
  @IsNotEmpty()
  @IsString()
  deviceId: string;
}
