import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as fs from 'fs';
import * as path from 'path';

const logDir = path.join(process.cwd(), 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const isProd = process.env.NODE_ENV === 'production';

export const winstonLoggerConfig = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: isProd
        ? winston.format.json()
        : winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            winston.format.colorize(),
            winston.format.printf(
              (info: winston.Logform.TransformableInfo) => {
                const {
                  timestamp,
                  level,
                  message,
                  context,
                  ms,
                } = info as {
                  timestamp?: string;
                  level: string;
                  message: string;
                  context?: string;
                  ms?: string;
                };

                return `[Nest] ${timestamp} ${level} [${
                  context ?? 'App'
                }] ${message}${ms ? ` ${ms}` : ''}`;
              },
            ),
          ),
    }),

    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: '%DATE%.log',
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
