import { Repository, MoreThan, DataSource } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RefreshTokenRepository extends Repository<RefreshToken> {
  constructor(private dataSource: DataSource) {
    super(RefreshToken, dataSource.createEntityManager());
  }

  async revokeToken(token: string): Promise<void> {
    await this.update({ token }, { isRevoked: true });
  }

  async revokeForDevice(userId: string, deviceId: string): Promise<void> {
    if (!this.manager) {
      throw new Error('Repository not properly initialized');
    }
    
    await this.manager.update(
      RefreshToken,
      { userId, deviceId },
      { isRevoked: true }
    );
  }

  async findValidToken(
    token: string,
    userId: string,
    deviceId: string,
  ): Promise<RefreshToken | undefined> {
    const result = await this.findOne({
      where: {
        token,
        userId,
        deviceId,
        isRevoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });
    return result || undefined;
  }
}
