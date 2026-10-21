# CAT Integration Migration Script
# Esegue la migrazione del database per l'integrazione CAT

param(
    [string]$Action = "migrate",  # migrate | rollback | verify
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$DbName = "euonqol",
    [string]$DbUser = "euonqol_user",
    [string]$DbPassword = ""
)

$ErrorActionPreference = "Stop"

# Colori per output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "=========================================="
Write-Info "  CAT Integration Migration"
Write-Info "=========================================="
Write-Info ""

# Verifica che psql sia installato
try {
    $psqlVersion = & psql --version 2>&1
    Write-Success "✓ PostgreSQL client trovato: $psqlVersion"
} catch {
    Write-Error "✗ psql non trovato. Installa PostgreSQL client."
    exit 1
}

# Costruisci connection string
$env:PGPASSWORD = $DbPassword
$connectionArgs = @(
    "-h", $DbHost,
    "-p", $DbPort,
    "-U", $DbUser,
    "-d", $DbName
)

# Test connessione
Write-Info "Verifica connessione al database..."
try {
    $testQuery = "SELECT version();"
    $testResult = & psql @connectionArgs -c $testQuery -t 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✓ Connessione riuscita"
    } else {
        throw "Connessione fallita"
    }
} catch {
    Write-Error "✗ Impossibile connettersi al database:"
    Write-Error $testResult
    Write-Error ""
    Write-Info "Verifica i parametri:"
    Write-Info "  Host: $DbHost"
    Write-Info "  Port: $DbPort"
    Write-Info "  Database: $DbName"
    Write-Info "  User: $DbUser"
    exit 1
}

switch ($Action.ToLower()) {
    "migrate" {
        Write-Info ""
        Write-Info "Esecuzione migrazione CAT integration..."
        Write-Warning "Questa operazione modificherà il database."
        $confirm = Read-Host "Continuare? (s/n)"

        if ($confirm -ne "s" -and $confirm -ne "S") {
            Write-Info "Operazione annullata."
            exit 0
        }

        $migrationFile = Join-Path $PSScriptRoot "20260311_add_cat_integration.sql"

        if (-not (Test-Path $migrationFile)) {
            Write-Error "✗ File di migrazione non trovato: $migrationFile"
            exit 1
        }

        Write-Info "Esecuzione: $migrationFile"
        & psql @connectionArgs -f $migrationFile

        if ($LASTEXITCODE -eq 0) {
            Write-Success ""
            Write-Success "✓ Migrazione completata con successo!"
            Write-Info ""
            Write-Info "Prossimi passi:"
            Write-Info "  1. Esegui: npx prisma generate --schema=prisma/app/schema.prisma"
            Write-Info "  2. Configura CAT_API_KEY in .env"
            Write-Info "  3. Riavvia il server backend"
        } else {
            Write-Error "✗ Errore durante la migrazione"
            exit 1
        }
    }

    "rollback" {
        Write-Info ""
        Write-Warning "Rollback della migrazione CAT integration..."
        Write-Warning "Questa operazione rimuoverà tutte le modifiche CAT dal database!"
        $confirm = Read-Host "Sei sicuro? (s/n)"

        if ($confirm -ne "s" -and $confirm -ne "S") {
            Write-Info "Operazione annullata."
            exit 0
        }

        $rollbackFile = Join-Path $PSScriptRoot "rollback_20260311_add_cat_integration.sql"

        if (-not (Test-Path $rollbackFile)) {
            Write-Error "✗ File di rollback non trovato: $rollbackFile"
            exit 1
        }

        Write-Info "Esecuzione: $rollbackFile"
        & psql @connectionArgs -f $rollbackFile

        if ($LASTEXITCODE -eq 0) {
            Write-Success ""
            Write-Success "✓ Rollback completato con successo!"
        } else {
            Write-Error "✗ Errore durante il rollback"
            exit 1
        }
    }

    "verify" {
        Write-Info ""
        Write-Info "Verifica stato migrazione..."

        $verifyQuery = @"
DO `$`$
DECLARE
    setting_key_exists BOOLEAN;
    api_config_exists BOOLEAN;
    cat_sessions_exists BOOLEAN;
    scores_exists BOOLEAN;
BEGIN
    -- Verifica colonne cat_settings
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'euonqol'
        AND table_name = 'cat_settings'
        AND column_name = 'setting_key'
    ) INTO setting_key_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'euonqol'
        AND table_name = 'cat_settings'
        AND column_name = 'api_configuration'
    ) INTO api_config_exists;

    -- Verifica tabella cat_module_sessions
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'euonqol'
        AND table_name = 'cat_module_sessions'
    ) INTO cat_sessions_exists;

    -- Verifica colonna scores
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'euonqol'
        AND table_name = 'survey_questionnaire_patients_assignment'
        AND column_name = 'scores'
    ) INTO scores_exists;

    -- Output risultati
    RAISE NOTICE '';
    RAISE NOTICE '=== Stato Migrazione CAT ===';
    RAISE NOTICE '';
    RAISE NOTICE 'cat_settings.setting_key: %', CASE WHEN setting_key_exists THEN '✓ Presente' ELSE '✗ Mancante' END;
    RAISE NOTICE 'cat_settings.api_configuration: %', CASE WHEN api_config_exists THEN '✓ Presente' ELSE '✗ Mancante' END;
    RAISE NOTICE 'cat_module_sessions (tabella): %', CASE WHEN cat_sessions_exists THEN '✓ Presente' ELSE '✗ Mancante' END;
    RAISE NOTICE 'assignment.scores: %', CASE WHEN scores_exists THEN '✓ Presente' ELSE '✗ Mancante' END;
    RAISE NOTICE '';

    IF setting_key_exists AND api_config_exists AND cat_sessions_exists AND scores_exists THEN
        RAISE NOTICE 'Stato: ✓ Migrazione completata';
    ELSE
        RAISE NOTICE 'Stato: ✗ Migrazione non completata o parziale';
    END IF;
END `$`$;
"@

        & psql @connectionArgs -c $verifyQuery

        if ($LASTEXITCODE -eq 0) {
            Write-Info ""
            Write-Success "✓ Verifica completata"
        }
    }

    default {
        Write-Error "Azione non valida: $Action"
        Write-Info ""
        Write-Info "Uso:"
        Write-Info "  .\run-migration.ps1 -Action migrate   # Esegui migrazione"
        Write-Info "  .\run-migration.ps1 -Action rollback  # Annulla migrazione"
        Write-Info "  .\run-migration.ps1 -Action verify    # Verifica stato"
        Write-Info ""
        Write-Info "Parametri opzionali:"
        Write-Info "  -DbHost (default: localhost)"
        Write-Info "  -DbPort (default: 5432)"
        Write-Info "  -DbName (default: euonqol)"
        Write-Info "  -DbUser (default: euonqol_user)"
        Write-Info "  -DbPassword (default: vuoto)"
        exit 1
    }
}

# Pulisci password dall'ambiente
$env:PGPASSWORD = ""
