import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaLogLevels: Prisma.LogLevel[] = process.env.NODE_ENV === "development"
  ? ["query", "error", "warn"]
  : ["error"];

const prismaOptions: Prisma.PrismaClientOptions = {
  log: prismaLogLevels,
  ...(process.env.DATABASE_URL
    ? {
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      }
    : {}),
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
