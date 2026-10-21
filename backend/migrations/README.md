# Database Migrations

Questa cartella contiene le migrazioni SQL per il database EUonQol.

## Esecuzione Migrazione CAT Integration

### Prerequisiti
- PostgreSQL in esecuzione
- Database `euonqol` esistente
- Credenziali di accesso configurate

### Eseguire la Migrazione

**Opzione 1: Via psql (consigliato)**
```bash
# Da una shell/terminale
psql -U euonqol_user -d euonqol -f migrations/20260311_add_cat_integration.sql
```

**Opzione 2: Via pgAdmin**
1. Aprire pgAdmin
2. Connettersi al database `euonqol`
3. Tools → Query Tool
4. Aprire il file `20260311_add_cat_integration.sql`
5. Eseguire (F5)

**Opzione 3: Via Docker (se il DB è in Docker)**
```bash
# Copiare il file nel container
docker cp migrations/20260311_add_cat_integration.sql <container_name>:/tmp/migration.sql

# Eseguire nel container
docker exec -it <container_name> psql -U euonqol_user -d euonqol -f /tmp/migration.sql
```

**Opzione 4: Via DBeaver/DataGrip**
1. Aprire la connessione al database
2. Aprire il file SQL
3. Eseguire

### Verificare la Migrazione

Dopo l'esecuzione, verificare che le tabelle siano state modificate correttamente:

```sql
-- Verificare colonne aggiunte a cat_settings
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'euonqol' 
  AND table_name = 'cat_settings'
  AND column_name IN ('setting_key', 'api_configuration');

-- Verificare che cat_module_sessions esista
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'euonqol' 
  AND table_name = 'cat_module_sessions';

-- Verificare colonna scores in assignment
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'euonqol' 
  AND table_name = 'survey_questionnaire_patients_assignment'
  AND column_name = 'scores';
```

### Rollback

Se è necessario annullare le modifiche:

```bash
psql -U euonqol_user -d euonqol -f migrations/rollback_20260311_add_cat_integration.sql
```

## Generare il Prisma Client

Dopo aver eseguito la migrazione sul database, rigenerare il Prisma client:

```bash
cd backend
npx prisma generate --schema=prisma/app/schema.prisma
```

## Troubleshooting

### Error: EPERM durante `prisma generate`

Se riscontri `EPERM: operation not permitted` durante `prisma generate`:

1. Chiudi il server Node.js se è in esecuzione
2. Chiudi eventuali terminali che usano i file generati
3. Riprova: `npx prisma generate --schema=prisma/app/schema.prisma`

### Error: P1000 Authentication failed

Se Prisma non riesce a connettersi:

1. Verifica che PostgreSQL sia in esecuzione
2. Controlla le credenziali in `.env`:
   ```env
   APP_DATABASE_URL=postgresql://user:password@localhost:5432/euonqol?schema=euonqol
   ```
3. Testa la connessione: `psql -U euonqol_user -d euonqol`

### Migrazione manuale vs Prisma Migrate

Questo progetto usa migrazioni SQL manuali invece di `prisma migrate dev` perché:
- Maggiore controllo sulle modifiche al database
- Compatibilità con team/ambienti esistenti
- Possibilità di revisione dettagliata prima dell'applicazione

## Prossimi Passi dopo la Migrazione

1. ✅ Eseguire migrazione SQL
2. ✅ Generare Prisma client
3. ✅ Configurare API key in `.env`:
   ```env
   CAT_API_URL=https://cat.eortc.org/api
   CAT_API_KEY=your_actual_key_here
   ```
4. ✅ Riavviare il server backend
5. ✅ Testare gli endpoint CAT (vedi [NEXT_STEPS.md](../NEXT_STEPS.md))

## File di Migrazione

- `20260311_add_cat_integration.sql` - Migrazione principale
- `rollback_20260311_add_cat_integration.sql` - Rollback della migrazione
- Questo README

## Modifiche Database Applicate

### Tabella: `cat_settings`
- ➕ `setting_key` VARCHAR(120) - Chiave per CAT API esterno
- ➕ `api_configuration` JSONB - Configurazione aggiuntiva

### Tabella: `cat_module_sessions` (NUOVA)
Traccia lo stato di ogni sessione CAT per assignment+modulo:
- `id` - Primary key
- `assignment_id` - FK verso assignment
- `module_id` - FK verso modulo
- `session_token` - Token API esterno
- `session_data` - Stato completo sessione (JSON)
- `current_dimension_index` - Dimensione corrente
- `is_completed` - Flag completamento
- `created_at`, `updated_at` - Timestamp

**Constraint:**
- UNIQUE (assignment_id, module_id) - Una sessione per combinazione

### Tabella: `survey_questionnaire_patients_assignment`
- ➕ `scores` JSONB - Scores calcolati per tutti i moduli

## Struttura Scores JSON

Esempio del campo `scores` dopo il completamento:

```json
{
  "module_10": {
    "type": "dynamic",
    "module_name": "EORTC QLQ-C30",
    "cat_setting": "EORTC_QLQ_C30",
    "dimensions": [
      {
        "dimension": "Physical Functioning",
        "theta": 52.5,
        "se": 0.28,
        "items_administered": 8
      }
    ],
    "completed_at": "2024-03-05T14:30:00Z"
  },
  "module_11": {
    "type": "static",
    "module_name": "Demographics",
    "total_questions": 12,
    "items_answered": 12,
    "completion_percentage": 100,
    "completed_at": "2024-03-05T14:30:00Z"
  }
}
```
