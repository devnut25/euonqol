# CAT Settings - Guida Rapida

## 📁 Files Importanti

- **`data/cat-settings-config.json`**: Configurazione completa di tutti i CAT settings
- **`data/CAT_SETTINGS_GUIDE.md`**: Guida dettagliata sulla struttura delle configurazioni
- **`scripts/fetch-all-cat-settings.js`**: Script per scaricare automaticamente tutte le configurazioni dall'API CAT
- **`scripts/test-fetch-cat-setting.js`**: Script per testare/scaricare un singolo setting
- **`src/services/seed/importCatSettings.ts`**: Script di seeding per importare i settings nel database

## 🚀 Quick Start

### Opzione 1: Download Automatico (Raccomandato)

Scarica automaticamente tutte le configurazioni dall'API CAT:

```bash
cd backend
npm run fetch:cat-settings
```

Lo script:
1. Legge `cat-settings-config.json`
2. Identifica i settings con `api_configuration: null`
3. Scarica le configurazioni dall'API CAT per ciascuno
4. Crea un backup del file originale
5. Aggiorna `cat-settings-config.json` con le configurazioni complete

### Opzione 2: Copia Manuale dal Browser

1. Apri la piattaforma CAT: https://cat.eortc.org
2. Apri DevTools (F12) → Tab **Network**
3. Crea una sessione con il setting desiderato (es: `EUonQOL_CAT_setting_FA`)
4. Trova la richiesta a `/runner/createSession/EUonQOL_CAT_setting_FA`
5. Nella risposta JSON:
   ```json
   {
     "session": {
       "dimensionOrder": ["FA"],
       "progress": {
         "dimensions": [
           {
             "name": "FA",
             "setting": { ... }  // ← COPIA QUESTO OGGETTO
           }
         ]
       }
     }
   }
   ```
6. Copia l'oggetto completo e costruisci:
   ```json
   {
     "name": "EUonQOL_CAT_setting_FA",
     "dimensionOrder": ["FA"],
     "dimensions": {
       "FA": { ... }  // ← INCOLLA QUI
     }
   }
   ```
7. Incolla in `data/cat-settings-config.json` nel campo `api_configuration` del setting corrispondente

## 🧪 Test di un Singolo Setting

Per testare/scaricare un singolo setting:

```bash
cd backend
npm run test:cat-setting EUonQOL_CAT_setting_FA
```

Output: Stampa la configurazione completa che puoi copiare/incollare.

## 📥 Import nel Database

Dopo aver compilato `cat-settings-config.json`, importa nel database:

```bash
cd backend
npm run seed:cat-settings
```

### Output Atteso

```
⚙️  Importing CAT settings from JSON configuration...
📊 Found 16 CAT settings in configuration
✓ Validated 16 CAT settings
✅ CAT settings import completed successfully!
   - Created: 0
   - Updated: 16
   - Total: 16
   - With api_configuration: 16
   - Missing api_configuration: 0
```

### Se ci sono configurazioni mancanti

```
⚠️  5 settings have null api_configuration:
   - EUonQOL_CAT_setting_EF_D (id: 15)
   - EUonQOL_CAT_setting_FA_D (id: 17)
   ...
```

Devi completare manualmente o eseguire `npm run fetch:cat-settings`.

## 📋 Settings Disponibili

| ID | Nome | Descrizione |
|----|------|-------------|
| 14 | EUonQOL_CAT_setting_EF | Emotional Functioning |
| 15 | EUonQOL_CAT_setting_EF_D | Emotional Functioning (Detailed) |
| 16 | EUonQOL_CAT_setting_FA | Fatigue |
| 17 | EUonQOL_CAT_setting_FA_D | Fatigue (Detailed) |
| 18 | EUonQOL_CAT_setting_FI | Financial |
| 19 | EUonQOL_CAT_setting_PA | Pain |
| 20 | EUonQOL_CAT_setting_PA_D | Pain (Detailed) |
| 21 | EUonQOL_CAT_setting_PF_AC | Physical Functioning (Activity) |
| 22 | EUonQOL_CAT_setting_PF_B | Physical Functioning (Basic) |
| 23 | EUonQOL_CAT_setting_PF_D | Physical Functioning (Detailed) |
| 24 | EUonQOL_CAT_setting_RF | Role Functioning |
| 25 | EUonQOL_CAT_setting_RF_D | Role Functioning (Detailed) |
| 26 | EUonQOL_CAT_setting_SF | Social Functioning |
| 27 | EUonQOL_CAT_setting_SF_D | Social Functioning (Detailed) |
| 28 | EUonQOL_CAT_setting_SL | Sleep |
| 29 | EUonQOL_CAT_setting_SL_D | Sleep (Detailed) |

## 🔍 Verifica Configurazione

Controlla quante configurazioni sono complete:

```bash
cd backend
node -e "const data = require('./data/cat-settings-config.json'); const complete = data.settings.filter(s => s.api_configuration).length; console.log(\`Complete: \${complete}/\${data.settings.length}\`)"
```

## 💡 Pro Tips

1. **Backup automatico**: Lo script `fetch-all-cat-settings.js` crea automaticamente un backup prima di modificare il file
2. **Validazione JSON**: Gli script validano automaticamente la struttura JSON
3. **Incrementale**: Se alcuni setting sono già configurati, gli script li saltano
4. **Rate limiting**: Gli script includono delay (500ms) tra le chiamate API per evitare rate limiting

## ⚠️ Troubleshooting

### Error: "Setting not found on CAT API"
- Verifica che il `setting_key` in `cat-settings-config.json` corrisponda esattamente al nome nella piattaforma CAT
- Controlla che l'API key sia valida in `.env`: `CAT_API_KEY`

### Error: "Invalid JSON structure"
- Usa un JSON linter: https://jsonlint.com
- Verifica che tutte le parentesi siano chiuse correttamente

### Error: "Module 'xlsx' not found" (durante seeding)
- Installa le dipendenze: `npm install`

### Warning: "Missing api_configuration"
- Alcuni settings hanno ancora `api_configuration: null`
- Esegui `npm run fetch:cat-settings` per scaricarli automaticamente

## 📚 Documentazione Completa

Per dettagli sulla struttura dell'`api_configuration`, vedi:
- **Guida completa**: [`data/CAT_SETTINGS_GUIDE.md`](../data/CAT_SETTINGS_GUIDE.md)
- **API Docs**: [`docs/api.yaml`](../docs/api.yaml)
- **TypeScript Types**: [`src/services/cat/types.ts`](../src/services/cat/types.ts)

## 🔄 Workflow Completo

```bash
# 1. Scarica le configurazioni dall'API
npm run fetch:cat-settings

# 2. (Opzionale) Testa un singolo setting
npm run test:cat-setting EUonQOL_CAT_setting_FA

# 3. Verifica quante configurazioni sono complete
node -e "const data = require('./data/cat-settings-config.json'); console.log(\`Complete: \${data.settings.filter(s => s.api_configuration).length}/\${data.settings.length}\`)"

# 4. Importa nel database
npm run seed:cat-settings

# 5. Verifica nel database
docker exec euonqol-postgres psql -U euonqol_user -d euonqol -c "SELECT id, name, (api_configuration IS NOT NULL) as has_config FROM euonqol.cat_settings ORDER BY id;"
```

## ✅ Done!

Dopo aver completato questi passaggi, i CAT settings sono pronti per essere utilizzati dai moduli dinamici (CAT) del sistema EUonQol.
