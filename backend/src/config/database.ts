import { Pool } from "pg";
import { PrismaClient as AppPrismaClient } from "../generated/app";
import { PrismaClient as KeycloakPrismaClient } from "../generated/keycloak";

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "euonqol",
  user: process.env.DB_USER || "euonqol_user",
  password: process.env.DB_PASSWORD || "euonqol_password",
  options: '-c timezone=UTC'
});

// Prisma Clients con URL esplicite
export const prisma = new AppPrismaClient({
  datasources: {
    db: {
      url: process.env.APP_DATABASE_URL || "postgresql://euonqol_user:euonqol_password@localhost:5432/euonqol?schema=euonqol"
    }
  }
});

// Nessuna URL esplicita: la risolve Prisma da env("KEYCLOAK_DATABASE_URL"), che e'
// anche l'unico punto in cui si sceglie lo schema di Keycloak (parametro ?schema=).
// Un fallback hardcoded qui la scavalcherebbe in silenzio, puntando al `public` di
// default anche dove Keycloak e' stato spostato altrove.
export const keycloakPrisma = new KeycloakPrismaClient();

export default pool;