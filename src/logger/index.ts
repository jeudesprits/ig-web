import { createLogger, format, transports } from 'winston';
const { File, Console } = transports;
const { combine, timestamp, label, printf } = format;
import { TelegramTransport as Telegram } from './transports/tgTransport';
import { isProduction } from '../utils/helpers';
import secrets from '../utils/secrets';

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = createLogger({
  level: isProduction() ? 'info' : 'debug',
  format: combine(
    label({ label: 'ig-web' }),
    timestamp(),
    myFormat
  ),
});

if (isProduction()) {
  logger.add(new File({
    filename: './logs/error.log',
    level: 'error',
  }));

  logger.add(new File({
    filename: './logs/combined.log',
    level: 'info',
  }));
} else {
  logger.add(new Console({
    format: combine(
      format.colorize(),
      myFormat,
    )
  }));
}

logger.add(new Telegram({
  token: secrets!.TG_TOKEN,
  chatId: secrets!.TG_CHANNEL_NAME,
  pathToImage: './tmp/screenshot.jpeg',
}));

export default logger;
