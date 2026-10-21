# CAT (Computer Adaptive Testing) Integration

## Overview
This document describes the integration of the EORTC CAT API (https://cat.eortc.org/api) into the EUonQol questionnaire system. The integration enables adaptive questionnaires where questions are dynamically selected based on previous responses.

## Architecture

### 1. Database Schema Changes

#### `cat_settings` Table
- **New Fields:**
  - `setting_key` (VARCHAR 120): Unique key to identify CAT configuration on external service (e.g., "EORTC_QLQ_C30")
  - `api_configuration` (Json): Additional API configuration if needed

#### `cat_module_sessions` Table (NEW)
Tracks CAT session state per assignment and module.
```sql
CREATE TABLE cat_module_sessions (
  id SERIAL PRIMARY KEY,
  assignment_id INT REFERENCES survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  module_id INT REFERENCES modules(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  session_data JSONB,
  current_dimension_index INT DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(assignment_id, module_id)
);
```

#### `survey_questionnaire_patients_assignment` Table
- **New Field:**
  - `scores` (Json NULLABLE): Stores calculated scores for all modules upon completion

### 2. Service Layer

#### `/src/services/cat/types.ts`
TypeScript interfaces for CAT API integration:
- `CatSession`: Session state from external CAT API
- `CatProgress`: Progress tracking structure
- `CatDimensionProgress`: Progress for individual dimensions
- `CatNextItemResponse`: Response from get-next-item API
- `CatScore`: Score structure for a dimension
- `CatEstimatesResponse`: Final estimates response

#### `/src/services/cat/catService.ts`
Core service functions for CAT API communication:
- `createSessionByKey(settingKey: string)`: Initialize a new CAT session
- `getNextItem(session: CatSession)`: Get next adaptive question
- `setResponse(session: CatSession, value: number)`: Submit patient response
- `getEstimates(session: CatSession)`: Get final IRT scores
- `recreateSession(settingKey: string, responses: Array)`: Rebuild session from saved responses (for token expiry recovery)
- `isSessionComplete(session: CatSession)`: Check stopping criteria

**Configuration:**
- Base URL: `process.env.CAT_API_URL` (default: https://cat.eortc.org/api)
- API Key: `process.env.CAT_API_KEY` (set in `.env`)
- Timeout: 30 seconds
- Auto-retry on network errors

#### `/src/services/cat/catHelpers.ts`
Helper functions for mapping CAT items to local database:
- `mapCatItemToQuestion(itemKey: string, moduleId: number)`: Map CAT item code (e.g., "PF1") to local question ID
- `getCatQuestionDetails(questionId: number, languageId: number)`: Fetch full question with translations
- `getModuleWithCatSetting(moduleId: number)`: Get module with CAT configuration
- `batchMapCatItems(itemKeys: string[], moduleId: number)`: Batch map multiple items

**Database Mapping:**
- CAT `itemKey` → `questions.question_code`
- Questions linked via `cat_questions` table to CAT settings

### 3. API Endpoints

#### `POST /euonqol-api/public/link/:link/modules/:moduleId/next-question`
Get the next adaptive question for a CAT module.

**Request Body:**
```json
{
  "language_id": 1
}
```

**Response:**
```json
{
  "question": {
    "id": 123,
    "question_code": "PF1",
    "question_text": "Do you have any trouble...",
    "answer_profile": {
      "id": 5,
      "profile_name": "Likert 1-4",
      "options": [...]
    }
  },
  "position": 1,
  "dimension_name": "Physical Functioning",
  "progress": {
    "overall_progress": 10,
    "dimensions": [...]
  },
  "is_completed": false
}
```

**Flow:**
1. Validates assignment and module
2. Gets or creates CAT session in `cat_module_sessions`
3. If no session token, creates new session via `catService.createSessionByKey()`
4. Calls `catService.getNextItem()` to get adaptive item
5. Maps CAT `itemKey` to local question via `question_code`
6. Returns question with translations and answer options

**Session Recovery:**
- If session token expired, uses `catService.recreateSession()` to replay responses

#### `GET /euonqol-api/public/link/:link/modules/:moduleId/status`
Get completion status and progress for a CAT module.

**Response:**
```json
{
  "is_completed": false,
  "progress": {
    "overall_progress": 35,
    "dimensions": [
      {
        "name": "Physical Functioning",
        "items_answered": 7,
        "se": 0.32,
        "theta": 50.2
      }
    ]
  },
  "session_exists": true
}
```

### 4. Modified Endpoints

#### `GET /euonqol-api/public/link/:link/preview` (Modified)
Modified `getQuestionnairePreview` to handle dynamic modules:

**Behavior:**
- **Static modules (`type='static'`)**: Returns full module with all questions (original behavior)
- **Dynamic modules (`type='dynamic'`)**: Returns only metadata:
  ```json
  {
    "id": 10,
    "name": "EORTC QLQ-C30",
    "type": "dynamic",
    "cat_setting": {
      "id": 1,
      "name": "EORTC CAT",
      "setting_key": "EORTC_QLQ_C30"
    },
    "questions": [],
    "isDynamic": true
  }
  ```

**Frontend Impact:**
- Frontend must check `module.isDynamic` flag
- For dynamic modules, use `POST /modules/:moduleId/next-question` instead of loading all questions

#### `POST /euonqol-api/public/link/:link/responses` (Modified)
Extended `saveResponses` to sync CAT session state:

**New Logic:**
1. **Sequential Processing**: Changed from `Promise.all` to loop (order matters for CAT)
2. **Update Detection**: Checks if response already exists via `findUnique`
3. **CAT Module Check**: Queries `modules_questions` to identify if question belongs to CAT module
4. **Response Invalidation**:
   - If updating an existing CAT response:
     - Deletes all subsequent responses in that module (`position > current`)
     - Deletes `cat_module_sessions` entry (forces session reset)
   - Ensures adaptive sequence regenerates correctly
5. **CAT Sync Loop**: After saving, iterates through CAT responses and calls `catService.setResponse()` for each

**Response:**
```json
{
  "message": "X responses saved successfully",
  "saved_count": 3,
  "deleted_count": 0,
  "cat_updates": 2
}
```

**Why Invalidation is Critical:**
- CAT algorithms depend on response sequence
- Changing an earlier answer invalidates subsequent adaptive selections
- Must regenerate sequence from scratch after modification

#### `POST /euonqol-api/public/link/:link/complete` (Modified)
Extended `completeQuestionnaire` to calculate and store scores:

**New Logic:**
1. **CAT Completion Verification**:
   - Queries all CAT modules
   - Verifies `cat_module_sessions.is_completed=true` for each
   - Returns 400 error if any CAT module incomplete

2. **Score Calculation**:
   - **Dynamic (CAT) Modules**:
     - Calls `catService.getEstimates()` to get final IRT scores
     - Structure:
       ```json
       {
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
       }
       ```
   
   - **Static Modules**:
     - Counts total questions and answered items
     - Calculates completion percentage
     - Placeholder for complex scoring logic
     - Structure:
       ```json
       {
         "type": "static",
         "module_name": "Demographics",
         "total_questions": 12,
         "items_answered": 12,
         "completion_percentage": 100,
         "numeric_responses": 8,
         "completed_at": "2024-03-05T14:30:00Z"
       }
       ```

3. **Scores Storage**:
   - Builds JSON object with key `module_<id>` for each module
   - Saves to `assignment.scores` field
   - Updates `completion_status='completed'` and `completed_at` timestamp

**Response:**
```json
{
  "message": "Questionnaire completed successfully",
  "assignment_id": 45,
  "completion_status": "completed",
  "completed_at": "2024-03-05T14:30:00Z",
  "response_count": 35,
  "scores": {
    "module_10": { "type": "dynamic", ... },
    "module_11": { "type": "static", ... }
  },
  "modules_scored": 2
}
```

## Configuration

### Environment Variables (`.env`)
```env
CAT_API_URL=https://cat.eortc.org/api
CAT_API_KEY=your_actual_api_key_here
```

**Important:** Replace `your_actual_api_key_here` with the real API key provided by EORTC.

### Database Setup
```bash
cd backend
npx prisma migrate dev --schema=prisma/app/schema.prisma --name add_cat_integration
npx prisma generate
```

## Frontend Integration Guide

### 1. Load Questionnaire Preview
```typescript
// GET /euonqol-api/public/link/:link/preview
const preview = await fetch(`/euonqol-api/public/link/${link}/preview`);
const modules = preview.questionnaire.modules;

// Check module type
modules.forEach(module => {
  if (module.isDynamic) {
    // CAT module: use adaptive flow
    console.log('CAT module:', module.name, module.cat_setting);
  } else {
    // Static module: load all questions
    console.log('Static module with', module.questions.length, 'questions');
  }
});
```

### 2. Adaptive Question Flow (CAT Modules)
```typescript
// Get next adaptive question
async function getNextQuestion(moduleId: number, languageId: number) {
  const response = await fetch(`/euonqol-api/public/link/${link}/modules/${moduleId}/next-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language_id: languageId })
  });
  
  const data = await response.json();
  
  if (data.is_completed) {
    console.log('Module completed!');
    // Move to next module
  } else {
    // Display question
    displayQuestion(data.question, data.position);
  }
}
```

### 3. Save Response and Continue
```typescript
// Save response
async function saveAndContinue(questionId: number, answerOptionId: number, position: number) {
  // Save response
  await fetch(`/euonqol-api/public/link/${link}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      responses: [{
        question_id: questionId,
        answer_option_id: answerOptionId,
        position: position
      }]
    })
  });
  
  // Get next question
  await getNextQuestion(moduleId, languageId);
}
```

### 4. Check Module Status
```typescript
// Check if module is completed
async function checkCompletion(moduleId: number) {
  const response = await fetch(`/euonqol-api/public/link/${link}/modules/${moduleId}/status`);
  const data = await response.json();
  
  console.log('Progress:', data.progress.overall_progress + '%');
  console.log('Completed:', data.is_completed);
  
  return data.is_completed;
}
```

### 5. Complete Questionnaire
```typescript
// Mark as completed (calculates scores)
async function completeQuestionnaire() {
  const response = await fetch(`/euonqol-api/public/link/${link}/complete`, {
    method: 'POST'
  });
  
  const data = await response.json();
  console.log('Scores:', data.scores);
  // data.scores contains scores for all modules
}
```

## Error Handling

### Common Errors

**1. CAT Module Not Completed**
```json
{
  "error": "Incomplete CAT module",
  "message": "CAT module \"EORTC QLQ-C30\" is not yet completed",
  "module_id": 10
}
```
**Solution:** User must complete all adaptive questions before calling `/complete`

**2. External CAT API Timeout**
```json
{
  "error": "CAT service timeout",
  "message": "Failed to get response from CAT service"
}
```
**Solution:** Retry request; check `CAT_API_URL` connectivity

**3. Session Token Expired**
Handled automatically via `recreateSession()` - replays saved responses to rebuild state

**4. Invalid API Key**
```json
{
  "error": "CAT authentication failed",
  "message": "Invalid API key"
}
```
**Solution:** Check `CAT_API_KEY` in `.env`

## Testing Checklist

### Backend Tests (Manual with Postman)
- [ ] Create questionnaire with mixed modules (static + dynamic)
- [ ] Preview questionnaire - verify dynamic modules return only metadata
- [ ] Start CAT module - verify first question returned
- [ ] Answer questions - verify adaptive progression
- [ ] Check status endpoint - verify progress tracking
- [ ] Modify previous CAT answer - verify invalidation (subsequent responses deleted)
- [ ] Complete all modules - verify scores calculated correctly
- [ ] Verify `assignment.scores` JSON structure in database

### Frontend Integration Tests
- [ ] Display static module questions correctly
- [ ] Display CAT module with adaptive flow
- [ ] Show progress indicator for CAT modules
- [ ] Handle "modify previous answer" correctly (invalidation)
- [ ] Show completion status
- [ ] Display final scores after completion

## Database Queries for Debugging

### Check CAT Session State
```sql
SELECT 
  cms.*,
  sqa.patient_id,
  m.name as module_name
FROM cat_module_sessions cms
JOIN survey_questionnaire_patients_assignment sqa ON cms.assignment_id = sqa.id
JOIN modules m ON cms.module_id = m.id
WHERE assignment_id = <assignment_id>;
```

### Check Module Scores
```sql
SELECT 
  id,
  patient_id,
  completion_status,
  completed_at,
  scores
FROM survey_questionnaire_patients_assignment
WHERE id = <assignment_id>;
```

### Check CAT Responses
```sql
SELECT 
  r.id,
  r.question_id,
  q.question_code,
  r.answer_option_id,
  ao.option_text,
  ao.value,
  r.position,
  mq.module_id,
  m.name as module_name,
  m.type as module_type
FROM responses r
JOIN questions q ON r.question_id = q.id
LEFT JOIN answer_options ao ON r.answer_option_id = ao.id
LEFT JOIN modules_questions mq ON q.id = mq.question_id
LEFT JOIN modules m ON mq.module_id = m.id
WHERE r.assignment_id = <assignment_id>
  AND m.type = 'dynamic'
ORDER BY r.position;
```

## Future Enhancements

1. **Static Module Scoring**: Implement domain-specific scoring algorithms for static questionnaires
2. **Score Caching**: Cache CAT estimates during session to reduce API calls
3. **Multi-language Support**: Ensure CAT API supports multiple languages if needed
4. **Progress Persistence**: Add frontend state management for interrupted sessions
5. **Admin Dashboard**: UI to view CAT session states and scores
6. **Analytics**: Track CAT efficiency metrics (items administered, SE convergence)

## Contact & Support

For CAT API issues: Contact EORTC support at https://cat.eortc.org
For integration issues: Refer to this document and check backend logs

---
**Implementation Date:** March 2024  
**Version:** 1.0  
**Status:** Ready for testing (pending database migration)
