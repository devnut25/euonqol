# Email Setup Guide

## Overview

Tutte le email di sistema (OTP di login, inviti al questionario, reminder, notifiche di scadenza survey) passano per un unico `EmailService` (`backend/src/services/email/email.ts`). La configurazione — provider, host/porta SMTP, credenziali, mittente — non è più fissata da variabili d'ambiente lette una sola volta all'avvio: viene letta dinamicamente da `app_settings` (tabella cifrata per i segreti, gestita da `AppSettingsService`) tramite l'interfaccia admin **Settings > Service Mail**, con fallback alle variabili d'ambiente se non è stato ancora configurato nulla da UI.

Questo significa che cambiare provider o credenziali (es. passare dalla mail di test a quella ufficiale dell'istituto) **non richiede un riavvio del backend**: il nuovo valore viene applicato al primo invio successivo al salvataggio.

## Prima installazione (bootstrap)

Al primo avvio di una nuova installazione, **nessuno ha ancora configurato nulla da Settings > Service Mail** (la tabella `app_settings` è vuota) — ma il primissimo admin, creato automaticamente da `setup/keycloak/init-keycloak.sh` durante il setup di Keycloak, deve comunque ricevere un OTP via email per completare il login (login diretto o cambio password obbligatorio al primo accesso: entrambi i percorsi inviano un OTP, vedi `backend/src/controllers/authController.ts`).

Per questo, la configurazione email supporta **due livelli**, in ordine di priorità:

1. **`app_settings` (DB)** — impostata da Settings > Service Mail. Ha sempre la precedenza se presente.
2. **Variabili d'ambiente** (`EMAIL_PROVIDER`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `EMAIL_SECURE`) — usate automaticamente finché il livello 1 è vuoto.

**Procedura per una nuova installazione:**

1. Prima di avviare i container, imposta in `.env`/`docker-compose.<ambiente>.yaml` una configurazione email funzionante (anche provvisoria — es. una casella di test, o il relay SMTP che si prevede di usare) tramite le variabili `EMAIL_*` (vedi tabella variabili più sotto).
2. Avvia l'installazione normalmente: il primo admin (creato da `init-keycloak.sh` con la password in `ADMIN_PASSWORD`) riceverà l'OTP tramite questa configurazione da env.
3. Una volta effettuato il primo accesso, vai in **Settings > Service Mail** e configura la mail definitiva dell'istituto (usa "Send test" prima di salvare). Da quel momento la configurazione da UI ha la precedenza — le variabili d'ambiente restano come fallback di sicurezza (es. se in futuro qualcuno svuota `app_settings`), ma non serve più toccarle.

La pagina Settings > Service Mail mostra "Configured"/"Configurata" anche quando password/API key derivano solo dalle variabili d'ambiente (non ancora salvate da UI) — così è sempre chiaro se il sistema ha una configurazione funzionante, indipendentemente da dove arrivi.

## I provider supportati

| Provider | Quando usarlo |
|---|---|
| `mailpit` | Solo sviluppo locale. È il servizio SMTP fittizio incluso in `docker-compose.dev.yaml` (UI su `localhost:8025`) — nessuna email esce davvero, utile per testare il flusso senza toccare account reali. **Mai in produzione.** |
| `smtp` | Provider generico via protocollo SMTP standard: Gmail personale, Google Workspace, o un relay SMTP fornito dall'istituto/IT. |
| `resend` | Provider transazionale dedicato ([resend.com](https://resend.com)). Consigliato per la produzione: pensato per invii massivi, nessun limite realistico per i volumi di questo progetto, non richiede gestione di App Password/2FA. |

## Configurazioni SMTP comuni

| Scenario | Host | Porta | TLS | Note |
|---|---|---|---|---|
| **Gmail personale** | `smtp.gmail.com` | `587` | No (STARTTLS) — oppure `465` con TLS Sì | Richiede una **App Password** (vedi sotto), non la password normale dell'account. **Solo per test**: Gmail personale limita a ~500 destinatari/giorno e applica un forte throttling anti-burst — non adatto a invii massivi reali. |
| **Google Workspace** (dominio istituto, es. `@nomeistituto.it` su Gmail) | `smtp.gmail.com` | `587` o `465` | Come sopra | Stesso meccanismo di autenticazione di Gmail personale (App Password se l'account ha 2FA), limite più alto (~2000 destinatari/giorno) ma comunque pensato per uso "casella di posta", non per invii transazionali massivi. Se l'IT dell'istituto fornisce un relay SMTP dedicato, preferirlo a questo. |
| **Relay SMTP dell'istituto / provider transazionale** | fornito dall'IT o dal provider (es. Resend, Amazon SES, SendGrid) | secondo la loro documentazione | secondo la loro documentazione | Opzione raccomandata per la produzione. Nessun limite di volume realistico per le dimensioni di questo progetto. |

### Campo "SMTP User"

Se lasciato vuoto, il sistema usa automaticamente il valore di **"From address"** come utente di autenticazione SMTP — è il comportamento corretto per la stragrande maggioranza dei setup (Gmail incluso, dove l'utente di autenticazione coincide quasi sempre con l'indirizzo mittente). Va compilato esplicitamente solo se il tuo provider autentica con un account diverso da quello usato come mittente.

## Passaggio dalla mail di test a quella ufficiale dell'istituto

Quando sarà disponibile l'indirizzo email ufficiale dell'istituto, basta tornare in **Settings > Service Mail** e sostituire Host/User/Password (e "From address", se cambia anche quello) con i nuovi valori — nessun'altra modifica necessaria altrove nel sistema. Prima di salvare, usa il pulsante **"Send test"** per verificare che la nuova configurazione funzioni, inviando un'email di prova a un indirizzo a tua scelta senza bisogno di salvare prima.

## Troubleshooting

### `530-5.7.0 Authentication Required`

Il server SMTP ha rifiutato la connessione come anonima: manca lo user di autenticazione. Con il fallback automatico "SMTP User vuoto → usa From address" (vedi sopra) questo non dovrebbe più capitare, a meno che "From address" stesso non sia una mailbox valida per l'account configurato.

### `534-5.7.9 Application-specific password required`

Errore specifico di Google: l'account Gmail/Workspace ha la verifica in due passaggi attiva e sta rifiutando la password normale dell'account per l'accesso SMTP. Serve generare una **App Password** dedicata:

1. Vai su [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (richiede 2FA già attiva sull'account)
2. Crea una nuova App Password (nome a piacere, es. "EUonQoL")
3. Google genera una password di 16 caratteri
4. Incollala nel campo **"SMTP Password"** al posto della password normale dell'account

Se l'account non ha ancora la verifica in due passaggi attiva, va abilitata prima — Google non permette di creare App Password senza.

### L'email non parte e non c'è nessun errore visibile

- Verifica che lo scheduler sia attivo se l'invio dipende dal job (vedi sezione successiva) — in locale è **disattivato di default**.
- Controlla i log del backend: ogni tentativo di invio logga `Creating email provider <nome>` e l'esito.
- Usa "Send test" in Settings > Service Mail per isolare se il problema è la configurazione email in sé o la logica applicativa a monte.

## Come funziona l'invio "in blocco" per le survey

Ogni survey ha un `send_mode` che determina quando i pazienti assegnati ricevono l'email con il link al questionario:

| `send_mode` | Comportamento |
|---|---|
| `manual` | Nessun invio automatico — va fatto manualmente. |
| `immediate` | L'email parte il prima possibile al momento dell'assegnazione. |
| `after_delay` | L'email parte `send_delay_hours` ore dopo l'assegnazione. |
| `scheduled` | L'email parte alla data/ora fissa `send_scheduled_at`. |

Per `after_delay` e `scheduled`, l'invio è **sempre** gestito dal job schedulato (Job A, vedi sotto): non c'è alcun invio sincrono a rischio burst.

Per `immediate`, invece, è previsto un invio subito ma **limitato e sequenziale**: quando un'assegnazione massiva (es. import di una lista pazienti, o assegnazione di un questionario a un intero gruppo) coinvolge più pazienti di `EMAIL_BATCH_SIZE` (vedi tabella sotto), solo il primo blocco viene inviato immediatamente (uno alla volta, con una piccola pausa tra un invio e l'altro); il resto resta in coda con stato `pending` e viene **assorbito automaticamente dal job schedulato** (Job A) nei tick successivi, a blocchi della stessa dimensione, finché la coda non si esaurisce. Questo evita di aprire centinaia di connessioni SMTP/API simultanee, che con molti provider (Gmail in primis) causerebbe rate-limiting o blocchi temporanei dell'account.

**I reminder ai pazienti (Job B) seguono automaticamente la stessa identica logica di batching** — non serve alcuna configurazione separata: ogni tick del cron processa al massimo `EMAIL_BATCH_SIZE` reminder in scadenza, con la stessa pausa tra un invio e l'altro.

### Scheduler: attivazione

Lo scheduler (i cron job che processano le code di invio/reminder) è:
- **Attivo di default** in staging e produzione (`ENABLE_SCHEDULER=true` nei rispettivi `docker-compose.*.yaml`).
- **Disattivato di default in sviluppo locale** — va abilitato esplicitamente con `ENABLE_SCHEDULER=true` in `.env.dev` se si vuole vedere il cron girare da solo.

Per testare in locale senza aspettare il cron (o senza abilitare lo scheduler), è disponibile l'endpoint dev-only:
```
POST /euonqol-api/dev/scheduler/run
```
(montato solo quando `NODE_ENV !== 'production'`) — esegue immediatamente un ciclo di tutti i job, incluso l'invio dei blocchi in coda.

## Riferimento variabili d'ambiente

Queste variabili sono di deployment (non modificabili da UI), da impostare nei file `docker-compose.*.yaml`/`.env.*`:

| Variabile | Default | Descrizione |
|---|---|---|
| `EMAIL_PROVIDER` | `smtp` | Provider di fallback usato finché non viene configurato nulla da Settings > Service Mail. |
| `EMAIL_BATCH_SIZE` | `100` | Numero massimo di email inviate per blocco (sia per l'invio immediato iniziale che per ogni tick del job schedulato). |
| `EMAIL_SEND_DELAY_MS` | `200` | Pausa (in millisecondi) tra un invio e il successivo, all'interno di un blocco. |
| `EMAIL_BATCH_COOLDOWN_MS` | `0` | Se `0` (default), un solo blocco per tick di cron — i blocchi successivi aspettano il tick successivo. Se `>0`, il job continua ad elaborare altri blocchi nello stesso tick (con questa pausa tra un blocco e l'altro) finché la coda non si esaurisce o non supera il budget di tempo interno (5 minuti). |
| `SCHEDULER_CRON_EXPR` | `*/15 * * * *` | Ogni quanto girano il job di invio (Job A) e quello dei reminder (Job B) — di default ogni 15 minuti. |
| `ENABLE_SCHEDULER` | `false` (`true` in staging/prod) | Attiva/disattiva l'esecuzione dei cron job dello scheduler. |

## Riferimenti

- **Servizio email**: `backend/src/services/email/email.ts`
- **Configurazione dinamica (app_settings)**: `backend/src/services/AppSettingsService.ts`
- **Endpoint admin Settings > Service Mail**: `backend/src/controllers/appSettingsController.ts`, `backend/src/routes/appSettingsRoutes.ts`
- **Job di invio/reminder schedulati**: `backend/src/services/AssignmentSchedulerService.ts`
- **Wiring dei cron job**: `backend/src/services/schedulerService.ts`
- **Trigger dev-only per test locali**: `backend/src/controllers/devController.ts`
