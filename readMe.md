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

Poi nell'env file: `DB_MODE=external`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE` e `KEYCLOAK_DB_SCHEMA`. La password finisce in una connection string: caratteri come `@ : / ? #` vanno percent-encoded.

Su `DB_SSLMODE` vale la pena essere precisi, perché il comportamento non è quello di libpq:

| Valore | Quando |
|---|---|
| `disable` (default) | postgres in container: non espone TLS |
| `prefer` | server esterno con certificato self-signed |
| `require` | Azure, o qualunque server che imponga TLS |

Le URL portano `uselibpqcompat=true` perché dalla 8.16 il driver `pg` interpreta `prefer`/`require` come `verify-full` e si rifiuta di connettersi a un certificato self-signed, mentre Prisma segue la semantica libpq: senza il flag il server parte regolarmente ma `scripts/migrate.ts` fallisce con `self-signed certificate`. Attenzione però: sotto quel flag `prefer` **non** ricade su plaintext se il server è senza TLS, quindi con il database in container serve davvero `disable` (altrimenti `The server does not support SSL connections`). Il Makefile lo impone da sé in modalità `local`.

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

Non sono eseguite da nessun compose, e vanno lanciate **dal container**:

```bash
make migrate-status
make migrate
```

Lanciare `npm run migrate` dalla propria macchina dentro `backend/` usa `backend/.env`, che punta a `localhost:5432`. Nel container invece l'ambiente ha la precedenza su `--env-file`, quindi si colpisce il database effettivamente configurato.

### Note
- Il backend monta il codice sorgente come volume e usa `npm run dev` (hot reload).
- Prisma genera i client a ogni avvio (`prisma generate`), nessun `db pull` necessario.
- **Il primo avvio di Keycloak su un DB esterno è lento**: il bootstrap Liquibase esegue centinaia di DDL, ognuno con un round trip di rete — misurati ~5 minuti contro i pochi secondi in locale. `init-keycloak.sh` aspetta al massimo 3 minuti, quindi `keycloak-setup` ha un entrypoint che attende Keycloak senza limite di tentativi prima di lanciare lo script. Gli avvii successivi sono rapidi.
- Con `DB_MODE=external`, `down -v` **non** cancella i dati: i volumi locali sono solo quelli di `node_modules` e degli upload.
- Il frontend non è nel compose dev: si avvia con `npm run dev` in `frontend-shadcn/`.

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

## Deploy su Azure (staging)

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
