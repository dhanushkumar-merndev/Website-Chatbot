import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

export const winstonLoggerConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, context, ms }) => {
          return `[Nest] ${timestamp} ${level} [${context || 'App'}] ${message} ${ms}`;
        }),
      ),
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
});
