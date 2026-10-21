import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import qs from 'qs';
import { errorMiddleware } from './middleware/error';
import answerRoutes from './routes/answerRoutes';
import appSettingsRoutes from './routes/appSettingsRoutes';
import assignmentRoutes from './routes/assignmentRoutes';
import authRoutes from './routes/authRoutes';
import catRoutes from './routes/catRoutes';
import catItemBankRoutes from './routes/catItemBankRoutes';
import catSettingsRoutes from './routes/catSettingsRoutes';
import countryRoutes from './routes/countryRoutes';
import cttNormsRoutes from './routes/cttNormsRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import devRoutes from './routes/devRoutes';
import downloadRoutes from './routes/downloadRoutes';
import emailTemplateRoutes from './routes/emailTemplateRoutes';
import errorRoutes from './routes/errorRoutes';
import homepageRoutes from './routes/homepageRoutes';
import instituteRoutes from './routes/instituteRoutes';
import kitRoutes from './routes/kitRoutes';
import moduleRoutes from './routes/moduleRoutes';
import otpRoutes from './routes/otpRoutes';
import patientGroupRoutes from './routes/patientGroupRoutes';
import patientRoutes from './routes/patientRoutes';
import languageRoutes from './routes/languagesRoutes';
import privacyPolicyRoutes from './routes/privacyPolicyRoutes';
import publicRoutes from './routes/publicRoutes';
import questionnaireRoutes from './routes/questionnaireRoutes';
import surveyRoutes from './routes/surveyRoutes';
import userRoutes from './routes/userRoutes';
import { startScheduler } from './services/schedulerService.js';
// Importato per il suo effetto all'avvio: valida KEYCLOAK_DB_SCHEMA e fa fallire
// il processo subito, invece di lasciare che uno schema sbagliato si manifesti
// molto piu' tardi come "relation user_entity does not exist".
import { KEYCLOAK_SCHEMA } from './config/schemas.js';

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || `http://localhost:8080`;
const EMAIL_HOST = process.env.EMAIL_HOST || `http://localhost:1025`;

// Radice comune di tutte le rotte API
const API_PREFIX = '/euonqol-api';

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(helmet());

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging — placed before downloadRoutes so its public, unauthenticated
// endpoints show up in the console too (they fully handle their own response,
// so nothing after them in the middleware chain would otherwise see the hit).
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Public download endpoints for user-uploaded files (privacy policies,
// presentations, study info sheets) and, optionally, allowlisted external
// files. Mounted outside the authenticated `api` router — patients reading
// these documents via an unauthenticated /public/... link must be able to
// fetch the attached PDF too. See downloadController.ts / FileDownloadService.ts.
app.use(API_PREFIX, downloadRoutes);

// Default is generous outside production so active manual/UI testing doesn't trip
// the limiter (a single page load can easily fire a dozen API calls) — override
// with API_RATE_LIMIT if a specific value is needed either way.
const DEFAULT_API_RATE_LIMIT = NODE_ENV === 'production' ? 300 : 3000;
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.API_RATE_LIMIT ? parseInt(process.env.API_RATE_LIMIT, 10) : DEFAULT_API_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Configura Express per usare qs come query parser
app.set('query parser', (str: string) => qs.parse(str, { allowDots: true }));

// Router radice: tutte le rotte sono relative ad API_PREFIX, che viene applicato
// una sola volta al momento del mount (in fondo a questo blocco)
const api = express.Router();

api.use(apiLimiter);
api.use('/auth', authLimiter);
api.use('/otp', authLimiter);

// Public routes (no authentication required)
api.use('/public', publicRoutes);
api.use('/public', catRoutes); // CAT routes for dynamic questionnaires

// Protected and public routes
api.use('/answer-profiles', answerRoutes);
api.use(assignmentRoutes);
api.use('/auth', authRoutes);
api.use(emailTemplateRoutes);
api.use('/cat-settings', catSettingsRoutes);
api.use('/cat-item-banks', catItemBankRoutes);
api.use('/countries', countryRoutes);
api.use('/ctt-norms', cttNormsRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/homepage', homepageRoutes);
api.use('/institute', instituteRoutes);
api.use('/kit-versions', kitRoutes);
api.use('/languages', languageRoutes);
api.use('/modules', moduleRoutes);
api.use('/otp', otpRoutes);
api.use('/patient-groups', patientGroupRoutes);
api.use('/patients', patientRoutes);
api.use('/privacy-policies', privacyPolicyRoutes);
api.use(questionnaireRoutes);
api.use('/settings', appSettingsRoutes);
api.use('/surveys', surveyRoutes);
api.use('/users', userRoutes);
api.use('/errors', errorRoutes);

// Dev-only helper routes (e.g. trigger scheduler jobs on demand) — never mounted in production
if (NODE_ENV !== 'production') {
  api.use('/dev', devRoutes);
}

app.use(API_PREFIX, api);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler (passa da errorMiddleware per notifica Teams)
app.use((req, _res, next) => {
  const err: any = new Error('Endpoint not found');
  err.statusCode = 404;
  next(err);
});

// Error handler (con notifica Teams integrata)
app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log('🚀 Server started successfully');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 API Base: http://localhost:${PORT}${API_PREFIX}`);
  console.log(`🔐 Keycloak URL: ${KEYCLOAK_URL}`);
  console.log(`🗄️  Keycloak DB schema: ${KEYCLOAK_SCHEMA}`);
  console.log(`📧 Mail configured: ${EMAIL_HOST}`);

  if (process.env.ENABLE_SCHEDULER === 'true') {
    startScheduler();
  } else {
    console.log('⏸️  Scheduler disabled (set ENABLE_SCHEDULER=true to enable)');
  }
});

export default app;
