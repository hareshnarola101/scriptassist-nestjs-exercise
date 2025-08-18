import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

interface ExceptionResponse {
  message?: string | string[];
  error?: string;
  details?: any;
  [key: string]: any; // Allow for additional properties
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as ExceptionResponse | string;

    // Determine if the error is operational (client error) or system error
    const isOperationalError = status < HttpStatus.INTERNAL_SERVER_ERROR;

    // Log errors appropriately based on their severity
    if (isOperationalError) {
      this.logger.warn(
        `Client Error: ${exception.message} Path: ${request.url}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `Server Error: ${exception.message} Path: ${request.url}`,
        exception.stack,
      );
    }

    // Format error response consistently
    let responseBody: {
      success: boolean;
      statusCode: number;
      message: string;
      error?: string;
      details?: any;
      path?: string;
      timestamp?: string;
    };

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      // Handle class-validator errors or custom exception responses

      const message = Array.isArray(exceptionResponse.message)
        ? exceptionResponse.message.join(', ')
        : exceptionResponse.message;

      responseBody = {
        success: false,
        statusCode: status,
        message: message ?? exception.message,
        error: exceptionResponse['error'] ?? exception.name,
        details: exceptionResponse['details'] ?? undefined,
        path: request.url,
        timestamp: new Date().toISOString(),
      };
    } else {
      // Standard error format
      responseBody = {
        success: false,
        statusCode: status,
        message: exceptionResponse || exception.message,
        error: exception.name,
        path: request.url,
        timestamp: new Date().toISOString(),
      };
    }

    // Sanitize error details in production to avoid leaking sensitive information
    if (process.env.NODE_ENV === 'production' && !isOperationalError) {
      responseBody.message = 'Internal server error';
      delete responseBody.details;
    }

    response.status(status).json(responseBody);
  }
}