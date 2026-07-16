/**
 * Singleton PrismaClient instance shared across the app.
 *
 * Creating a single instance (rather than one per request/module) avoids
 * exhausting the database connection pool, which is especially important
 * with serverless/hot-reload dev setups.
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
