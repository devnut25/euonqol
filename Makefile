# EUONQOL Kit — comandi di gestione degli ambienti.
#
# Le ricette sono sh, quindi su Windows va lanciato da WSL o da Git Bash, non
# da PowerShell. In WSL `make` c'e' gia'; per Git Bash serve installarlo
# (`winget install ezwinports.make` oppure `choco install make`).
#
#   make help                 elenco dei target
#   make up                   ambiente dev
#   make up ENV=staging       altro ambiente
#   make logs S=backend       log di un servizio
#
# ENV sceglie insieme il compose e l'env file (.env.dev, .env.staging,
# .env.prod), anche sulla VM: nessun ambiente legge piu' il `.env` generico.

ENV      ?= dev
ENV_FILE ?= .env.$(ENV)

# Legge una variabile dall'env file (ultima occorrenza, senza CR di Windows).
envget = $(strip $(shell grep -E '^$(1)=' $(ENV_FILE) 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r'))

DB_MODE     := $(call envget,DB_MODE)
DB_USER     := $(or $(call envget,DB_USER),euonqol_user)
DB_NAME     := $(or $(call envget,DB_NAME),euonqol)
DB_PASSWORD := $(call envget,DB_PASSWORD)
DB_PORT     := $(or $(call envget,DB_PORT),5432)
PG_VERSION  := $(or $(call envget,POSTGRES_VERSION),15)
KC_SCHEMA   := $(or $(call envget,KEYCLOAK_DB_SCHEMA),public)
PROJECT     := $(or $(call envget,COMPOSE_PROJECT_NAME),euonqol)

# DB_MODE e' l'unica fonte di verita'. In modalita' local il profilo `localdb`
# e DB_HOST vengono imposti qui: l'ambiente della shell ha precedenza
# sull'--env-file, quindi un DB_HOST rimasto valorizzato nel file non puo'
# mandare l'ambiente in uno stato incoerente.
ifeq ($(DB_MODE),external)
  DB_HOST  := $(call envget,DB_HOST)
  PROFILES :=
  export DB_HOST
  DB_SSLMODE     := $(or $(call envget,DB_SSLMODE),disable)
  DB_SSLROOTCERT := $(call envget,DB_SSLROOTCERT)
  DB_SSLCERT     := $(call envget,DB_SSLCERT)
  DB_SSLKEY      := $(call envget,DB_SSLKEY)
  # Nome del database risolto solo dall'/etc/hosts della macchina, che i
  # container non vedono: DB_HOST_IP lo aggiunge al loro /etc/hosts (compose
  # extra_hosts, --add-host per psql) senza cambiare DB_HOST, che deve restare
  # il nome del certificato per verify-full.
  DB_HOST_IP     := $(call envget,DB_HOST_IP)
  DB_HOSTS_ENTRY := $(if $(DB_HOST_IP),$(DB_HOST):$(DB_HOST_IP))
  DOWNV_WARN := Il database su $(DB_HOST) NON viene toccato: spariscono solo i volumi locali (node_modules, upload).
else
  DB_HOST  := postgres
  export DB_HOST
  # I profili vanno passati come flag, non via COMPOSE_PROFILES: un --profile
  # sulla riga di comando SOSTITUISCE quella variabile invece di sommarsi,
  # quindi `make init` (che aggiunge --profile init) perderebbe `localdb` e
  # lascerebbe lo stack senza database.
  PROFILES := --profile localdb
  # Il postgres in container non espone TLS, e il driver `pg` con
  # sslmode=prefer non ricade su plaintext: fallirebbe con
  # "The server does not support SSL connections".
  export DB_SSLMODE := disable
  # Come DB_HOST: certificati rimasti nell'env file non devono arrivare ai
  # container quando il database e' quello locale.
  DB_SSLROOTCERT :=
  DB_SSLCERT     :=
  DB_SSLKEY      :=
  DB_HOSTS_ENTRY :=
  DOWNV_WARN := Il volume $(PROJECT)-postgres-data viene cancellato: si perdono TUTTI i dati del database.
endif

# Certificati TLS del database esterno (sslrootcert, sslcert, sslkey di libpq).
# Nell'env file ci sono i percorsi sulla macchina Docker; `make db-certs` li
# copia in .certs/<ENV>, aggiunge i formati che non tutti i client leggono dal
# PEM e la cartella viene montata in sola lettura su /certs nei container.
# I compose aggiungono i parametri di ogni client solo se la variabile
# corrispondente e' valorizzata (${VAR:+...}): per questo vanno esportate anche
# vuote, altrimenti varrebbe quella dell'env file.
#   root.crt     CA del server              psql, pg, Prisma, Keycloak
#   client.crt   certificato client (PEM)   psql, Keycloak
#   client.key   chiave client (PEM, 0600)  psql
#   client.pk8   chiave in PKCS#8 DER       Keycloak (pgjdbc non legge il PEM;
#                                           la copia in /tmp con i suoi permessi)
#   client.p12   certificato + chiave       Prisma e pg (sslidentity / pfx)
export DB_SSLROOTCERT DB_SSLCERT DB_SSLKEY DB_HOSTS_ENTRY
export DB_CERTS_DIR := ./.certs/$(ENV)
# Prisma accetta solo disable, prefer e require: verify-ca e verify-full
# diventano `require` piu' sslaccept=strict (aggiunto dal compose quando c'e'
# la CA), che verifica la catena e anche l'hostname.
export DB_SSLMODE_PRISMA := $(if $(filter verify-ca verify-full,$(DB_SSLMODE)),require,$(DB_SSLMODE))

# HTTPS sul frontend (nginx). FRONTEND_TLS=on nell'env file accende il server
# sulla 443 del container e il rimando dalla porta 80; `make web-certs` copia
# certificato e chiave in .certs/<ENV>-web, montata su /etc/nginx/tls.
# La porta HTTPS si pubblica sull'host solo ad HTTPS acceso: spento,
# FRONTEND_HTTPS_PUBLISH resta vuota e il compose ripiega su una porta effimera
# di 127.0.0.1.
FRONTEND_TLS        := $(or $(call envget,FRONTEND_TLS),off)
FRONTEND_TLS_CERT   := $(call envget,FRONTEND_TLS_CERT)
FRONTEND_TLS_KEY    := $(call envget,FRONTEND_TLS_KEY)
FRONTEND_HTTPS_PORT := $(or $(call envget,FRONTEND_HTTPS_PORT),443)
export FRONTEND_TLS FRONTEND_HTTPS_PORT
export WEB_CERTS_DIR := ./.certs/$(ENV)-web
export FRONTEND_HTTPS_PUBLISH := $(if $(filter on,$(FRONTEND_TLS)),$(FRONTEND_HTTPS_PORT):443)

# Proxy in uscita (VM senza accesso diretto a internet). Al backend arriva come
# OUTBOUND_PROXY dal compose; per la build delle immagini (npm, apk, Prisma) si
# esportano le variabili standard, che il compose passa come build args. Vuoto
# = nulla viene esportato e le build restano come prima.
OUTBOUND_PROXY := $(call envget,OUTBOUND_PROXY)
ifneq ($(OUTBOUND_PROXY),)
  export HTTP_PROXY  := $(OUTBOUND_PROXY)
  export HTTPS_PROXY := $(OUTBOUND_PROXY)
  export http_proxy  := $(OUTBOUND_PROXY)
  export https_proxy := $(OUTBOUND_PROXY)
endif

COMPOSE := docker compose -f docker-compose.$(ENV).yaml --env-file $(ENV_FILE) $(PROFILES)

# Le stesse opzioni TLS dei container psql del compose, per `make psql` e
# `make reset-db`. `docker run -v` vuole un percorso assoluto.
PSQL_SSL := -e PGSSLMODE=$(DB_SSLMODE)
ifneq ($(DB_SSLROOTCERT)$(DB_SSLCERT),)
  PSQL_SSL += -v "$(CURDIR)/.certs/$(ENV):/certs:ro"
  PSQL_SSL += $(if $(DB_SSLROOTCERT),-e PGSSLROOTCERT=/certs/root.crt)
  PSQL_SSL += $(if $(DB_SSLCERT),-e PGSSLCERT=/certs/client.crt -e PGSSLKEY=/certs/client.key)
endif
PSQL_SSL += $(if $(DB_HOSTS_ENTRY),--add-host $(DB_HOSTS_ENTRY))

.DEFAULT_GOAL := help
.PHONY: help guard db-certs web-certs init up up-build deploy down stop ps restart logs config \
        migrate migrate-status migrate-baseline seed shell psql reset-db down-v

help: ## Mostra questo elenco
	@echo "EUONQOL Kit — ENV=$(ENV)  DB_MODE=$(or $(DB_MODE),local)  DB_HOST=$(DB_HOST)"
	@echo ""
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Variabili: ENV=dev|test|staging|prod  ENV_FILE=...  S=<servizio>  ARGS=..."

guard:
	@[ -f "$(ENV_FILE)" ] || { echo "ERRORE: manca l'env file $(ENV_FILE)"; exit 1; }
	@dups=`grep -oE '^[A-Z_]+=' $(ENV_FILE) | sort | uniq -d | tr -d '='`; if [ -n "$$dups" ]; then echo "ERRORE: $(ENV_FILE) definisce piu' volte: $$dups"; echo "        Nei file .env vince l'ULTIMA occorrenza: una riga duplicata piu' in basso"; echo "        sovrascrive in silenzio quella sopra. Tieni una sola definizione per chiave."; exit 1; fi
	@if [ "$(DB_MODE)" = "external" ] && [ -z "$(DB_HOST)" ]; then echo "ERRORE: $(ENV_FILE) ha DB_MODE=external ma DB_HOST e' vuoto."; echo "        Valorizza DB_HOST, oppure usa DB_MODE=local."; exit 1; fi

# --- ciclo di vita ----------------------------------------------------------

# Rigenerato a ogni init/up/up-build/deploy, cosi' un certificato rinnovato in
# /etc/... arriva ai container al primo avvio successivo. I file si
# sovrascrivono senza ricreare la cartella: un container gia' avviato la tiene
# montata e la vedrebbe sparire. openssl e' quello della macchina Docker.
# Con DB_MODE=local, o senza certificati nell'env file, la cartella resta vuota.
db-certs: guard ## Prepara in .certs/<ENV> i certificati TLS del DB esterno (lo fanno gia' init/up/deploy)
	@mkdir -p $(DB_CERTS_DIR)
	@rm -f $(DB_CERTS_DIR)/root.crt $(DB_CERTS_DIR)/client.*
	@case "$(DB_SSLMODE)" in verify-*) [ -n "$(DB_SSLROOTCERT)" ] || { echo "ERRORE: DB_SSLMODE=$(DB_SSLMODE) richiede DB_SSLROOTCERT (la CA del server)."; exit 1; };; esac
	@if [ -n "$(DB_SSLCERT)$(DB_SSLKEY)" ] && { [ -z "$(DB_SSLCERT)" ] || [ -z "$(DB_SSLKEY)" ]; }; then echo "ERRORE: DB_SSLCERT e DB_SSLKEY vanno valorizzati insieme."; exit 1; fi
	@for f in $(DB_SSLROOTCERT) $(DB_SSLCERT) $(DB_SSLKEY); do [ -r "$$f" ] || { echo "ERRORE: $$f non esiste o non e' leggibile da `id -un`."; exit 1; }; done
	@if [ -n "$(DB_SSLROOTCERT)" ]; then cp "$(DB_SSLROOTCERT)" $(DB_CERTS_DIR)/root.crt; chmod 644 $(DB_CERTS_DIR)/root.crt; fi
	@if [ -n "$(DB_SSLCERT)" ]; then \
	  command -v openssl >/dev/null || { echo "ERRORE: serve openssl sulla macchina Docker (apt install openssl)."; exit 1; }; \
	  cp "$(DB_SSLCERT)" $(DB_CERTS_DIR)/client.crt && \
	  ( umask 077; cp "$(DB_SSLKEY)" $(DB_CERTS_DIR)/client.key ) && chmod 600 $(DB_CERTS_DIR)/client.key && \
	  openssl pkcs8 -topk8 -nocrypt -inform PEM -outform DER -in "$(DB_SSLKEY)" -out $(DB_CERTS_DIR)/client.pk8 && \
	  openssl pkcs12 -export -in "$(DB_SSLCERT)" -inkey "$(DB_SSLKEY)" -out $(DB_CERTS_DIR)/client.p12 -passout pass: && \
	  chmod 644 $(DB_CERTS_DIR)/client.crt $(DB_CERTS_DIR)/client.pk8 $(DB_CERTS_DIR)/client.p12 || exit 1; \
	fi
	@if [ -n "$(DB_SSLROOTCERT)$(DB_SSLCERT)" ]; then echo "Certificati TLS del database pronti in $(DB_CERTS_DIR)."; fi

# Come db-certs: rigenerato a ogni up/up-build/deploy, sovrascrivendo i file
# senza ricreare la cartella. nginx legge il certificato solo all'avvio: dopo
# un rinnovo va riavviato il frontend (vedi readMe). Con FRONTEND_TLS=off la
# cartella resta vuota. I controlli vengono prima della cancellazione, cosi'
# un env file sbagliato non porta via il certificato in uso. Il confronto delle
# chiavi pubbliche evita di avviare nginx con una chiave che non e' quella del
# certificato.
web-certs: guard ## Prepara in .certs/<ENV>-web certificato e chiave HTTPS del frontend (lo fanno gia' up/deploy)
	@case "$(FRONTEND_TLS)" in on|off) ;; *) echo "ERRORE: FRONTEND_TLS=$(FRONTEND_TLS): i valori ammessi sono on e off."; exit 1;; esac
	@if [ "$(FRONTEND_TLS)" = "on" ]; then \
	  if [ -z "$(FRONTEND_TLS_CERT)" ] || [ -z "$(FRONTEND_TLS_KEY)" ]; then echo "ERRORE: FRONTEND_TLS=on richiede FRONTEND_TLS_CERT e FRONTEND_TLS_KEY."; exit 1; fi; \
	  for f in "$(FRONTEND_TLS_CERT)" "$(FRONTEND_TLS_KEY)"; do [ -r "$$f" ] || { echo "ERRORE: $$f non esiste o non e' leggibile da `id -un`."; exit 1; }; done; \
	  command -v openssl >/dev/null || { echo "ERRORE: serve openssl sulla macchina Docker (apt install openssl)."; exit 1; }; \
	  if [ "`openssl x509 -noout -pubkey -in "$(FRONTEND_TLS_CERT)" | openssl sha256`" != "`openssl pkey -pubout -in "$(FRONTEND_TLS_KEY)" | openssl sha256`" ]; then echo "ERRORE: $(FRONTEND_TLS_KEY) non e' la chiave di $(FRONTEND_TLS_CERT)."; exit 1; fi; \
	fi
	@mkdir -p $(WEB_CERTS_DIR)
	@rm -f $(WEB_CERTS_DIR)/fullchain.pem $(WEB_CERTS_DIR)/privkey.pem
	@if [ "$(FRONTEND_TLS)" = "on" ]; then \
	  cp "$(FRONTEND_TLS_CERT)" $(WEB_CERTS_DIR)/fullchain.pem && chmod 644 $(WEB_CERTS_DIR)/fullchain.pem && \
	  ( umask 077; cp "$(FRONTEND_TLS_KEY)" $(WEB_CERTS_DIR)/privkey.pem ) && chmod 600 $(WEB_CERTS_DIR)/privkey.pem || exit 1; \
	  echo "Certificato HTTPS del frontend pronto in $(WEB_CERTS_DIR)."; \
	fi

init: guard db-certs ## Inizializzazione una tantum (realm Keycloak + schema DB)
	$(COMPOSE) --profile init up keycloak-setup db-init

# up, up-build e deploy portano su il backend per intero prima di toccare il
# frontend:
#   1. (solo up-build e deploy) build dell'immagine del backend;
#   2. migrazioni pendenti, in un container usa e getta del backend, cosi' il
#      codice nuovo non parte mai su uno schema vecchio. migrate.ts applica
#      solo quelle non ancora registrate: a DB allineato non fa nulla. Se una
#      fallisce, make si ferma qui e lo stack resta com'era;
#   3. avvio del backend, atteso finche' il suo healthcheck non e' verde;
#   4. (solo up-build e deploy) build dell'immagine del frontend, se l'ambiente
#      ce l'ha (in dev no);
#   5. avvio del resto dello stack, frontend compreso.
# In dev e test il backend gira su node:20-alpine con node_modules in un volume
# nominato, popolato solo dal `command` del servizio: su un volume nuovo (primo
# avvio, dopo down-v) e' vuoto e migrate.ts non trova `pg`. Se manca tsx si
# installa prima di migrare; nelle immagini buildate (staging, prod) c'e' gia'.
# `--no-install` evita che npx scarichi tsx al volo, fuori dal lockfile.
define start-backend
	$(COMPOSE) run --rm --entrypoint sh backend -c \
	  '[ -x node_modules/.bin/tsx ] || npm install; exec npx --no-install tsx scripts/migrate.ts'
	$(COMPOSE) up -d --wait backend
endef

# In dev il frontend non e' nel compose (si avvia a mano con `npm run dev` in
# frontend-shadcn/): la build si fa solo dove il servizio esiste.
define build-frontend
	@if $(COMPOSE) config --services 2>/dev/null | grep -qx frontend; then \
	  echo "$(COMPOSE) build frontend"; $(COMPOSE) build frontend; \
	else \
	  echo "Nessun servizio frontend in docker-compose.$(ENV).yaml: build saltata."; \
	fi
endef

up: guard db-certs web-certs ## Migrazioni, backend, poi il resto in foreground
	$(start-backend)
	$(COMPOSE) up

up-build: guard db-certs web-certs ## Build e avvio del backend, poi build e avvio del frontend (se presente)
	$(COMPOSE) build backend
	$(start-backend)
	$(build-frontend)
	$(COMPOSE) up

deploy: guard db-certs web-certs ## Come up-build, in background (usato sulla VM)
	$(COMPOSE) build backend
	$(start-backend)
	$(build-frontend)
	$(COMPOSE) up -d

down: guard ## Ferma e rimuove i container
	$(COMPOSE) down

stop: guard ## Ferma i container senza rimuoverli
	$(COMPOSE) stop

down-v: guard ## DISTRUTTIVO: down + rimozione dei volumi
	@echo "ATTENZIONE: rimuove i volumi del progetto $(PROJECT)."
	@echo "$(DOWNV_WARN)"
	@printf "Scrivi 'delete' per confermare: "; read ans; [ "$$ans" = "delete" ] || { echo "Annullato."; exit 1; }
	$(COMPOSE) down -v

ps: guard ## Stato dei servizi
	$(COMPOSE) ps

restart: guard ## Riavvia un servizio (S=backend)
	$(COMPOSE) restart $(S)

logs: guard ## Log in tail, opzionalmente di un servizio (S=backend)
	$(COMPOSE) logs -f $(S)

config: guard ## Valida il compose e stampa la configurazione risolta
	$(COMPOSE) config

# --- database ---------------------------------------------------------------

# Le migrazioni girano DENTRO il container: le variabili arrivano solo dal
# compose, cioe' dall'env file dell'ambiente.
migrate: guard ## Applica le migrazioni SQL pendenti
	$(COMPOSE) exec backend npm run migrate

migrate-status: guard ## Elenca migrazioni applicate e pendenti
	$(COMPOSE) exec backend npm run migrate:status

migrate-baseline: guard ## Marca tutte le migrazioni come applicate
	$(COMPOSE) exec backend npm run migrate:baseline

seed: guard ## Popola i dati (ARGS=countries|groups|users|answers|static|cat|mappings)
	$(COMPOSE) exec backend npm run seed $(ARGS)

psql: guard ## Shell psql sul database attivo, in container o esterno
	docker run --rm -it --network $(PROJECT)-network $(PSQL_SSL) \
	  -e PGPASSWORD='$(DB_PASSWORD)' \
	  postgres:$(PG_VERSION) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME)

reset-db: guard ## DISTRUTTIVO: elimina lo schema euonqol e riesegue init.sql
	@echo "ATTENZIONE: cancella tutti i dati dello schema euonqol su $(DB_HOST)/$(DB_NAME)."
	@printf "Scrivi 'reset' per confermare: "; \
	read ans; [ "$$ans" = "reset" ] || { echo "Annullato."; exit 1; }
	docker run --rm --network $(PROJECT)-network $(PSQL_SSL) -e PGPASSWORD='$(DB_PASSWORD)' \
	  postgres:$(PG_VERSION) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) \
	  -c "DROP SCHEMA IF EXISTS euonqol CASCADE;"
	docker run --rm -i --network $(PROJECT)-network $(PSQL_SSL) -e PGPASSWORD='$(DB_PASSWORD)' \
	  postgres:$(PG_VERSION) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) \
	  -v keycloak_schema=$(KC_SCHEMA) -f - < ./setup/db/init.sql

# --- utilita' ---------------------------------------------------------------

shell: guard ## Shell dentro un servizio (S=backend)
	$(COMPOSE) exec $(or $(S),backend) sh
