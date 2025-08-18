import { Expose } from 'class-transformer';

/**
 * DTO for token response.
 */
export class TokenResponseDto {
    @Expose()
    readonly accessToken: string;

    @Expose()
    readonly refreshToken: string;

    @Expose()
    readonly expiresIn: number;

    @Expose()
    readonly tokenType: string;

    constructor(
        accessToken: string,
        refreshToken: string,
        expiresIn: number,
        tokenType: string,
    ) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.expiresIn = expiresIn;
        this.tokenType = tokenType;
    }
}