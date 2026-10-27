# EUonQoL Backend

Backend service per la piattaforma EUonQoL, costruito con Express.js e TypeScript. Il progetto utilizza Prisma come ORM per gestire due database PostgreSQL separati (applicazione e Keycloak) e implementa un'architettura modulare basata su Controller, Services, Validators e Middleware.

## 📋 Indice

- [Tech Stack](#tech-stack)
- [Struttura del Progetto](#struttura-del-progetto)
- [Prerequisiti](#prerequisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Avvio dell'Applicazione](#avvio-dellapplicazione)
- [API Endpoints](#api-endpoints)
- [Architettura](#architettura)
- [Database e Prisma](#database-e-prisma)
- [Docker](#docker)
- [Testing](#testing)

## 🚀 Tech Stack

### Core
- **Node.js 20** - Runtime JavaScript
- **TypeScript 5.9** - Linguaggio tipizzato
- **Express 5.1** - Web framework
- **Prisma 6.19** - ORM next-generation

### Database
- **PostgreSQL** - Database relazionale
- **pg** - Driver nativo PostgreSQL

### Autenticazione & Sicurezza
- **Keycloak** - Identity and Access Management (IAM)
- **bcrypt** - Hashing delle password
- **jsonwebtoken** (via Keycloak) - JWT tokens

### Email & Comunicazione
- **Nodemailer 7.0** - Invio email
- **Resend 6.8** - Email service provider

### Validazione & Parsing
- **Zod 4.1** - Schema validation
- **qs 6.14** - Query string parsing avanzato

### Utilities
- **axios** - HTTP client
- **cors** - Cross-Origin Resource Sharing
- **i18next** - Internazionalizzazione
- **prisma-query-enhancer** - Query enhancement per Prisma

### Development
- **tsx** - TypeScript execution e hot reload
- **@types/\*** - TypeScript definitions

## 📁 Struttura del Progetto

```
backend/
├── src/
│   ├── controllers/           # HTTP request handlers
│   │   ├── authController.ts   # Login, logout, password reset
│   │   ├── otpController.ts    # OTP verification e refresh token
│   │   └── userController.ts   # CRUD utenti
│   │
│   ├── services/              # Business logic layer
│   │   └── email/              # Email service (Nodemailer/Resend)
│   │
│   ├── middleware/            # Express middlewares
│   │   ├── auth.ts             # Autenticazione JWT (Keycloak)
│   │   └── validate.ts         # Validazione richieste (Zod)
│   │
│   ├── routes/                # Route definitions
│   │   ├── authRoutes.ts       # /euonqol-api/auth/*
│   │   ├── otpRoutes.ts        # /euonqol-api/otp/*
│   │   └── userRoutes.ts       # /euonqol-api/users/*
│   │
│   ├── validators/            # Validazione e messaggi
│   │   ├── schemas/            # Zod schemas
│   │   │   └── user.ts         # User validation schema
│   │   ├── messages/           # Messaggi di errore
│   │   │   ├── common.ts
│   │   │   └── users.ts
│   │   └── utils.ts
│   │
│   ├── helpers/               # Funzioni utility
│   │   ├── keycloak.ts         # Keycloak API integration
│   │   ├── queryParser.ts      # Query parsing avanzato
│   │   ├── session.ts          # Session management
│   │   └── utils.ts            # Generic utilities
│   │
│   ├── config/                # Configurazioni
│   │   ├── database.ts         # Pool PostgreSQL
│   │   └── mailConfig.ts       # Email configuration
│   │
│   ├── policy/                # Authorization policies
│   │   └── userPolicy.ts
│   │
│   ├── resources/             # API Resources (data transformation)
│   │   ├── baseResource.ts
│   │   └── users.ts
│   │
│   ├── rules/                 # Business rules
│   │   └── UserRules.ts
│   │
│   ├── templates/             # Email/HTML templates
│   │
│   ├── generated/             # Prisma generated clients
│   │   ├── app/                # Client per schema euonqol
│   │   └── keycloak/           # Client per schema Keycloak
│   │
│   └── server.ts              # Entry point applicazione
│
├── prisma/                    # Prisma configuration
│   ├── app/
│   │   └── schema.prisma       # Schema database applicazione
│   └── keycloak/
│       └── schema.prisma       # Schema database Keycloak
│
├── docker/
│   ├── dockerfile              # Multi-stage Docker build
│   └── entrypoint.sh           # Container startup script
│
├── package.json               # Dipendenze e scripts
└── tsconfig.json              # TypeScript configuration
```

## 📋 Prerequisiti

- **Node.js** 20.x o superiore
- **npm** o **yarn**
- **PostgreSQL** 14+ (o accesso a istanza remota)
- **Keycloak** (in esecuzione)
- **Docker** (opzionale, per containerizzazione)

## 🔧 Installazione

1. **Clonare il repository e navigare nella directory backend**:
   ```bash
   cd backend
   ```

2. **Installare le dipendenze**:
   ```bash
   npm install
   ```

3. **Generare i Prisma clients**:
   ```bash
   npx prisma generate --schema=prisma/app/schema.prisma
   npx prisma generate --schema=prisma/keycloak/schema.prisma
   ```

## ⚙️ Configurazione

### Variabili d'Ambiente

Il backend gira solo in Docker e legge le variabili dall'ambiente del container.
Il compose le prende dall'env file dell'ambiente nella root del progetto
(`.env.dev`, `.env.staging`, `.env.prod`), da creare partendo da `.env.example`
della root. Non esiste un `backend/.env`.

Sono obbligatori (il compose si rifiuta di partire senza): `DB_PASSWORD`,
`ENCRYPTION_KEY`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_REALM_ID`, e in
staging/prod `FRONTEND_URL`.

### Database Setup

Il progetto utilizza un'architettura **multi-schema** con due Prisma clients:

1. **Schema `euonqol`**: Database applicazione (utenti, surveys, questionari, ecc.)
2. **Schema di Keycloak** (default `public`): gestione autenticazione. Il nome si
   configura con `KEYCLOAK_DB_SCHEMA`.

Lo schema dell'app **non contiene modelli Keycloak**: `prisma/app/schema.prisma`
dichiara `schemas = ["euonqol"]` e basta. Le colonne `created_by` / `sent_by` /
`uploaded_by` sono semplici stringhe, senza relazione Prisma, e i dati dell'utente
vengono agganciati da `src/services/keycloakUserRefs.ts`. Le foreign key verso
`user_entity` esistono comunque nel database: PostgreSQL le lega per OID, quindi
seguono le tabelle di Keycloak anche se queste vengono spostate di schema.

**Inizializzare il database**:

```bash
# Eseguire lo script SQL di inizializzazione. La variabile keycloak_schema deve
# corrispondere a KEYCLOAK_DB_SCHEMA; senza, lo script assume `public`.
psql -U euonqol_user -d euonqol -v keycloak_schema=public -f ../setup/db/init.sql

# Pull degli schemi esistenti (se database già popolato)
# ATTENZIONE: sull'app, `db pull` reintroduce i modelli Keycloak e le relazioni
# verso user_entity, perché le foreign key sono ancora nel database. Vanno tolti
# di nuovo, altrimenti il nome dello schema torna hardcoded in schema.prisma.
npx prisma db pull --schema=prisma/app/schema.prisma
npx prisma db pull --schema=prisma/keycloak/schema.prisma

# Generare i clients
npx prisma generate --schema=prisma/app/schema.prisma
npx prisma generate --schema=prisma/keycloak/schema.prisma
```

## 🏃 Avvio dell'Applicazione

### Development

```bash
# Avvia con hot-reload e environment variables
npm run dev
```

### Production

```bash
# Build TypeScript
npm run build

# Avvia applicazione compilata
npm start
```

### Con Docker

```bash
# Build immagine
docker build -f docker/dockerfile -t euonqol-backend .

# Run container
docker run -p 3000:3000 --env-file .env euonqol-backend
```

### Con Docker Compose (raccomandato)

Dalla root del progetto, tramite il Makefile:

```bash
make up          # development
make up-build    # con rebuild
make deploy      # build + background
```

L'equivalente esteso è `docker compose -f docker-compose.dev.yaml --env-file .env.dev --profile localdb up`. Il `--profile localdb` serve perché il container postgres è opzionale: vedi la sezione "Dove gira il database: `DB_MODE`" nel readMe della root.

Il server sarà disponibile su `http://localhost:3000`

## 🌐 API Endpoints

### Health Check
- `GET /health` - Verifica stato del server

### Authentication (`/euonqol-api/auth`)
| Method | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/login` | Login con username/password | No |
| POST | `/logout` | Logout utente | No |
| POST | `/update-password` | Aggiorna password utente | Yes |
| POST | `/validate-session` | Valida sessione corrente | No |
| POST | `/forgot-password` | Richiedi reset password | No |
| POST | `/reset-password` | Reset password con token | No |

### OTP Management (`/euonqol-api/otp`)
| Method | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/verify-otp` | Verifica codice OTP | No |
| POST | `/resend-otp` | Reinvia codice OTP | No |
| POST | `/refresh-token` | Refresh JWT token | No |

### Users Management (`/euonqol-api/users`)
| Method | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| GET | `/` | Lista utenti (paginata) | Yes |
| GET | `/:id` | Dettagli singolo utente | Yes |
| POST | `/` | Crea nuovo utente | Yes |
| PATCH | `/:id` | Aggiorna utente | Yes |

**Query Parameters** per `GET /euonqol-api/users`:
- `first` - Offset (default: 0)
- `max` - Limit (default: 10)
- `search` - Ricerca per username/email

**Request/Response Examples**:

```bash
# Login
curl -X POST http://localhost:3000/euonqol-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password123"}'

# Get users (authenticated)
curl -X GET http://localhost:3000/euonqol-api/users?max=20&search=john \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create user
curl -X POST http://localhost:3000/euonqol-api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "password": "SecurePass123!",
    "enabled": true
  }'
```

## 🏗️ Architettura

### Pattern Implementati

#### 1. **Controller Pattern**
I controller gestiscono le richieste HTTP, validano input tramite middleware Zod, e orchestrano la business logic.

```typescript
// controllers/userController.ts
export async function getUsers(req: Request, res: Response) {
  try {
    const { first = 0, max = 10, search } = req.query;
    const users = await KeycloakService.getUsers({ first, max, search });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### 2. **Service Layer**
La business logic è separata dai controller per riusabilità e testabilità.

```typescript
// helpers/keycloak.ts
export class KeycloakService {
  static async getUsers(params: GetUsersParams) {
    // Interazione con Keycloak API
  }
}
```

#### 3. **Middleware Pattern**
- **Authentication**: Verifica JWT tokens da Keycloak
- **Validation**: Valida richieste con Zod schemas

```typescript
// middleware/auth.ts
export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  // Verify token with Keycloak...
  next();
}
```

#### 4. **Resource/Transformer Pattern**
Trasforma dati del database in formato API response consistente.

```typescript
// resources/users.ts
export class UserResource extends BaseResource {
  transform(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      // ... altri campi formattati
    };
  }
}
```

#### 5. **Policy Pattern**
Gestisce autorizzazioni e permessi utente.

```typescript
// policy/userPolicy.ts
export class UserPolicy {
  static canUpdate(currentUser: User, targetUser: User) {
    return currentUser.isAdmin || currentUser.id === targetUser.id;
  }
}
```

### Multi-Schema Prisma Architecture

Il progetto utilizza due Prisma clients separati:

```typescript
// Per database applicazione
import { PrismaClient as AppPrisma } from '@/generated/app';
const appDb = new AppPrisma();

// Per database Keycloak
import { PrismaClient as KeycloakPrisma } from '@/generated/keycloak';
const keycloakDb = new KeycloakPrisma();
```

## 🗄️ Database e Prisma

### Gestione Schema

**Visualizzare dati con Prisma Studio**:
```bash
# Schema applicazione
npx prisma studio --schema=prisma/app/schema.prisma

# Schema Keycloak
npx prisma studio --schema=prisma/keycloak/schema.prisma
```

**Sincronizzare schema da database esistente**:
```bash
npx prisma db pull --schema=prisma/app/schema.prisma
```

**Generare client dopo modifiche**:
```bash
npx prisma generate --schema=prisma/app/schema.prisma
```

### Query Examples

```typescript
// Esempio query con AppPrisma
import { PrismaClient } from '@/generated/app';
const prisma = new PrismaClient();

// Get users con relazioni
const users = await prisma.users.findMany({
  include: {
    patient_groups: true,
    user_sessions: true,
  },
  where: {
    is_active: true,
  },
});

// Create patient
const patient = await prisma.patients.create({
  data: {
    patient_id: 'PAT001',
    mail: 'patient@example.com',
    group_id: 1,
    created_by: userId,
  },
});
```

## 🐳 Docker

### Dockerfile Multi-Stage

Il progetto utilizza una build ottimizzata con Alpine Linux:

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl curl bash
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma/
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
```

### Entrypoint Script

Lo script `entrypoint.sh` gestisce:
- Attesa inizializzazione Keycloak
- Pull automatico degli schemi Prisma
- Generazione clients Prisma
- Avvio applicazione

## 🧪 Testing

```bash
# Run all tests
npm test

# Run con coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Struttura test** (da implementare):
- Unit tests per controllers
- Integration tests per API endpoints
- Mock Keycloak e database per test isolati

## 📝 Scripts NPM

| Script | Descrizione |
|--------|-------------|
| `npm start` | Avvia applicazione (produzione) |
| `npm run dev` | Avvia con hot-reload |
| `npm run build` | Compila TypeScript → JavaScript |

## 🔒 Sicurezza

- **JWT Authentication**: Tutti gli endpoint `/euonqol-api/users` richiedono autenticazione
- **Password Hashing**: bcrypt con salt rounds appropriati
- **OTP Verification**: Two-factor authentication per operazioni sensibili
- **CORS**: Configurato per domini autorizzati
- **Rate Limiting**: (da implementare)
- **Input Validation**: Zod schemas per tutte le richieste

## 🤝 Contributing

1. Creare branch da `dev-api-tommi`
2. Seguire convenzioni TypeScript/ESLint
3. Validare con Zod per nuovi endpoint
4. Aggiornare questo README per nuove features
5. Scrivere test per nuova logica
6. Commit con messaggi descrittivi

## 📄 License

ISC

---

**Sviluppato da**: Alberto Polini  
**Versione**: 1.0.0  
**Ultimo aggiornamento**: Febbraio 2026