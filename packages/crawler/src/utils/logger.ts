import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let logFile: fs.WriteStream | null = null;
let consoleLevel: LogLevel = 'info';
let fileLevel: LogLevel = 'debug';

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function timeOnly(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function ensureLogFile(): fs.WriteStream {
  if (!logFile) {
    const logDir = path.dirname(config.logPath);
    fs.mkdirSync(logDir, { recursive: true });
    logFile = fs.createWriteStream(config.logPath, { flags: 'a' });
  }
  return logFile;
}

function writeToFile(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[fileLevel]) return;
  const stream = ensureLogFile();
  const entry = data
    ? `[${timestamp()}] ${level.toUpperCase()} ${message} ${JSON.stringify(data)}`
    : `[${timestamp()}] ${level.toUpperCase()} ${message}`;
  stream.write(entry + '\n');
}

function writeToConsole(level: LogLevel, message: string): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[consoleLevel]) return;
  const prefix = `[${timeOnly()}]`;
  if (level === 'error') {
    console.error(`${prefix} ERROR: ${message}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} WARN: ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug(message: string, data?: unknown): void {
    writeToFile('debug', message, data);
  },

  info(message: string, data?: unknown): void {
    writeToConsole('info', message);
    writeToFile('info', message, data);
  },

  warn(message: string, data?: unknown): void {
    writeToConsole('warn', message);
    writeToFile('warn', message, data);
  },

  error(message: string, data?: unknown): void {
    writeToConsole('error', message);
    writeToFile('error', message, data);
  },

  setConsoleLevel(level: LogLevel): void {
    consoleLevel = level;
  },

  setFileLevel(level: LogLevel): void {
    fileLevel = level;
  },

  close(): void {
    if (logFile) {
      logFile.end();
      logFile = null;
    }
  },
};
