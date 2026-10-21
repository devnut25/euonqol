# CAT Settings Configuration Guide

## Overview

Il file `cat-settings-config.json` contiene le configurazioni complete per tutti i CAT settings utilizzati nel sistema EUonQol. Questo file viene utilizzato dallo script di seeding per popolare la tabella `cat_settings` nel database.

## Struttura del File

```json
{
  "settings": [
    {
      "id": 14,
      "name": "EUonQOL_CAT_setting_EF",
      "description": "CAT setting for Emotional Functioning",
      "setting_key": "EUonQOL_CAT_setting_EF",
      "api_configuration": { ... }
    }
  ]
}
```

## Come Popolare le Configurazioni

### Metodo 1: Copia dai Browser DevTools (Consigliato)

1. Apri la piattaforma CAT nel browser
2. Apri DevTools (F12)
3. Vai alla tab **Network**
4. Crea una sessione CAT con il setting desiderato
5. Trova la richiesta a `/runner/createSession/{settingKey}`
6. Nella risposta, copia l'oggetto `session.progress.dimensions[0].setting`
7. Incolla nel campo `api_configuration` del setting corrispondente

### Metodo 2: Chiamata API Diretta

Usa questo script Node.js per recuperare automaticamente un setting:

```javascript
// fetch-cat-setting.js
const axios = require('axios');

const CAT_API_URL = 'https://cat.eortc.org/api';
const CAT_API_KEY = '3c76147c-7bc1-48d3-a054-f2fb8eb635d3';
const SETTING_KEY = 'EUonQOL_CAT_setting_FA'; // Cambia questo

axios.get(`${CAT_API_URL}/runner/createSession/${SETTING_KEY}`, {
  headers: { 'api-key': CAT_API_KEY }
})
.then(response => {
  const session = response.data.session || response.data;
  const setting = {
    name: SETTING_KEY,
    dimensionOrder: session.dimensionOrder,
    dimensions: {}
  };
  
  // Estrai la configurazione da ogni dimensione
  session.progress.dimensions.forEach(dim => {
    setting.dimensions[dim.name] = dim.setting;
  });
  
  console.log(JSON.stringify(setting, null, 2));
})
.catch(error => {
  console.error('Error:', error.response?.data || error.message);
});
```

Esegui con:
```bash
node fetch-cat-setting.js > output.json
```

### Metodo 3: Script Automatizzato per Tutti i Setting

Creo uno script che scarica automaticamente tutte le configurazioni:

```bash
cd backend
node scripts/fetch-all-cat-settings.js
```

## Struttura api_configuration

Ogni `api_configuration` deve contenere:

```typescript
{
  "name": "EUonQOL_CAT_setting_FA",
  "dimensionOrder": ["FA"],  // Array di dimensioni da presentare
  "dimensions": {
    "FA": {  // Nome della dimensione
      // REQUIRED
      "itemsTable": "QLQ-CAT",              // Tabella degli item CAT
      "estimationMethod": "Eap",            // Metodo di stima (Eap, Map, etc)
      "itemSelectionMethod": "MaxInformation", // Selezione item
      "informationEstimationMethod": "Fisher", // Stima informazione
      
      // ARRAYS
      "startItems": ["FA17"],               // Item iniziali obbligatori
      "requiredItems": [],                  // Item sempre richiesti
      
      // STOP CRITERIA (oggetti con enable + value)
      "mininumNumberOfAnsweredItemsCriterion": {
        "enable": true,
        "value": 6
      },
      "maximumNumberOfAskedItemsCriterion": {
        "enable": true,
        "value": 6
      },
      "minimumNextItemInformation": {
        "enable": false,
        "value": 0
      },
      "minimumInformationCriterion": {
        "enable": false,
        "value": 0
      },
      "irtScoreCut": {
        "enable": false,
        "confidenceInterval": 0,
        "criterion": 0
      },
      "irtScoreMaxDifference": {
        "enable": false,
        "numberOfIrtScoresToCompare": 0,
        "criterion": 0
      },
      
      // BOUNDARIES
      "upperBoundery": {
        "enable": false,
        "firstItemAnswers": 0,
        "enableScore": false,
        "useSubcategories": false
      },
      "lowerBoundery": {
        "enable": false,
        "firstItemAnswers": 0,
        "enableScore": false,
        "useSubcategories": false
      },
      
      // OPTIONAL
      "useSubcategories": false,
      "minUsedItemsInSubcategories": 0,
      "maxWeightedInformationItemSelectorConfidenceInterval": 0,
      "lowestPointOfInterestIrtScore": {
        "enable": false,
        "value": 0
      },
      "highestPointOfInterestIrtScore": {
        "enable": false,
        "value": 0
      }
    }
  }
}
```

## Validazione

Dopo aver popolato `cat-settings-config.json`, puoi validare il JSON:

```bash
# Verifica che il JSON sia valido
cd backend
node -e "console.log(JSON.parse(require('fs').readFileSync('data/cat-settings-config.json', 'utf8')).settings.length + ' settings found')"
```

## Esecuzione del Seeding

Una volta compilate tutte le configurazioni:

```bash
cd backend
npm run seed:cat-settings
```

Lo script mostrerà:
- Quanti setting sono stati importati
- Quanti hanno `api_configuration` completa
- Quanti hanno `api_configuration` null (da completare)

## Note Importanti

1. **setting_key**: Deve corrispondere esattamente al nome nella piattaforma CAT
2. **dimensionOrder**: L'ordine in cui le dimensioni vengono presentate (solitamente una sola dimensione per setting EUonQol)
3. **itemsTable**: Sempre "QLQ-CAT" per i questionari EUonQol
4. **Stop Criteria**: Definiscono quando fermare il CAT (es: dopo 6 domande)

## Esempio Completo

Vedi il setting con `id: 14` (EUonQOL_CAT_setting_EF) in `cat-settings-config.json` per un esempio funzionante completo.

## Troubleshooting

### "Missing api_configuration" durante il seeding
- Alcuni setting hanno `api_configuration: null` - devono essere compilati manualmente

### "Invalid JSON structure"
- Verifica la sintassi JSON con un linter online (jsonlint.com)
- Assicurati che tutte le parentesi siano chiuse correttamente

### "Setting not found on CAT API"
- Verifica che `setting_key` corrisponda esattamente al nome nella piattaforma CAT
- Controlla che l'API key sia valida

## Riferimenti

- **API Documentation**: `backend/docs/api.yaml`
- **TypeScript Types**: `backend/src/services/cat/types.ts`
- **Seeding Script**: `backend/src/services/seed/importCatSettings.ts`
