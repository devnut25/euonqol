# EUONQOL Kit — Guida avvio e deploy

---

## Avvio locale (sviluppo)

### Prerequisiti
- Docker Desktop in esecuzione
- File `.env.dev` nella root (partire da `.env.example`)
- `make`, da lanciare in una shell POSIX: su Windows **WSL** (dove c'e' gia') oppure **Git Bash** (`winget install ezwinports.make` o `choco install make`). Non da PowerShell.

### Comandi

```bash
make help          # elenco dei target disponibili
make init          # solo la prima volta: realm Keycloak + schema DB
make up-build      # avvio ricostruendo le immagini
make up            # avvio
make down          # stop
make down-v        # stop + rimozione volumi (DISTRUTTIVO: cancella il DB locale)
make logs S=backend
```

`make` sceglie compose ed env file in base a `ENV` (default `dev`): `make up ENV=staging` usa `docker-compose.staging.yaml` con `.env.staging`. L'equivalente esteso di `make up` resta `docker compose -f docker-compose.dev.yaml --env-file .env.dev --profile localdb up`.

`keycloak-setup` e `db-init` sono dietro il profilo `init`: su un volume postgres vuoto vanno lanciati una volta con `make init`, altrimenti realm Keycloak e schema DB non vengono creati.

Come installare `make`, il significato di ogni comando e i flussi più comuni sono descritti in [Make: installazione e comandi](#make-installazione-e-comandi).

### Dove gira il database: `DB_MODE`

Il container `postgres` è un add-on opzionale, dietro il profilo `localdb`. L'interruttore è `DB_MODE` nell'env file:

| `DB_MODE` | Effetto |
|---|---|
| `local` (default) | il compose avvia il container `postgres`, `DB_HOST` è ignorato |
| `external` | nessun container DB, ci si collega al PostgreSQL indicato da `DB_HOST` |

`DB_MODE` è l'unica fonte di verità: in modalità `local` il Makefile impone `DB_HOST=postgres` e il profilo `localdb`, quindi un `DB_HOST` rimasto valorizzato nell'env file non può creare stati incoerenti. Lanciando `docker compose` a mano serve invece passare `--profile localdb` esplicitamente.

Dettaglio implementativo: i `depends_on` verso `postgres` hanno `required: false`. Senza, con il profilo spento Compose rifiuterebbe l'intero file con `depends on undefined service "postgres"`; con il profilo acceso la condizione `service_healthy` resta pienamente attiva.

### Puntare a un PostgreSQL esterno

Prerequisiti sul server:

- **Database di nome `euonqol`**: `setup/db/init.sql` contiene un `\c euonqol;` in testa, quindi il nome non è negoziabile.
- Un utente con il permesso di creare schemi e tabelle nel database.
- `listen_addresses`, `pg_hba.conf` e firewall che accettino connessioni dall'IP della macchina di sviluppo.

Gli schemi **non** vanno creati a mano: ci pensa il servizio `db-schemas`, che gira prima di Keycloak a ogni `up` ed esegue `CREATE SCHEMA IF NOT EXISTS` per `euonqol` e per `KEYCLOAK_DB_SCHEMA`. Serve perché Keycloak crea le proprie tabelle via Liquibase ma non lo schema che le contiene: se manca esce con `schema "..." does not exist` e, avendo `restart: unless-stopped`, entra in un crash loop silenzioso mentre `keycloak-setup` resta in attesa all'infinito. Lo stesso servizio copre anche il postgres in container: prima di lanciare psql attende fino a 120s che il database risponda, quindi un postgres che non parte si presenta come un errore esplicito di `db-schemas` e non come un generico exit 2.

Poi nell'env file: `DB_MODE=external`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE` e `KEYCLOAK_DB_SCHEMA`, più i certificati se il server li richiede (vedi sotto). La password finisce in una connection string: caratteri come `@ : / ? #` vanno percent-encoded.

`DB_SSLMODE` accetta i valori di libpq:

| Valore | Quando |
|---|---|
| `disable` (default) | postgres in container: non espone TLS. Il Makefile lo impone da sé in modalità `local` |
| `prefer` | server esterno con certificato self-signed. Attenzione: il driver `pg` non ricade su plaintext se il server è senza TLS, quindi qui si comporta come `require` |
| `require` | Azure, o qualunque server che imponga TLS. Con `DB_SSLROOTCERT` verifica anche la catena, come `verify-ca` |
| `verify-ca` | verifica che il certificato del server sia firmato dalla CA in `DB_SSLROOTCERT` |
| `verify-full` | come `verify-ca`, e in più che il certificato sia intestato a `DB_HOST` |

#### Certificati TLS (`sslrootcert`, `sslcert`, `sslkey`)

Se il server chiede la verifica del certificato o un certificato client, cioè l'equivalente di

```bash
psql "host=lpiteuondbp02 port=5432 dbname=euonqol user=euonqol sslmode=verify-full sslrootcert=/etc/SSLcert/root.crt sslcert=/etc/SSLcert/client.crt sslkey=/etc/SSLcert/client.key"
```

nell'env file vanno messi i percorsi dei file **sulla macchina che esegue Docker**:

```dotenv
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/etc/SSLcert/root.crt
DB_SSLCERT=/etc/SSLcert/client.crt
DB_SSLKEY=/etc/SSLcert/client.key
```

Il resto lo fa make: `make init`, `make up`, `make up-build` e `make deploy` lanciano prima `make db-certs`, che copia i file in `.certs/<ENV>/` (esclusa da git) e la monta in sola lettura su `/certs` in backend, Keycloak e nei container psql. Siccome gira a ogni avvio, un certificato rinnovato in `/etc/SSLcert` arriva ai container al primo `make up` successivo.

La conversione serve perché non tutti i client leggono il PEM, e `db-certs` genera con l'`openssl` della macchina Docker i formati mancanti:

| Client | Cosa usa |
|---|---|
| psql (`db-schemas`, `db-init`, `make psql`, `make reset-db`) | `root.crt`, `client.crt`, `client.key` così come sono |
| Keycloak (JDBC) | `root.crt`, `client.crt` e la chiave in PKCS#8 DER (`client.pk8`) |
| Prisma (backend) | `root.crt` e certificato + chiave in PKCS#12 (`client.p12`). Prisma accetta solo `disable`/`prefer`/`require`: `verify-ca` e `verify-full` gli arrivano come `require` + `sslaccept=strict`, che verifica catena e hostname |
| `pg` (login, OTP, migrazioni) | `root.crt` e `client.p12`, con le opzioni costruite in `backend/src/config/dbSsl.ts` |

Requisiti e note:

- `openssl` installato sulla macchina Docker (`apt install openssl`): c'è quasi sempre.
- L'utente che lancia make deve poter **leggere** i tre file. Se `client.key` è di root con permessi `0600`, serve `sudo make up` oppure un gruppo che possa leggerlo. In caso contrario make si ferma con `ERRORE: ... non esiste o non e' leggibile`.
- La chiave deve essere senza passphrase, come per il comando psql sopra.
- `DB_SSLCERT` e `DB_SSLKEY` vanno valorizzati insieme. Con `verify-ca`/`verify-full` serve `DB_SSLROOTCERT`.
- In `.certs/<ENV>/` `client.key` resta `0600`, mentre `client.p12` e `client.pk8` sono leggibili da tutti: i container girano con utenti diversi (Keycloak con uid 1000). Sulla macchina Docker la cartella contiene quindi la chiave privata in chiaro, come `/etc/SSLcert`.
- Keycloak copia `client.pk8` in `/tmp` all'avvio, perché il driver JDBC rifiuta una chiave che non sia `0600` e di sua proprietà.

### Servizi avviati in locale
| Servizio   | URL                       |
|------------|---------------------------|
| Frontend   | http://localhost:5173     |
| Backend    | http://localhost:3000     |
| Keycloak   | http://localhost:8080     |
| Mailpit UI | http://localhost:8025     |
| PostgreSQL | localhost:5432 (solo con `DB_MODE=local`) |

### Cosa fa l'init (`keycloak-setup` + `db-init`)
- `keycloak-setup` (via REST API, script `setup/keycloak/init-keycloak.sh`): crea il realm `euonqol`, i client `euonqol-frontend` (public) e `euonqol-backend` (confidential, con permessi manage-users/view-users), lo User Profile custom (`user_type`, `is_active`), client-scope + protocol mapper, e l'utente admin definito nell'env file. Se il realm esiste già, salta l'inizializzazione (idempotente).
- `db-init`: parte solo dopo che `keycloak-setup` è terminato con successo (`service_completed_successfully`) ed esegue `setup/db/init.sql` per creare lo schema `euonqol`. L'ordine conta: `init.sql` crea foreign key verso `<keycloak_schema>.user_entity`, quindi le tabelle di Keycloak devono esistere prima.

### Migrazioni applicative

`make up`, `make up-build` e `make deploy` applicano da soli le migrazioni pendenti prima di avviare il backend. Per controllarle o lanciarle a mano, sempre **dal container**:

```bash
make migrate-status
make migrate
```

Il backend legge le variabili solo dall'ambiente del container, valorizzato dal compose a partire dall'env file della root: non esiste piu' un `backend/.env`.

### Note
- Il backend monta il codice sorgente come volume e usa `npm run dev` (hot reload).
- Prisma genera i client a ogni avvio (`prisma generate`), nessun `db pull` necessario.
- **Il primo avvio di Keycloak su un DB esterno è lento**: il bootstrap Liquibase esegue centinaia di DDL, ognuno con un round trip di rete — misurati ~5 minuti contro i pochi secondi in locale. `init-keycloak.sh` aspetta al massimo 3 minuti, quindi `keycloak-setup` ha un entrypoint che attende Keycloak senza limite di tentativi prima di lanciare lo script. Gli avvii successivi sono rapidi.
- Con `DB_MODE=external`, `down -v` **non** cancella i dati: i volumi locali sono solo quelli di `node_modules` e degli upload.
- Il frontend non è nel compose dev: si avvia con `npm run dev` in `frontend-shadcn/`.

---

## Make: installazione e comandi

Il `Makefile` nella root è il modo consigliato per gestire gli ambienti. Ogni comando è un `docker compose` già configurato: sceglie insieme compose ed env file in base all'ambiente, aggiunge il profilo `localdb` quando il database gira in container e, prima di partire, controlla che l'env file sia valido. Evita di dover ricordare (e ricopiare senza errori) righe come `docker compose -f docker-compose.dev.yaml --env-file .env.dev --profile localdb up`.

### Installare make

Le ricette del Makefile sono comandi `sh`: vanno lanciate da una shell POSIX. **Da PowerShell o dal Prompt dei comandi non funzionano**, anche con `make` installato.

| Sistema | Installazione | Note |
|---|---|---|
| Windows + **WSL** (consigliato) | `sudo apt update && sudo apt install make` | Su alcune distribuzioni `make` c'è già: verifica prima con `make --version`. Lavora dalla cartella del progetto vista da WSL (`/mnt/c/Users/...`). |
| Windows + **Git Bash** | `winget install ezwinports.make` oppure, da PowerShell come amministratore, `choco install make` | Dopo l'installazione chiudi e riapri Git Bash, perché il `PATH` venga aggiornato. |
| macOS | `xcode-select --install` | Installa gli strumenti da riga di comando di Apple, `make` compreso. |
| Linux / VM Azure | `sudo apt install make` | Sulla VM di staging è già presente. |

Per verificare l'installazione:

```bash
make --version   # risponde con "GNU Make x.y"
make help        # elenco dei comandi, con ambiente e modalità DB attivi
```

`make help` è anche il comando predefinito: lanciare solo `make` mostra la stessa lista.

### Variabili

I comandi accettano alcune variabili, da scrivere dopo il nome del comando:

| Variabile | Default | Cosa fa | Esempio |
|---|---|---|---|
| `ENV` | `dev` | Ambiente: sceglie `docker-compose.<ENV>.yaml` e `.env.<ENV>` | `make up ENV=staging` |
| `ENV_FILE` | `.env.<ENV>` | Usa un env file diverso da quello dell'ambiente | `make up ENV_FILE=.env.mio` |
| `S` | tutti i servizi | Servizio su cui agire, per `logs`, `restart`, `shell` | `make logs S=backend` |
| `ARGS` | vuoto | Argomenti passati al seeder, per `seed` | `make seed ARGS=answers` |

Ambienti disponibili: `dev`, `test`, `staging`, `prod`. L'ambiente deve avere il proprio env file nella root (`.env.dev`, `.env.staging`, …): nessun ambiente legge più il `.env` generico.

### Controlli automatici

Prima di ogni comando (tranne `help`) il Makefile verifica tre cose e si ferma con un messaggio esplicito se qualcosa non va:

1. **L'env file esiste.** Altrimenti: `ERRORE: manca l'env file .env.<ENV>`.
2. **Nessuna chiave è definita due volte.** Nei file `.env` vince l'ultima occorrenza, quindi una riga duplicata più in basso sovrascriverebbe in silenzio quella sopra.
3. **Con `DB_MODE=external` c'è un `DB_HOST`.** Senza, lo stack non saprebbe a quale database collegarsi.

### Comandi

#### Ciclo di vita dello stack

| Comando | Cosa fa | Quando usarlo |
|---|---|---|
| `make init` | Crea realm e client Keycloak e lo schema del DB (servizi `keycloak-setup` e `db-init`) | Una volta sola, su un database vuoto. È idempotente: se il realm esiste già, lo salta. |
| `make db-certs` | Prepara in `.certs/<ENV>/` i certificati TLS del database esterno (vedi [Certificati TLS](#certificati-tls-sslrootcert-sslcert-sslkey)) | Mai a mano: lo lanciano già `init`, `up`, `up-build` e `deploy`. Senza certificati nell'env file non fa nulla. |
| `make web-certs` | Prepara in `.certs/<ENV>-web/` certificato e chiave HTTPS del frontend (vedi [HTTPS sul frontend](#https-sul-frontend-e-console-keycloak)) | Lo lanciano già `up`, `up-build` e `deploy`. A mano solo dopo il rinnovo del certificato. Con `FRONTEND_TLS=off` non fa nulla. |
| `make up` | Applica le migrazioni pendenti, avvia il backend e aspetta che sia pronto, poi avvia il resto dello stack in primo piano | Avvio di tutti i giorni. Ricrea i container se è cambiato il compose o l'env file. |
| `make up-build` | Come `make up`, ma prima ricostruisce l'immagine del backend e, se l'ambiente ce l'ha, quella del frontend | Staging/prod dopo modifiche al codice. In dev equivale a `make up`: lì non c'è nessuna immagine da costruire. |
| `make deploy` | Come `make up-build`, ma lascia lo stack in background | Aggiornamento sulla VM. |
| `make stop` | Ferma i container senza rimuoverli | Pausa: il successivo `make up` riparte da dove era. |
| `make down` | Ferma e rimuove i container. I volumi (e quindi i dati) restano | Spegnere lo stack. |
| `make down-v` | **Distruttivo.** Come `down`, ma rimuove anche i volumi | Ripartire da zero. Chiede di scrivere `delete` per confermare. Con `DB_MODE=local` cancella il database; con `DB_MODE=external` il database remoto non viene toccato e spariscono solo i volumi locali (`node_modules`, upload). |

`make up`, `make up-build` e `make deploy` seguono sempre lo stesso ordine:

1. build del backend (solo `up-build` e `deploy`);
2. migrazioni pendenti, in un container usa e getta: il codice nuovo non parte mai su uno schema vecchio. Se una migrazione fallisce, make si ferma qui e lo stack resta com'era;
3. avvio del backend, atteso finché il suo healthcheck non è verde;
4. build del frontend (solo `up-build` e `deploy`, e solo dove esiste il servizio);
5. avvio del resto dello stack.

#### Stato e diagnostica

| Comando | Cosa fa |
|---|---|
| `make ps` | Stato dei container dell'ambiente |
| `make logs` | Log di tutti i servizi, in tempo reale (`Ctrl+C` per uscire) |
| `make logs S=backend` | Log di un solo servizio |
| `make restart S=backend` | Riavvia un servizio. **Non** rilegge l'env file: per le variabili nuove serve `make up` |
| `make shell` | Shell dentro il backend (`S=<servizio>` per un altro) |
| `make config` | Valida il compose e stampa la configurazione risolta, con le variabili già sostituite: utile per capire che valore arriva davvero a un container |

#### Database

| Comando | Cosa fa |
|---|---|
| `make migrate-status` | Elenca le migrazioni applicate e quelle pendenti |
| `make migrate` | Applica le migrazioni pendenti. Di solito non serve: `up`, `up-build` e `deploy` lo fanno già |
| `make migrate-baseline` | Segna tutte le migrazioni come applicate senza eseguirle. Solo per allineare il registro su un database già allo stato giusto |
| `make seed` | Lancia **tutti** i seeder attivi in sequenza (risposte, domande statiche, CAT, socio-demografiche, mappature ai gruppi) |
| `make seed ARGS=<seeder>` | Un solo seeder: `answers`, `cat-settings`, `static`, `cat`, `socio-demo`, `mappings` |
| `make psql` | Shell `psql` sul database dell'ambiente, in container o esterno, con le credenziali dell'env file |
| `make reset-db` | **Distruttivo.** Elimina lo schema `euonqol` e riesegue `init.sql`. Chiede di scrivere `reset` per confermare |

> I seeder `countries`, `groups` e `users` compaiono ancora nell'aiuto di `make help`, ma oggi sono commentati in `backend/src/services/seed/index.ts`: `make seed ARGS=countries` risponde `Unknown seeder`.

Le migrazioni e i seeder girano **dentro il container** del backend, non dalla propria macchina: così colpiscono il database configurato nell'env file dell'ambiente.

### Flussi tipici

**Primo avvio in locale**

```bash
cp .env.example .env.dev   # poi valorizza i campi necessari
make init                  # una volta sola
make up
```

Il frontend in dev non è nel compose: si avvia a parte con `npm run dev` dentro `frontend-shadcn/`.

**Avvio di tutti i giorni**

```bash
make up            # in un terminale (Ctrl+C per fermare)
make logs S=backend   # in un altro, se servono i log
```

**Ho modificato l'env file**

```bash
make up            # ricrea i container con le variabili nuove
```

`make restart` non basta: riavvia lo stesso container con le variabili che aveva.

**Il backend non vede le mie modifiche al codice (Windows)**

Il backend in dev gira con `tsx --watch`, che non sempre riceve gli eventi di modifica dei file salvati da Windows. Riavvialo:

```bash
make restart S=backend
```

**Ripartire con un database pulito**

```bash
make reset-db      # svuota solo lo schema euonqol, Keycloak resta com'è
# oppure, per azzerare proprio tutto (anche Keycloak):
make down-v
make init
make up
```

**Aggiornare staging sulla VM**

```bash
git pull
make deploy ENV=staging
make ps ENV=staging
```

### Problemi comuni

| Messaggio | Causa e soluzione |
|---|---|
| `make: command not found` | `make` non è installato in questa shell: vedi [Installare make](#installare-make). |
| Errori di sintassi o `'[' is not recognized` | Stai lanciando `make` da PowerShell o da cmd: usa WSL o Git Bash. |
| `ERRORE: manca l'env file .env.dev` | Crea l'env file dell'ambiente, partendo da `.env.example`. |
| `ERRORE: .env.dev definisce piu' volte: ...` | Una chiave compare due volte: tieni una sola riga per chiave. |
| `ERRORE: ... DB_MODE=external ma DB_HOST e' vuoto` | Valorizza `DB_HOST`, oppure torna a `DB_MODE=local`. |
| `ERRORE: DB_SSLMODE=verify-full richiede DB_SSLROOTCERT` | Valorizza `DB_SSLROOTCERT` con la CA del server, oppure usa `require`. |
| `ERRORE: /etc/SSLcert/... non esiste o non e' leggibile da <utente>` | Percorso sbagliato, oppure l'utente non può leggere il file: lancia make con `sudo` o sistema i permessi. |
| Keycloak: `private key file ... has group or world access` | L'entrypoint di Keycloak nel compose è stato modificato: deve copiare `client.pk8` in `/tmp` con permessi `0600`. |
| Una variabile cambiata nell'env file non ha effetto | Serve `make up`, non `make restart`. Con `make config` vedi il valore che arriva al container. |

---

## Reset schema e re-inizializzazione del DB

Ripristina il database a uno stato pulito, eliminando lo schema esistente e rieseguendo `init.sql` da zero.

> **ATTENZIONE: questa operazione cancella tutti i dati presenti nello schema `euonqol`.**

```bash
make reset-db          # chiede conferma scrivendo 'reset'
```

Il target funziona in entrambe le modalità: legge utente, password e `KEYCLOAK_DB_SCHEMA` dall'env file e si collega a `DB_HOST`, che sia il container o un server esterno. Una shell psql sullo stesso database si apre con `make psql`.

Per farlo a mano, l'equivalente è un `DROP SCHEMA IF EXISTS euonqol CASCADE;` seguito da `psql ... -v keycloak_schema=<schema> -f - < ./setup/db/init.sql`. Il valore di `-v keycloak_schema` deve corrispondere a `KEYCLOAK_DB_SCHEMA`: omettendolo, `init.sql` assume `public`.

---

## Spostare Keycloak in uno schema dedicato

Di default le tabelle di Keycloak stanno nello schema `public`. Si possono spostare
altrove valorizzando `KEYCLOAK_DB_SCHEMA` nel file di ambiente: da li' il nome arriva
al container Keycloak (`KC_DB_SCHEMA`), alla URL del client Prisma (`?schema=`) e a
`init.sql` (variabile psql).

**Su un ambiente nuovo** basta impostare la variabile prima del primo avvio: lo
schema viene creato dal servizio `db-schemas`, che gira prima di Keycloak a ogni `up`.
Keycloak crea le proprie tabelle ma **non** lo schema che le contiene, quindi quel
passaggio non e' opzionale.

**Su un database gia' popolato** la variabile da sola non basta: le tabelle vanno
spostate a mano. Fermare backend e Keycloak, poi:

```sql
\dt public.*   -- atteso: solo tabelle Keycloak + databasechangelog*
\dx            -- annotare eventuali estensioni installate in public

BEGIN;
ALTER SCHEMA public RENAME TO keycloak;
CREATE SCHEMA public;
GRANT ALL   ON SCHEMA public TO euonqol_user;
GRANT USAGE ON SCHEMA public TO PUBLIC;
COMMIT;
```

**Le foreign key da `euonqol` verso `user_entity` non richiedono alcun intervento**:
PostgreSQL le lega per OID, non per nome. Dopo il rename, `\d euonqol.patients`
mostra da solo `REFERENCES keycloak.user_entity(id)`.

Se `\dx` elenca delle estensioni installate in `public`, non usare `ALTER SCHEMA
... RENAME`, che se le trascina dietro: spostare le singole tabelle in ciclo
(`ALTER TABLE public.%I SET SCHEMA keycloak` su `pg_tables`, poi `pg_views`).

Infine impostare `KEYCLOAK_DB_SCHEMA=keycloak` e riavviare, Keycloak per primo.

---

## HTTPS sul frontend e console Keycloak

```
Browser ──HTTPS :443──▶ nginx (frontend) ──HTTP──▶ backend ──HTTP──▶ Keycloak
                        └ certificato pubblico      (rete docker)    (rete docker)
```

Il TLS verso il browser lo termina l'nginx del frontend, che è già l'unico punto d'ingresso dell'app (pagine e `/euonqol-api/`). Dietro, dentro la rete docker, si resta in HTTP. Il browser non parla mai con Keycloak: login, OTP e verifica dei token passano dal backend, che lo chiama su `http://keycloak:8080`.

### Attivare l'HTTPS

Nell'env file, con i percorsi dei file **sulla macchina che esegue Docker**:

```dotenv
FRONTEND_TLS=on
FRONTEND_TLS_CERT=/etc/ssl/euonqol/fullchain.pem
FRONTEND_TLS_KEY=/etc/ssl/euonqol/privkey.pem
FRONTEND_HTTPS_PORT=443
```

poi `make deploy ENV=prod`. Con `on`:

- nginx ascolta anche sulla 443, con la stessa configurazione della 80 (`frontend-shadcn/docker/app.conf`);
- la porta 80 risponde `301` verso `https://`, tranne per `localhost`/`127.0.0.1`, così l'healthcheck del container resta in HTTP;
- `X-Forwarded-Proto` arriva al backend come `https`.

Con `off` (il default) l'nginx è quello di prima: solo HTTP sulla porta 80. La 443 del container viene pubblicata su una porta effimera di `127.0.0.1`, quindi non occupa la 443 dell'host.

Note:

- Il certificato deve contenere anche gli intermedi (fullchain) e la chiave deve essere senza passphrase. `make web-certs` controlla che la chiave sia quella del certificato e che l'utente che lancia make possa leggere i file. In caso contrario si ferma prima di toccare i container.
- Con `FRONTEND_TLS=on` ma senza certificato in `.certs/<ENV>-web/` il container del frontend **non parte**: meglio fermo che in chiaro. Succede se lo stack viene avviato con `docker compose` invece che con `make`. Per lo stesso motivo, uno script di avvio al boot della VM deve passare da `make`.
- Niente HSTS per ora: una volta ricevuto, il browser rifiuterebbe l'HTTP per mesi anche tornando a `off`. Va aggiunto in `https.conf` quando l'HTTPS è definitivo.
- Se `CORS_ORIGINS` è valorizzato, aggiungere l'origine `https://...`.

### Rinnovo del certificato

nginx legge il certificato solo all'avvio, e `make deploy` non ricrea il frontend se la sua configurazione non è cambiata. Dopo aver sostituito i file sulla VM:

```bash
make web-certs ENV=prod
make restart ENV=prod S=frontend
```

### Console admin di Keycloak (prod)

In prod Keycloak gira in modalità produzione (`start`) e la sua porta è pubblicata solo su `127.0.0.1` della VM. Per aprire la console admin si usa un tunnel SSH dalla propria macchina:

```bash
ssh -L 8080:localhost:8080 <utente>@<vm>
# poi, nel browser: http://localhost:8080/admin/
```

`KEYCLOAK_BIND=0.0.0.0` nell'env file ripristina l'esposizione su tutte le interfacce.

Il client `security-admin-console` accetta redirect verso `KEYCLOAK_URL_PUBLIC` e, da questa versione di `init-keycloak.sh`, verso qualunque host (`/admin/master/console/*`, il default di Keycloak). Su un'installazione inizializzata prima, con `KEYCLOAK_URL_PUBLIC` diverso da `http://localhost:8080`, la console via tunnel risponde `Invalid parameter: redirect_uri`. In quel caso si aggiunge il redirect una volta, dalla VM:

```bash
docker exec -it euonqol-keycloak sh -c '
  /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" &&
  ID=$(/opt/keycloak/bin/kcadm.sh get clients -r master -q clientId=security-admin-console --fields id --format csv --noquotes) &&
  /opt/keycloak/bin/kcadm.sh update clients/$ID -r master -s "redirectUris+=/admin/master/console/*"'
```

(`euonqol` è il `COMPOSE_PROJECT_NAME` dell'env file.) Se nel frattempo la password dell'admin è stata cambiata dalla console, va scritta al posto di `$KC_BOOTSTRAP_ADMIN_PASSWORD`.

---

## Deploy su Azure (staging)

> Prima di aggiornare staging o prod, verificare connessioni al database e segreti seguendo [verifica-connessioni.md](verifica-connessioni.md).

### Prerequisiti sulla macchina Azure
- Docker e Docker Compose installati
- Repo clonata in `/home/azureuserEuonquol/prj/euonqol/1024-euonqol-kit`
- File `.env.staging` presente nella root del progetto (non versionato, si parte da `.env.example`)

Come in dev, l'env file prende il nome dall'ambiente: sulla VM è `.env.staging` e `make ... ENV=staging` lo passa da sé con `--env-file`. Chi arriva da un'installazione precedente, dove il file si chiamava `.env`, deve rinominarlo una volta con `mv .env .env.staging`. Un `.env` rimasto nella root non viene più letto.

### Prima installazione (da zero, DB vuoto)

`keycloak-setup` e `db-init` sono dietro il profilo `init` (vedi nota sotto): su un ambiente nuovo vanno lanciati esplicitamente una volta, altrimenti realm Keycloak e schema DB non vengono creati.

```bash
# 1. Connessione SSH alla macchina Azure
ssh azureuserEuonquol@<ip-azure>

# 2. Entrare nella cartella del progetto
cd /home/azureuserEuonquol/prj/euonqol/1024-euonqol-kit

# 3a. Inizializza Keycloak (realm/client/utenti) e schema DB — solo la prima volta
make init ENV=staging
#    equivalente: docker compose -f docker-compose.staging.yaml --env-file .env.staging --profile localdb --profile init up keycloak-setup db-init

# 3b. Avvio completo: build e avvio del backend (con migrazioni), poi build e avvio del frontend
make deploy ENV=staging

# 4. Verifica stato dei container
make ps ENV=staging
```

> Il `--profile localdb` serve perché il container `postgres` è un add-on opzionale (vedi "Dove gira il database: `DB_MODE`"). Il Makefile lo aggiunge da sé quando `DB_MODE` non è `external`; lanciando `docker compose` a mano va passato esplicitamente, altrimenti lo stack parte senza database.

### Aggiornamento codice (DB già esistente con dati)

Ricostruisce e avvia prima il backend, applicando le migrazioni pendenti, e solo dopo ricostruisce e avvia il frontend. Postgres, Keycloak e i dati restano come sono: i loro container vengono ricreati solo se è cambiata la loro configurazione.

```bash
# 1. Connessione SSH alla macchina Azure
ssh azureuserEuonquol@<ip-azure>

# 2. Entrare nella cartella del progetto
cd /home/azureuserEuonquol/prj/euonqol/1024-euonqol-kit

# 3. Pull dell'ultimo codice
git pull origin master

# 4. Rebuild, migrazioni e riavvio
make deploy ENV=staging

# 5. Verifica stato
make ps ENV=staging
```

> `keycloak-setup` e `db-init` hanno `restart: "no"` e sono dietro `profiles: ["init"]`: non fanno parte del piano di default, quindi `up` su `backend`/`frontend` (o su tutto lo stack) non li avvia né li rivaluta mai — dati esistenti mai toccati nei deploy di routine.
>
> Vanno rilanciati manualmente con `--profile init up keycloak-setup db-init` solo in due casi: primo avvio su un ambiente nuovo, oppure dopo un reset completo del volume postgres (`down -v`). Mai per un normale aggiornamento codice.

### Comandi utili

```bash
# Stop completo
make down ENV=staging

# Stop + rimozione volumi (ATTENZIONE: cancella il DB)
make down-v ENV=staging

# Log in tempo reale
make logs ENV=staging

# Log di un singolo servizio
make logs S=backend ENV=staging
```

---

## Log dei tentativi bloccati da nginx

Nginx respinge da sé i pattern usati dagli scanner automatici (`.env`, `/vendor/phpunit/`,
`wp-admin`, estensioni `.php` e simili — vedi `frontend-shadcn/docker/blocklist.conf`), i
user-agent di scanner noti e i metodi HTTP non ammessi. Ogni richiesta respinta viene
registrata in un file giornaliero.

| | |
|---|---|
| Cartella (host) | `logs/nginx/` nella root del progetto |
| File | `blocked-YYYY-MM-DD.log`, un file al giorno (data UTC) |
| Cosa contiene | solo ciò che respinge nginx: 403 (blocklist e user-agent) e 405 (metodo) |
| Retention | 7 giorni, cancellazione automatica alle 03:00 UTC |

I 403 restituiti dal backend per dinieghi di permesso **non** finiscono nel file: il filtro
tiene solo le richieste in cui il backend non è stato nemmeno contattato. Nei giorni senza
tentativi bloccati il file non viene creato.

La pulizia è gestita da `crond` dentro lo stesso container del frontend, configurato in
`frontend-shadcn/docker/log-cleanup.crontab`: non serve nessun cron sulla VM.

```bash
# I path bloccati più frequenti (utile per decidere cosa aggiungere alla blocklist)
sed -n 's/.*uri="\([^"]*\)".*/\1/p' logs/nginx/blocked-*.log | sort | uniq -c | sort -rn | head -20

# Gli IP più insistenti
sed -n 's/.*ip=\([^ ]*\).*/\1/p' logs/nginx/blocked-*.log | sort | uniq -c | sort -rn | head -20

# Verifica che la pulizia notturna stia girando
cat logs/nginx/last-cleanup.log

# Verifica che crond sia attivo nel container
docker compose -f docker-compose.staging.yaml exec frontend pgrep -a crond
```

Per aggiungere un pattern alla blocklist: modificare `frontend-shadcn/docker/blocklist.conf`
e ricostruire il solo frontend con `docker compose -f docker-compose.staging.yaml --profile localdb up --build -d frontend`.

---

## Avvio automatico su Azure (systemd)

La macchina Azure avvia automaticamente l'applicazione al boot tramite un servizio systemd.

### `/etc/systemd/system/docker-app.service`

```ini
[Unit]
Description=Avvio Docker Compose App
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/start-docker-app.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

### `/usr/local/bin/start-docker-app.sh`

```bash
#!/bin/bash
# Aspetta che Docker sia pronto (max 30 secondi)
for i in {1..30}; do
  if docker info > /dev/null 2>&1; then
    echo "Docker è pronto!"
    break
  fi
  sleep 1
done

# Vai nella cartella del progetto
cd /home/azureuserEuonquol/prj/euonqol/1024-euonqol-kit

# Avvia Docker Compose.
# --profile localdb e' necessario: il container postgres e' un add-on
# opzionale, senza il profilo lo stack parte senza database.
docker compose -f docker-compose.staging.yaml --profile localdb up -d

# Log
echo "Docker Compose avviato alle $(date)" >> /var/log/docker-app-start.log
```

### Comandi gestione servizio systemd

```bash
# Abilitare l'avvio automatico
sudo systemctl enable docker-app.service

# Avviare manualmente il servizio
sudo systemctl start docker-app.service

# Verificare lo stato
sudo systemctl status docker-app.service

# Vedere il log di avvio
cat /var/log/docker-app-start.log
```
