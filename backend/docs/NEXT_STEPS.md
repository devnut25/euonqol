# CAT Integration - Next Steps

## ✅ Implementation Complete

The CAT (Computer Adaptive Testing) integration is **fully implemented** and ready for testing.

### What Has Been Done

1. **Database Schema** ✅
   - Added `setting_key` and `api_configuration` to `cat_settings` table
   - Created `cat_module_sessions` table for session state tracking
   - Added `scores` JSON field to `survey_questionnaire_patients_assignment` table
   - File: [prisma/app/schema.prisma](prisma/app/schema.prisma)

2. **Service Layer** ✅
   - CAT API client with all necessary functions
   - Session management and recovery logic
   - Question mapping helpers
   - Files:
     - [src/services/cat/types.ts](src/services/cat/types.ts)
     - [src/services/cat/catService.ts](src/services/cat/catService.ts)
     - [src/services/cat/catHelpers.ts](src/services/cat/catHelpers.ts)

3. **API Endpoints** ✅
   - `POST /euonqol-api/public/link/:link/modules/:moduleId/next-question` - Get adaptive question
   - `GET /euonqol-api/public/link/:link/modules/:moduleId/status` - Check completion status
   - Files:
     - [src/controllers/catController.ts](src/controllers/catController.ts)
     - [src/routes/catRoutes.ts](src/routes/catRoutes.ts)

4. **Modified Endpoints** ✅
   - `GET /euonqol-api/public/link/:link/preview` - Returns metadata for dynamic modules
   - `POST /euonqol-api/public/link/:link/responses` - Syncs CAT session, handles invalidation
   - `POST /euonqol-api/public/link/:link/complete` - Calculates and stores scores
   - File: [src/controllers/publicController.ts](src/controllers/publicController.ts)

5. **Environment Configuration** ✅
   - Added `CAT_API_URL` and `CAT_API_KEY` to `.env`
   - File: [.env](.env)

6. **Documentation** ✅
   - Complete integration guide: [CAT_INTEGRATION.md](CAT_INTEGRATION.md)
   - This file: [NEXT_STEPS.md](NEXT_STEPS.md)

---

## 🚀 Required Actions Before Testing

### 1. Run Database Migration

The database schema has been updated but the migration has not been executed yet.

**Command:**
```bash
cd backend
npx prisma migrate dev --schema=prisma/app/schema.prisma --name add_cat_integration
npx prisma generate
```

**What this does:**
- Creates `cat_module_sessions` table
- Adds columns to existing tables (`cat_settings`, `survey_questionnaire_patients_assignment`)
- Regenerates Prisma client with updated types

### 2. Set Real CAT API Key

The `.env` file contains a placeholder API key.

**Action:**
1. Open `backend/.env`
2. Replace `YOUR_CAT_API_KEY_HERE` with the actual API key from EORTC
3. Verify `CAT_API_URL=https://cat.eortc.org/api` is correct

**Current `.env` content:**
```env
CAT_API_URL=https://cat.eortc.org/api
CAT_API_KEY=YOUR_CAT_API_KEY_HERE
```

### 3. Configure CAT Settings in Database

For each CAT module, ensure the `cat_settings` table has correct configuration.

**Required Data:**
```sql
-- Example: EORTC QLQ-C30 CAT module
UPDATE cat_settings 
SET 
  setting_key = 'EORTC_QLQ_C30',  -- Must match external CAT API key
  api_configuration = NULL          -- Or custom JSON if needed
WHERE id = <your_cat_setting_id>;
```

**How to find the correct `setting_key`:**
- Contact EORTC or check their documentation
- The key must exist on the external CAT service
- Example keys might be: `EORTC_QLQ_C30`, `EORTC_QLQ_BR23`, etc.

---

## 🧪 Testing Guide

### Backend Testing (Manual with Postman/curl)

#### 1. Create Test Questionnaire
Create a questionnaire with:
- At least one **static module** (traditional fixed questions)
- At least one **dynamic module** (CAT adaptive)

Ensure the dynamic module has:
- `module.type = 'dynamic'`
- `module.cat_setting_id` linked to valid `cat_settings` record
- Questions with `question_code` matching CAT `itemKey` values

#### 2. Test Preview Endpoint
```bash
GET /euonqol-api/public/link/:link/preview
```

**Expected:**
- Static modules return full questions array
- Dynamic modules return:
  ```json
  {
    "id": 10,
    "name": "EORTC QLQ-C30",
    "type": "dynamic",
    "cat_setting": { "setting_key": "EORTC_QLQ_C30", ... },
    "questions": [],
    "isDynamic": true
  }
  ```

#### 3. Test Adaptive Question Flow
```bash
# Get first question
POST /euonqol-api/public/link/:link/modules/10/next-question
Content-Type: application/json

{
  "language_id": 1
}
```

**Expected Response:**
```json
{
  "question": {
    "id": 123,
    "question_code": "PF1",
    "question_text": "...",
    "answer_profile": { "options": [...] }
  },
  "position": 1,
  "dimension_name": "Physical Functioning",
  "progress": { "overall_progress": 0 },
  "is_completed": false
}
```

#### 4. Test Save Response and Continue
```bash
# Save response
POST /euonqol-api/public/link/:link/responses
Content-Type: application/json

{
  "responses": [{
    "question_id": 123,
    "answer_option_id": 456,
    "position": 1
  }]
}

# Get next question
POST /euonqol-api/public/link/:link/modules/10/next-question
Content-Type: application/json

{ "language_id": 1 }
```

**Expected:**
- Response saved successfully
- Next question adapted based on previous answer
- `position` increments

#### 5. Test Response Invalidation
```bash
# Answer question 1 (position 1)
# Answer question 2 (position 2)
# Answer question 3 (position 3)

# Now modify answer to question 1
POST /euonqol-api/public/link/:link/responses
Content-Type: application/json

{
  "responses": [{
    "question_id": 123,
    "answer_option_id": 789,  # Different answer
    "position": 1
  }]
}
```

**Expected:**
- Response at position 1 updated
- Responses at positions 2 and 3 **deleted** (invalidation)
- `cat_module_sessions` entry deleted
- Next call to `/next-question` starts fresh sequence

**Verify in Database:**
```sql
SELECT position, question_id FROM responses 
WHERE assignment_id = X AND question_id IN (SELECT question_id FROM modules_questions WHERE module_id = 10)
ORDER BY position;
-- Should only show position 1
```

#### 6. Test Status Endpoint
```bash
GET /euonqol-api/public/link/:link/modules/10/status
```

**Expected:**
```json
{
  "is_completed": false,
  "progress": {
    "overall_progress": 35,
    "dimensions": [
      { "name": "Physical Functioning", "items_answered": 3, ... }
    ]
  },
  "session_exists": true
}
```

#### 7. Test Completion with Scores
```bash
# Complete all questions in CAT module
# Complete all static modules

# Mark as completed
POST /euonqol-api/public/link/:link/complete
```

**Expected:**
```json
{
  "message": "Questionnaire completed successfully",
  "completion_status": "completed",
  "scores": {
    "module_10": {
      "type": "dynamic",
      "module_name": "EORTC QLQ-C30",
      "dimensions": [
        { "dimension": "Physical Functioning", "theta": 52.5, "se": 0.28 }
      ]
    },
    "module_11": {
      "type": "static",
      "total_questions": 12,
      "items_answered": 12,
      "completion_percentage": 100
    }
  },
  "modules_scored": 2
}
```

**Verify in Database:**
```sql
SELECT scores FROM survey_questionnaire_patients_assignment WHERE id = X;
-- Should return JSON with all module scores
```

### Frontend Testing

Refer to [CAT_INTEGRATION.md](CAT_INTEGRATION.md) section "Frontend Integration Guide" for:
- Detecting dynamic modules in preview
- Implementing adaptive question flow
- Handling progress tracking
- Managing response invalidation UX

---

## 📋 Database Queries for Debugging

### Check CAT Session State
```sql
SELECT 
  cms.id,
  cms.session_token,
  cms.current_dimension_index,
  cms.is_completed,
  cms.session_data,
  m.name as module_name
FROM cat_module_sessions cms
JOIN modules m ON cms.module_id = m.id
WHERE assignment_id = <your_assignment_id>;
```

### Check All Responses for an Assignment
```sql
SELECT 
  r.position,
  q.question_code,
  ao.option_text,
  ao.value,
  m.name as module_name,
  m.type as module_type
FROM responses r
JOIN questions q ON r.question_id = q.id
LEFT JOIN answer_options ao ON r.answer_option_id = ao.id
LEFT JOIN modules_questions mq ON q.id = mq.question_id
LEFT JOIN modules m ON mq.module_id = m.id
WHERE r.assignment_id = <your_assignment_id>
ORDER BY m.id, r.position;
```

### Check Calculated Scores
```sql
SELECT 
  id,
  completion_status,
  completed_at,
  jsonb_pretty(scores::jsonb) as formatted_scores
FROM survey_questionnaire_patients_assignment
WHERE id = <your_assignment_id>;
```

---

## 🐛 Common Issues and Solutions

### Issue 1: "CAT authentication failed"
**Cause:** Invalid or missing API key

**Solution:**
1. Check `.env` file has correct `CAT_API_KEY`
2. Restart backend server after updating `.env`
3. Verify key is valid by testing directly with CAT API

### Issue 2: "CAT module not completed"
**Cause:** Trying to complete questionnaire before CAT module finished

**Solution:**
- Check status endpoint: `GET /link/:link/modules/:moduleId/status`
- Verify `is_completed: true`
- Continue answering questions until stopping criteria met

### Issue 3: "Question not found" when mapping CAT item
**Cause:** CAT `itemKey` doesn't match any `question_code` in database

**Solution:**
1. Verify questions table has correct `question_code` values (e.g., "PF1", "PF2", etc.)
2. Ensure questions are linked to correct module via `modules_questions`
3. Check `cat_questions` table links questions to `cat_setting_id`

**Debug Query:**
```sql
SELECT 
  q.id,
  q.question_code,
  cs.setting_key
FROM questions q
JOIN cat_questions cq ON q.id = cq.question_id
JOIN cat_settings cs ON cq.cat_setting_id = cs.id
WHERE cs.id = <your_cat_setting_id>;
```

### Issue 4: Session token expired
**Handled Automatically:** `catService.recreateSession()` replays responses

If issues persist:
1. Check `cat_module_sessions.session_data` has complete history
2. Verify responses table has all answers with correct positions
3. Try deleting `cat_module_sessions` entry to force fresh session

### Issue 5: Scores not calculated
**Cause:** Error calling CAT estimates API

**Solution:**
1. Check backend logs for error messages
2. Verify CAT module is marked as completed (`is_completed=true`)
3. Manually test: `POST https://cat.eortc.org/api/runner/estimates` with session token
4. If CAT API fails, scores will have `error: "Failed to calculate scores"`

---

## 🔄 Workflow Summary

### Patient Questionnaire Flow

```
1. Get Preview
   ├─ Static Modules: Load all questions
   └─ Dynamic Modules: Show only metadata
   
2. For Each Static Module:
   └─ Display all questions → Save responses
   
3. For Each Dynamic Module:
   ├─ Call /next-question → Display question
   ├─ Patient answers → Save response
   ├─ Call /next-question → Next adaptive question
   └─ Repeat until is_completed=true
   
4. Complete Questionnaire:
   ├─ Verify all CAT modules completed
   ├─ Calculate scores (CAT: IRT estimates, Static: summary)
   ├─ Save to assignment.scores
   └─ Mark as completed
```

### Response Modification Flow

```
1. Patient wants to change answer at position 1
2. Frontend calls POST /responses with updated answer
3. Backend:
   ├─ Detects existing response (wasUpdate=true)
   ├─ Checks if question is in CAT module
   ├─ Deletes responses at positions > 1 (invalidation)
   ├─ Deletes cat_module_sessions entry
   └─ Updates response at position 1
4. Next /next-question call:
   ├─ No session exists → Creates new session
   ├─ Replays response at position 1
   └─ Gets new adaptive question at position 2
```

---

## 📊 Success Criteria

Your integration is working correctly if:

- ✅ Dynamic modules return `isDynamic: true` in preview
- ✅ `/next-question` returns adaptive questions
- ✅ Responses sync to external CAT service (check logs for `catService.setResponse`)
- ✅ Progress increases as questions are answered
- ✅ Modifying earlier answer invalidates later responses
- ✅ Module completes when stopping criteria met (`is_completed: true`)
- ✅ `/complete` calculates scores for all modules
- ✅ `assignment.scores` JSON contains all module scores

---

## 📞 Support

- **CAT API Issues:** EORTC support at https://cat.eortc.org
- **Integration Documentation:** [CAT_INTEGRATION.md](CAT_INTEGRATION.md)
- **Backend Logs:** Check console for detailed error messages (search for `[CAT]` prefix)

---

**Ready to Test!** After completing migration and setting API key, start with step 1 of testing guide.
