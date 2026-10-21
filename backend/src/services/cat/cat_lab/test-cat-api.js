/**
 * test-cat-api.js
 * Script per testare le API del servizio CAT EORTC
 * 
 * Uso:
 *   node test-cat-api.js                               → test versione + connettività
 *   node test-cat-api.js version                       → solo versione/connettività
 *   node test-cat-api.js session <settingKey>          → crea sessione e mostra struttura
 *   node test-cat-api.js full <settingKey>             → flusso completo (session → items → estimates)
 *   node test-cat-api.js estimates <instrument>        → /runner/estimates/{instrument} con risposte esempio
 * 
 * Esempi:
 *   node test-cat-api.js session CatValidationSetting
 *   node test-cat-api.js full CatValidationSetting
 *   node test-cat-api.js estimates QLQ-C30
 */

import { config } from 'dotenv';
import https from 'https';
import { URL } from 'url';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

const CAT_API_URL = process.env.CAT_API_URL || 'https://cat.eortc.org/api';
const CAT_API_KEY = process.env.CAT_API_KEY || '';
const BASE_HOST = new URL(CAT_API_URL).hostname;
const BASE_PATH = new URL(CAT_API_URL).pathname.replace(/\/$/, '');

if (!CAT_API_KEY) {
  console.error('❌  CAT_API_KEY non trovata in .env');
  process.exit(1);
}

console.log(`🔗  API URL : ${CAT_API_URL}`);
console.log(`🔑  API Key : ${CAT_API_KEY.substring(0, 8)}...`);
console.log('');

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_HOST,
      port: 443,
      path: BASE_PATH + path,
      method,
      headers: {
        'api-key': CAT_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    console.log(`→ ${method} ${options.path}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log(`← ${res.statusCode}`);
        if (res.statusCode >= 400) {
          return reject({ statusCode: res.statusCode, body: data });
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Comandi
// ---------------------------------------------------------------------------

async function cmdVersion() {
  console.log('=== TEST CONNETTIVITÀ ===\n');
  const version = await request('GET', '/runner/version');
  console.log('✅  Versione servizio:', version);
}

async function cmdSession(settingKey) {
  console.log(`=== CREA SESSIONE: ${settingKey} ===\n`);
  const session = await request('GET', `/runner/createSession/${settingKey}`);
  console.log('\n📦  Sessione creata:');
  console.log(JSON.stringify(session, null, 2));
  return session;
}

async function cmdEstimatesFromSession(settingKey) {
  console.log(`=== ESTIMATES DA SESSIONE: ${settingKey} ===\n`);

  // 1. Crea sessione
  let session = await request('GET', `/runner/createSession/${settingKey}`);
  console.log(`\n✅  Sessione creata. Token: ${session.token}`);
  console.log(`    Dimensioni: ${session.dimensionOrder?.join(', ') || '(non disponibili)'}`);

  // 2. Ottieni primo item
  let nextItemResp = await request('POST', '/runner/item/next', session);
  const items = [];
  let loopGuard = 0;

  while (nextItemResp.itemKey && loopGuard < 50) {
    loopGuard++;
    const itemKey = nextItemResp.itemKey;
    session = nextItemResp.session;

    // Simula risposta: valore 2 (risposta "Un po'" su scala 1-4)
    const simulatedResponse = 2;
    console.log(`\n   [${loopGuard}] Item: ${itemKey} → risposta simulata: ${simulatedResponse}`);
    items.push({ item: itemKey, response: simulatedResponse });

    // Invia risposta
    session = await request('POST', `/runner/response/${simulatedResponse}`, session);

    // Prossimo item
    try {
      nextItemResp = await request('POST', '/runner/item/next', session);
    } catch (err) {
      console.log(`   🏁  Nessun altro item (${err.statusCode || err.message})`);
      break;
    }

    // Stop dopo 20 items per sicurezza nel test
    if (loopGuard >= 20) {
      console.log('\n   ⚠️  Interrotto dopo 20 items (limite di sicurezza del test)');
      break;
    }
  }

  // 3. Stima IRT
  console.log('\n=== ESTIMATES ===');
  const estimates = await request('POST', '/runner/estimates', session);
  console.log('\n📊  Stime IRT:');
  console.log(JSON.stringify(estimates, null, 2));

  return { items, estimates };
}

async function cmdEstimatesWithInstrument(instrument) {
  console.log(`=== POST /runner/estimates/${instrument} ===\n`);

  // Corpo esempio: una dimensione con alcune risposte
  // Adatta le risposte e il metodo in base allo strumento reale
  const body = {
    // La chiave è il nome della dimensione (es. "PF", "FA", "QL")
    // Modifica per corrispondere alle dimensioni del tuo strumento
    PF: {
      scoreEstimationMethod: 'EAP',
      informationEstimationMethod: 'FISHER',
      responses: {
        // item_key: valore_risposta (es. 1-4 per scala EORTC)
        PF1: 2,
        PF2: 3,
        PF3: 1,
      },
    },
  };

  console.log('📤  Body inviato:');
  console.log(JSON.stringify(body, null, 2));
  console.log('');

  const result = await request('POST', `/runner/estimates/${instrument}`, body);

  console.log('\n📊  Risultato:');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  const [, , cmd, arg] = process.argv;

  try {
    switch (cmd) {
      case 'version':
        await cmdVersion();
        break;

      case 'session':
        if (!arg) { console.error('Uso: node test-cat-api.js session <settingKey>'); process.exit(1); }
        await cmdSession(arg);
        break;

      case 'full':
        if (!arg) { console.error('Uso: node test-cat-api.js full <settingKey>'); process.exit(1); }
        await cmdEstimatesFromSession(arg);
        break;

      case 'estimates':
        if (!arg) { console.error('Uso: node test-cat-api.js estimates <instrument>'); process.exit(1); }
        await cmdEstimatesWithInstrument(arg);
        break;

      default:
        // Default: solo versione
        await cmdVersion();
        break;
    }
    console.log('\n✅  Fine.');
  } catch (err) {
    console.error('\n❌  Errore:');
    if (err.statusCode) {
      console.error(`   HTTP ${err.statusCode}: ${err.body}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
