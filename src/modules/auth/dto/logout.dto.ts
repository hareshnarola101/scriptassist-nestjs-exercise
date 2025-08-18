import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogOutDto {
  @ApiProperty({ example: 'test-device' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}