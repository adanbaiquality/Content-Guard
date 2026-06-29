import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

const createTransport = () => {
  if (!isDevelopment) {
    return undefined;
  }

  return {
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "SYS:standard",
    },
    target: "pino-pretty",
  };
};

const createPinoTransport = () => {
  if (!isDevelopment) {
    return undefined;
  }

  return pino.transport({ target: "pino-pretty" });
};

const resolveLogLevel = (): string => {
  if (isDevelopment) {
    return "debug";
  }
  return "info";
};

const logger = pino(
  {
    level: process.env.LOG_LEVEL || resolveLogLevel(),
    transport: createTransport(),
  },
  createPinoTransport(),
);

export default logger;
