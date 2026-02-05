import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

interface ErrorResponseBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse();

    const isHttpException = exception instanceof HttpException;

    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : null;

    const message = this.extractMessage(exceptionResponse);

    const body: ErrorResponseBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(request),
      message,
    };

    this.logException({
      statusCode,
      request,
      exception,
      message,
    });

    httpAdapter.reply(response, body, statusCode);
  }

  private extractMessage(
    response: string | object | null,
  ): string | string[] {
    if (!response) return 'Internal server error';

    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      'message' in response
    ) {
      const msg = (response as { message: string | string[] }).message;
      return msg;
    }

    return 'Internal server error';
  }

  private logException(args: {
    statusCode: number;
    request: Request;
    exception: unknown;
    message: string | string[];
  }) {
    const { statusCode, request, exception, message } = args;

    const logPayload = {
      method: request.method,
      url: request.url,
      statusCode,
      message,
    };

    if (statusCode >= 500) {
      this.logger.error(
        logPayload,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(logPayload);
    }
  }
}
