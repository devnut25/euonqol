# Verifica connessioni PostgreSQL sulla VM Azure

Guida per misurare l'uso delle connessioni al database su una VM (prima staging,
poi prod), scegliere i limiti dei pool e applicarli senza perdere i segreti.

Contesto: l'errore `FATAL: sorry, too many clients already` (codice `53300`) si
verifica quando PostgreSQL esaurisce `max_connections`. Le connessioni sono
condivise tra il backend e Keycloak, quindi ogni pool ha un limite esplicito:

| Chiave nell'env file | Default | Chi la usa |
|---|---|---|
| `DB_CONNECTION_LIMIT` | 10 | Prisma, client dell'app (quasi tutto il backend) |
| `KEYCLOAK_DB_CONNECTION_LIMIT` | 5 | Prisma, client Keycloak (letture sugli utenti) |
| `DB_POOL_MAX` | 10 | Pool `pg` del backend (solo OTP e login) |
| `KC_DB_POOL_MAX_SIZE` | 20 | Keycloak (pool JDBC) |

Tutti i comandi si lanciano sulla VM, dalla root del progetto. In ogni fase
`ENV` vale `staging` oppure `prod`.

---

## Fase A: fotografia dello stato attuale (PRIMA del `git pull`)

Questa fase va fatta con il codice ancora vecchio: i compose attuali contengono
i segreti che servono nella fase C.

### A1. Entrare nel progetto

```bash
ssh azureuserEuonquol@<ip-azure>
cd /home/azureuserEuonquol/prj/euonqol/1024-euonqol-kit
ENV=staging        # poi ENV=prod sulla macchina di produzione
git log -1 --oneline
make ps ENV=$ENV
```

Per comodita' si salva il nome del progetto (prefisso dei container):

```bash
PROJECT=$(grep -E '^COMPOSE_PROJECT_NAME=' .env.$ENV | tail -1 | cut -d= -f2- | tr -d '\r')
echo $PROJECT
```

### A2. Dove gira il database

```bash
grep -E '^(DB_MODE|DB_HOST|DB_PORT|DB_SSLMODE)=' .env.$ENV
```

- `DB_MODE=local` (o assente): PostgreSQL gira nel container `$PROJECT-postgres`.
- `DB_MODE=external`: PostgreSQL e' esterno, tipicamente Azure Database for
  PostgreSQL, all'indirizzo `DB_HOST`.

### A3. Salvare i segreti oggi scritti nei compose

```bash
grep -nE 'ENCRYPTION_KEY|CLIENT_SECRET|REALM_ID' docker-compose.$ENV.yaml
```

Annotare i tre valori (`ENCRYPTION_KEY`, client secret, realm id) in un posto
sicuro, **non** in chat o ticket. Nella fase C vanno copiati identici
nell'env file:

- `ENCRYPTION_KEY` cifra i segreti salvati in `app_settings`: se cambia, la
  chiave CAT e la password SMTP diventano illeggibili.
- Il client secret deve coincidere con quello configurato sul client
  `euonqol-backend` in Keycloak.
- Il realm id deve coincidere con l'id del realm gia' esistente.

### A4. Limiti del server

Aprire psql sul database attivo (funziona sia con DB locale sia esterno):

```bash
make psql ENV=$ENV
```

Dentro psql:

```sql
SHOW max_connections;
SHOW superuser_reserved_connections;
```

Annotare i valori. Su Azure Database for PostgreSQL (Flexible Server) il limite
dipende dallo SKU e alcune connessioni sono riservate ai processi interni di
Azure: lo stesso valore si vede dal portale, in *Server parameters* →
`max_connections`.

### A5. Connessioni in uso adesso

Sempre dentro psql. Totale rispetto al massimo:

```sql
SELECT count(*) AS usate,
       current_setting('max_connections')::int AS massimo
FROM pg_stat_activity;
```

Dettaglio per provenienza:

```sql
SELECT usename, application_name, client_addr, state, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1, 2, 3, 4
ORDER BY 5 DESC;
```

Come leggerlo:

- `application_name = 'PostgreSQL JDBC Driver'`: Keycloak.
- `application_name` vuoto: backend (Prisma e pool `pg`).
- `psql`: la sessione appena aperta.
- Molte righe `idle` dal backend sono il sintomo del problema: con il codice
  vecchio ogni modulo apriva un proprio pool.

Per seguire l'andamento nel tempo, meglio in un orario di carico, rilanciare la
query del totale e poi:

```sql
\watch 10
```

(Ctrl+C per fermare, `\q` per uscire da psql.)

Solo con `DB_MODE=local`, per associare `client_addr` ai container, da un
altro terminale sulla VM:

```bash
docker inspect -f '{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)
```

### A6. Pool attuale di Keycloak

```bash
docker exec $PROJECT-keycloak env | grep KC_DB_POOL
```

Nessun output significa default di Keycloak: fino a 100 connessioni, cioe'
potenzialmente tutto il database.

### A7. Errori gia' avvenuti

```bash
docker logs $PROJECT-backend 2>&1 | grep -ci "too many clients"
docker logs $PROJECT-backend 2>&1 | grep -i "too many clients" | tail -5
```

### A8. Rate limit e IP reale dei client

Il backend limita le richieste API per IP (default 300 ogni 15 minuti in
production). L'IP e' quello che vede Express, e dipende da `TRUST_PROXY`:

- `false` con nginx davanti: tutti gli utenti hanno l'IP del container nginx e
  condividono **un unico contatore** per tutta l'applicazione;
- `true`: ogni rete ha il suo contatore (pazienti dietro lo stesso NAT, ad
  esempio il Wi-Fi di un ospedale, lo condividono).

```bash
grep -E '^(TRUST_PROXY|NODE_ENV|API_RATE_LIMIT)=' .env.$ENV
```

Prova pratica, da due reti diverse (es. Wi-Fi e 4G), ripetendo il comando un
paio di volte su ciascuna:

```bash
curl -sI https://<dominio>/euonqol-api/public/ui-translations | grep -i '^ratelimit'
```

- `RateLimit-Limit`: limite attivo.
- `RateLimit-Remaining`: se scende in modo condiviso tra le due reti, il
  contatore e' unico per tutti.

Verificare anche se davanti alla VM c'e' un altro proxy HTTP (Azure
Application Gateway, Front Door, Cloudflare): in quel caso nginx vede l'IP del
proxy e `TRUST_PROXY=true` da solo non basta. Un Azure Load Balancer di rete
non cambia l'IP e non conta.

---

## Fase B: scelta dei valori

Regola: la somma dei pool deve restare sotto il 70% circa delle connessioni
disponibili, per lasciare spazio a migrazioni, `psql` e manutenzione.

```
DB_CONNECTION_LIMIT + KEYCLOAK_DB_CONNECTION_LIMIT + DB_POOL_MAX + KC_DB_POOL_MAX_SIZE
    <= 0.7 x (max_connections - superuser_reserved_connections)
```

| `max_connections` misurato | `DB_CONNECTION_LIMIT` | `KEYCLOAK_DB_CONNECTION_LIMIT` | `DB_POOL_MAX` | `KC_DB_POOL_MAX_SIZE` | Totale |
|---|---|---|---|---|---|
| 100 (default PostgreSQL) | 10 | 5 | 5 | 20 | 40 |
| 50 (SKU Azure piccoli) | 8 | 3 | 3 | 10 | 24 |

Note:

- Se in A5 il backend arriva spesso vicino al limite, il primo valore da
  alzare e' `DB_CONNECTION_LIMIT` (15-20), non `DB_POOL_MAX`: il pool `pg`
  serve solo a login e OTP.
- `KC_DB_POOL_MAX_SIZE` a 20 e' ampio per il traffico di login di questo
  progetto; scendere a 10 se il database e' piccolo.

Valori scelti:

| | staging | prod |
|---|---|---|
| `max_connections` | | |
| `superuser_reserved_connections` | | |
| picco misurato in A5 | | |
| `DB_CONNECTION_LIMIT` | | |
| `KEYCLOAK_DB_CONNECTION_LIMIT` | | |
| `DB_POOL_MAX` | | |
| `KC_DB_POOL_MAX_SIZE` | | |
| `TRUST_PROXY` | | |
| `API_RATE_LIMIT` | | |

### Dimensionamento del rate limit

Richieste per paziente, questionario da 100 domande:

| Voce | Richieste |
|---|---|
| Apertura e preliminari (link, lingue, testi, presentazione, eligibility, privacy, start, complete) | ~12 |
| Domanda statica (`PUT /responses`) | 1 per domanda |
| Domanda CAT (`next-question` + `PUT /responses`) | ~2 per domanda |
| Navigazione indietro e ritentativi | +20% |

Totale: ~135 richieste con sole domande statiche, ~250 con sole domande CAT.
Un paziente veloce le esaurisce in 10-15 minuti, cioe' in una sola finestra.

```
API_RATE_LIMIT >= pazienti contemporanei dalla stessa rete x 250
```

| Pazienti contemporanei sullo stesso IP | `API_RATE_LIMIT` minimo |
|---|---|
| 1 (da casa) | 300 (default, al limite) |
| 4 | 1000 |
| 10 (tablet in sala d'attesa) | 3000 |
| 20 (stesso ospedale) | 5000 |

Valore consigliato: `API_RATE_LIMIT=5000` con `TRUST_PROXY=true`. La
protezione dagli abusi resta su nginx (10 richieste/s per IP, circa 9000 in 15
minuti). Oltre ~40 pazienti contemporanei dalla stessa rete va alzato anche
`limit_req zone=api` in `frontend-shadcn/docker/nginx.conf`.

---

## Fase C: aggiornare l'env file e fare il deploy

### C1. Aggiungere le chiavi a `.env.$ENV`

```bash
nano .env.$ENV
```

Blocco da aggiungere (ogni chiave una sola volta: il Makefile si ferma se trova
duplicati):

```dotenv
# Segreti: valori annotati in A3, NON rigenerarli
ENCRYPTION_KEY=<valore da A3>
KEYCLOAK_CLIENT_SECRET=<valore da A3>
KEYCLOAK_REALM_ID=<valore da A3>

# URL pubblico del frontend, usato nei link delle mail. Obbligatorio.
FRONTEND_URL=https://<dominio reale>

# Limiti connessioni (fase B)
DB_CONNECTION_LIMIT=10
KEYCLOAK_DB_CONNECTION_LIMIT=5
DB_POOL_MAX=5
KC_DB_POOL_MAX_SIZE=20

# Rate limit (A8 e fase B)
TRUST_PROXY=true
API_RATE_LIMIT=5000
```

Controllare anche che `DB_PASSWORD` sia presente e valorizzata: prima, se
mancava, i compose usavano in silenzio `euonqol_password`.

```bash
grep -cE '^DB_PASSWORD=.+' .env.$ENV    # deve stampare 1
```

### C2. Aggiornare il codice e validare

```bash
git pull
make config ENV=$ENV > /dev/null && echo "compose OK"
```

Se manca una chiave obbligatoria il comando fallisce con
`required variable X is missing a value`: aggiungerla e ripetere.

### C3. Deploy

```bash
make deploy ENV=$ENV
make ps ENV=$ENV
```

---

## Fase D: verifica dopo il deploy

### D1. Applicazione

- Login completo con OTP.
- La mail ricevuta (OTP, reset password, questionario) deve avere link al
  dominio reale e non a `localhost`: conferma di `FRONTEND_URL`.

### D2. Variabili effettive nei container

```bash
docker exec $PROJECT-backend printenv | grep -E 'connection_limit|DB_POOL_MAX' | sed 's#//[^@]*@#//***@#'
docker exec $PROJECT-keycloak printenv KC_DB_POOL_MAX_SIZE
docker exec $PROJECT-backend printenv TRUST_PROXY API_RATE_LIMIT
curl -sI https://<dominio>/euonqol-api/public/ui-translations | grep -i '^ratelimit-limit'   # atteso 5000
```

### D3. Connessioni

Ripetere le query di A5 (`make psql ENV=$ENV`). Atteso:

- backend (`application_name` vuoto) al massimo
  `DB_CONNECTION_LIMIT + KEYCLOAK_DB_CONNECTION_LIMIT + DB_POOL_MAX`;
- Keycloak (`PostgreSQL JDBC Driver`) al massimo `KC_DB_POOL_MAX_SIZE`;
- totale ben sotto `max_connections`.

### D4. Nessun nuovo errore

Dopo qualche ora di utilizzo:

```bash
docker logs --since 6h $PROJECT-backend 2>&1 | grep -ci "too many clients"   # atteso 0
```

---

## Fase E: produzione

Ripetere le fasi A-D sulla macchina di produzione con `ENV=prod`.

In prod fare particolare attenzione a `FRONTEND_URL`: prima il compose di
produzione non la passava affatto e le mail contenevano link a
`http://localhost:5173`. Verificare in D1 il link di una mail reale.

---

## Checklist

| Passo | staging | prod |
|---|---|---|
| A3 segreti annotati | [ ] | [ ] |
| A4 `max_connections` annotato | [ ] | [ ] |
| A5 uso attuale misurato | [ ] | [ ] |
| B valori scelti | [ ] | [ ] |
| C1 env file aggiornato | [ ] | [ ] |
| C2 `make config` OK | [ ] | [ ] |
| C3 deploy | [ ] | [ ] |
| D1 login e link mail OK | [ ] | [ ] |
| D3 connessioni nei limiti | [ ] | [ ] |
| D4 nessun "too many clients" | [ ] | [ ] |
| A8/D2 `TRUST_PROXY` e rate limit verificati | [ ] | [ ] |
