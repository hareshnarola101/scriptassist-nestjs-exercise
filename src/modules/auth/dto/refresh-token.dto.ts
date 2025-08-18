import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token obtained from the login/signup response', })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiProperty({ example: 'test-device' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}