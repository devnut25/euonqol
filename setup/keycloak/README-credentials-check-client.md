# Client Keycloak `euonqol-credentials-check`

Procedura per introdurre il client dedicato alla verifica delle credenziali su un ambiente già installato (staging, prod).

## Perché

La colonna **Ultimo accesso** (`last_access`) della tabella Users è calcolata in `UserService.getList` (`backend/src/services/UserService.ts`) come l'evento `LOGIN` più recente dell'utente nella tabella Keycloak `event_entity`.

Il login dell'applicazione avviene in due passi:

1. `POST /auth/login` → `verifyUserCredentials` (`backend/src/helpers/keycloak.ts`) chiede un token a Keycloak con `grant_type=password` per controllare email e password, poi chiude subito la sessione. Infine invia l'OTP.
2. `POST /otp/verify-otp` → `loginUserWithKeycloak` esegue il login vero, solo con l'OTP valido.

Keycloak registra un evento `LOGIN` **in entrambi i passi**. Prima di questa modifica i due passi usavano lo stesso client (`euonqol-frontend`), quindi gli eventi non erano distinguibili. Di conseguenza `last_access` si aggiornava anche quando:

- l'OTP non veniva mai inserito, oppure era errato;
- l'utente era disattivato (`is_active=false`), perché quel controllo avviene dopo la verifica delle credenziali.

Le password errate non c'entrano: generano `LOGIN_ERROR`, che era già escluso.

## Soluzione

- Il passo 1 usa un client dedicato, `euonqol-credentials-check`: è pubblico, ha solo i direct access grants e nessun redirect.
- `UserService.getList` conta solo gli eventi `LOGIN` con `client_id = euonqol-frontend`, cioè i login completati dopo l'OTP.

## Cosa cambia

| File | Modifica |
|------|----------|
| `setup/keycloak/init-keycloak.sh` | Nuova funzione `ensure_credentials_check_client`, idempotente: viene chiamata sia su un realm nuovo sia su un realm esistente |
| `backend/src/helpers/keycloak.ts` | `verifyUserCredentials` usa `CREDENTIALS_CHECK_CLIENT_ID` (token + logout). `FRONTEND_CLIENT_ID` è esportato |
| `backend/src/services/UserService.ts` | Filtro `client_id: FRONTEND_CLIENT_ID` sugli eventi `LOGIN` |
| `backend/src/models/User.ts` | Commento su `last_access` |
| `docker-compose.{dev,test,staging,prod}.yaml` | Nuove variabili d'ambiente (vedi sotto) |

Nuove variabili d'ambiente, nel root env file (`.env.dev`, `.env.staging`, `.env.prod`; template `.env.example`):

| Variabile env file | Default | Passata a |
|--------------------|---------|-----------|
| `KEYCLOAK_CLIENT_CREDENTIALS_CHECK_ID` | `euonqol-credentials-check` | `keycloak-setup` come `CREDENTIALS_CHECK_CLIENT_ID`, `backend` come `KEYCLOAK_CLIENT_CREDENTIALS_CHECK_ID` |
| `KEYCLOAK_CLIENT_FRONTEND_ID` | `euonqol-frontend` | `keycloak-setup` come `FRONTEND_CLIENT_ID`, `backend` come `KEYCLOAK_CLIENT_FRONTEND_ID` (filtro `last_access`) |

Ogni client id è definito una volta sola: setup e backend ricevono sempre lo stesso valore. Se la variabile manca o è vuota vale il default. Nei passi sotto, se hai impostato un valore diverso, sostituiscilo a `euonqol-credentials-check`.

Entrambe hanno lo stesso valore di default nel codice, quindi funziona anche se mancano.

## Procedura su un ambiente esistente

> **Ordine obbligatorio:** prima va creato il client, poi va fatto il deploy del backend. Se gira un backend nuovo senza il client su Keycloak, **nessuno riesce a fare login**.

L'esempio usa staging. Per prod sostituisci `staging` con `prod`.

### 0. In locale: commit e push

Le modifiche devono stare sul branch che la VM traccia (via PR se la VM segue `develop`/`master`). Altrimenti `git pull` non porta nulla.

### 1. Sulla VM: aggiorna il codice

```bash
git pull
```

### 2. Sulla VM: crea il client Keycloak

Avvia **solo** `keycloak-setup`. Non usare `make init`, che avvia anche `db-init`.

Keycloak deve essere già in esecuzione. Siccome il realm `euonqol` esiste già, lo script:

1. riapplica la configurazione degli eventi (identica a quella attuale);
2. crea `euonqol-credentials-check` solo se manca;
3. esce senza toccare realm, utenti, client esistenti e secret.

Controlla `DB_MODE` in `.env.staging`.

Se `DB_MODE=external`:

```bash
docker compose -f docker-compose.staging.yaml --env-file .env.staging --profile init up keycloak-setup
```

Se `DB_MODE=local` (o se non è definito), aggiungi `--profile localdb`, come fa il Makefile:

```bash
docker compose -f docker-compose.staging.yaml --env-file .env.staging --profile localdb --profile init up keycloak-setup
```

Nel log deve comparire:

```
✓ Credentials-check client created: euonqol-credentials-check
```

Se compare `✓ Credentials-check client already present`, il client c'era già: va bene lo stesso.

### 3. Sulla VM: deploy

```bash
make deploy ENV=staging
```

`ENV=staging` è obbligatorio: il default del Makefile è `ENV ?= dev`, che userebbe `docker-compose.dev.yaml` e `.env.dev`.

`deploy` esegue in ordine: build del backend, avvio del backend (con le migrazioni), build del frontend, `up -d`. Il backend viene ricreato con la nuova variabile d'ambiente.

## Alternativa manuale (admin console)

Se non puoi lanciare `keycloak-setup`: admin console → realm `euonqol` → **Clients** → **Create client**:

- Client type: `OpenID Connect`
- Client ID: `euonqol-credentials-check`
- Client authentication: **Off** (client pubblico)
- Standard flow: **Off**
- Direct access grants: **On**
- Implicit flow: **Off**
- Redirect URI: nessuno

Poi continua dal passo 3.

## Verifica

1. Admin console, realm `euonqol` → Clients: è presente `euonqol-credentials-check`.
2. Login con credenziali corrette **senza** inserire l'OTP: in Users il `last_access` dell'utente non cambia. In `event_entity` compare un `LOGIN` con `client_id = euonqol-credentials-check`.
3. Login completo con l'OTP: `last_access` si aggiorna. In `event_entity` compare un `LOGIN` con `client_id = euonqol-frontend`.
4. L'ordinamento della colonna Ultimo accesso funziona ancora.

Query di controllo sugli eventi (schema Keycloak, di default `public`):

```sql
SELECT client_id, type, to_timestamp(event_time / 1000) AS at, user_id
FROM event_entity
WHERE type IN ('LOGIN', 'LOGIN_ERROR')
ORDER BY event_time DESC
LIMIT 20;
```

## Troubleshooting

- **Il login fallisce al primo passo con "Invalid credentials" per tutti gli utenti dopo il deploy:** quasi certamente il client non esiste. Nei log del backend compare `❌ Keycloak credential verification error` con `unauthorized_client` o `Invalid client`. Rilancia il passo 2: è idempotente.
- **`keycloak-setup` resta in attesa:** Keycloak non è raggiungibile. Controlla con `make logs S=keycloak ENV=staging`.

## Dati storici

Gli eventi registrati prima del deploy restano associati a `euonqol-frontend`, quindi anche le vecchie verifiche delle credenziali contano ancora come accesso. Per questo il `last_access` di un utente può restare impreciso finché quell'utente non fa un nuovo login completo, oppure finché gli eventi non scadono (`eventsExpiration` = 90 giorni). Non è prevista una pulizia retroattiva.
