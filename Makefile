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
  DOWNV_WARN := Il database su $(DB_HOST) NON viene toccato: spariscono solo i volumi locali (node_modules, upload).
else
  DB_HOST  := postgres
  export DB_HOST
  # I profili vanno passati come flag, non via COMPOSE_PROFILES: un --profile
  # sulla riga di comando SOSTITUISCE quella variabile invece di sommarsi,
  # quindi `make init` (che aggiunge --profile init) perderebbe `localdb` e
  # lascerebbe lo stack senza database.
  PROFILES := --profile localdb
  # Il postgres in container non espone TLS, e sotto `uselibpqcompat=true` il
  # driver `pg` con sslmode=prefer non ricade su plaintext: fallirebbe con
  # "The server does not support SSL connections".
  export DB_SSLMODE := disable
  DOWNV_WARN := Il volume $(PROJECT)-postgres-data viene cancellato: si perdono TUTTI i dati del database.
endif

COMPOSE := docker compose -f docker-compose.$(ENV).yaml --env-file $(ENV_FILE) $(PROFILES)

.DEFAULT_GOAL := help
.PHONY: help guard init up up-build deploy down stop ps restart logs config \
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

init: guard ## Inizializzazione una tantum (realm Keycloak + schema DB)
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
# Si chiama tsx direttamente e non `npm run migrate`: quello passa
# --env-file=.env, che nell'immagine non esiste (escluso da .dockerignore),
# mentre le variabili arrivano gia' dal compose.
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

up: guard ## Migrazioni, backend, poi il resto in foreground
	$(start-backend)
	$(COMPOSE) up

up-build: guard ## Build e avvio del backend, poi build e avvio del frontend (se presente)
	$(COMPOSE) build backend
	$(start-backend)
	$(build-frontend)
	$(COMPOSE) up

deploy: guard ## Come up-build, in background (usato sulla VM)
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

# Le migrazioni girano DENTRO il container. Lanciando `npm run migrate` dalla
# propria macchina in backend/ si usa backend/.env, che punta a localhost:5432:
# nel container invece l'ambiente ha la precedenza su --env-file, quindi si
# colpisce il database configurato qui.
migrate: guard ## Applica le migrazioni SQL pendenti
	$(COMPOSE) exec backend npm run migrate

migrate-status: guard ## Elenca migrazioni applicate e pendenti
	$(COMPOSE) exec backend npm run migrate:status

migrate-baseline: guard ## Marca tutte le migrazioni come applicate
	$(COMPOSE) exec backend npm run migrate:baseline

seed: guard ## Popola i dati (ARGS=countries|groups|users|answers|static|cat|mappings)
	$(COMPOSE) exec backend npm run seed $(ARGS)

psql: guard ## Shell psql sul database attivo, in container o esterno
	docker run --rm -it --network $(PROJECT)-network \
	  -e PGPASSWORD='$(DB_PASSWORD)' \
	  postgres:15 psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME)

reset-db: guard ## DISTRUTTIVO: elimina lo schema euonqol e riesegue init.sql
	@echo "ATTENZIONE: cancella tutti i dati dello schema euonqol su $(DB_HOST)/$(DB_NAME)."
	@printf "Scrivi 'reset' per confermare: "; \
	read ans; [ "$$ans" = "reset" ] || { echo "Annullato."; exit 1; }
	docker run --rm --network $(PROJECT)-network -e PGPASSWORD='$(DB_PASSWORD)' \
	  postgres:15 psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) \
	  -c "DROP SCHEMA IF EXISTS euonqol CASCADE;"
	docker run --rm -i --network $(PROJECT)-network -e PGPASSWORD='$(DB_PASSWORD)' \
	  postgres:15 psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) \
	  -v keycloak_schema=$(KC_SCHEMA) -f - < ./setup/db/init.sql

# --- utilita' ---------------------------------------------------------------

shell: guard ## Shell dentro un servizio (S=backend)
	$(COMPOSE) exec $(or $(S),backend) sh
