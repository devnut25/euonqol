import { Pool } from "pg";
import { PrismaClient as AppPrismaClient } from "../generated/app";
import { PrismaClient as KeycloakPrismaClient } from "../generated/keycloak";
import { pgSslConfig } from "./dbSsl";

const DB_PASSWORD = process.env.DB_PASSWORD;
if (!DB_PASSWORD) throw new Error("DB_PASSWORD non impostata");
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
if (!APP_DATABASE_URL) throw new Error("APP_DATABASE_URL non impostata");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "euonqol",
  user: process.env.DB_USER || "euonqol_user",
  password: DB_PASSWORD,
  ssl: pgSslConfig(),
  options: '-c timezone=UTC',
  max: Number(process.env.DB_POOL_MAX) || 10
});

// Prisma Clients con URL esplicite
export const prisma = new AppPrismaClient({
  datasources: {
    db: {
      url: APP_DATABASE_URL
    }
  }
});

// Nessuna URL esplicita: la risolve Prisma da env("KEYCLOAK_DATABASE_URL"), che e'
// anche l'unico punto in cui si sceglie lo schema di Keycloak (parametro ?schema=).
// Un fallback hardcoded qui la scavalcherebbe in silenzio, puntando al `public` di
// default anche dove Keycloak e' stato spostato altrove.
export const keycloakPrisma = new KeycloakPrismaClient();

export default pool;