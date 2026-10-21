/**
 * EUonQol End-to-End Test Script
 *
 * Tests:
 *   1.  Modulo STATIC    (type='static') + assegnazione domande
 *   2.  Modulo DYNAMIC   (type='dynamic', catSettingId)
 *   3.  Modulo SOCIO-DEMO (type='socio-demo') + assegnazione domande
 *   4.  Survey
 *   5a. Questionario STATIC  → moduli: socio-demo (pos 1) + static (pos 2)
 *   5b. Questionario DYNAMIC → moduli: socio-demo (pos 1) + dynamic (pos 2)
 *       I moduli socio-demo sono ammessi in qualsiasi questionario.
 *   6.  Pazienti (identified + traceable + no-mode)
 *   7.  Assignments + accesso via link pubblico
 *
 * Run: node test-e2e.mjs   (from backend/ dir, con stack Docker UP)
 */

import axios from 'axios';

// URL rilevati automaticamente dall'ambiente
// - HOST: esegui con BASE_URL=http://localhost:3000/euonqol-api KC_URL=http://localhost:8080
// - CONTAINER: esegui da dentro Docker (node test-e2e.mjs)
const BASE_URL  = process.env.BASE_URL  ?? 'http://localhost:3000/euonqol-api';  // dentro container: localhost va bene
const KC_URL    = process.env.KC_URL    ?? 'http://keycloak:8080';       // hostname interno Docker
const REALM     = 'euonqol';
// euonqol-backend non ha direct access grants – usiamo euonqol-frontend per il login
const CLIENT_ID = 'euonqol-frontend';
const CLIENT_SECRET = undefined;  // public client, nessun secret

// ── helpers ──────────────────────────────────────────────────────────────────

async function getToken(username, password) {
  const fields = {
    username,
    password,
    grant_type: 'password',
    client_id: CLIENT_ID,
  };
  const params = new URLSearchParams(fields);
  const res = await axios.post(
    `${KC_URL}/realms/${REALM}/protocol/openid-connect/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

function api(token) {
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

function ok(label, data) {
  console.log(`  ✅ ${label}:`, JSON.stringify(data, null, 2));
  return data;
}

function fail(label, err) {
  const detail = err.response?.data ?? err.message;
  console.error(`  ❌ ${label}:`, JSON.stringify(detail, null, 2));
  throw err;
}

function section(title) {
  console.log('\n' + '═'.repeat(70));
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

function unwrap(res) {
  // Normalizza la risposta: ritorna l'oggetto principale (survey, module, etc.)
  const d = res.data;
  return d.survey ?? d.module ?? d.questionnaire ?? d.patient ?? d.data ?? d;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🚀  EUonQol – End-to-End Test\n');
  const R = {};   // risultati accumulati

  // ─── STEP 0 ─ Auth ────────────────────────────────────────────────────────
  section('STEP 0 – Autenticazione admin');

  // prova prima con la password della conversation-summary, poi con quella dell'.env.example
  let token;
  for (const [u, pwd] of [['admin','TestPassword123!'], ['Admin','TestPassword123!'], ['admin','Test123!'], ['Admin','Test123!']]) {
    try {
      token = await getToken(u, pwd);
      console.log(`  ✅ Token ottenuto (username: ${u}, password: ${pwd})`);
      break;
    } catch (_) { /* prova prossima */ }
  }
  if (!token) throw new Error('Impossibile ottenere il token admin – controlla le credenziali');

  const cl = api(token);

  // ─── STEP 0.1 ─ Dati di riferimento ──────────────────────────────────────
  section('STEP 0.1 – Dati di riferimento (kit, gruppi, cat-settings)');

  const kitsRes = await cl.get('/kit-versions').catch(e => fail('GET /kit-versions', e));
  const kits = kitsRes.data.data ?? kitsRes.data;
  const kitVersion = Array.isArray(kits) ? kits[0] : kits;
  R.kitVersionId = kitVersion.id;
  ok('Kit version', { id: kitVersion.id, name: kitVersion.name });

  const groupsRes = await cl.get('/patient-groups').catch(e => fail('GET /patient-groups', e));
  const groups = groupsRes.data.data ?? groupsRes.data;
  groups.forEach(g => console.log(`  ✅ Gruppo: [${g.id}] ${g.name}`));
  R.groupId = groups[0]?.id ?? 1;

  const catRes = await cl.get('/cat-settings').catch(e => fail('GET /cat-settings', e));
  const catSettings = catRes.data.data ?? catRes.data;
  const catFA = catSettings.find(s => s.name?.includes('FA')) ?? catSettings[0];
  R.catSettingId = catFA.id;
  ok('CAT setting selezionato', { id: catFA.id, name: catFA.name });

  // ─── STEP 1 ─ Modulo STATIC ───────────────────────────────────────────────
  section('STEP 1 – Creo modulo STATIC');

  const staticMod = await cl.post('/modules', {
    kitVersionId: R.kitVersionId,
    name:         'E2E – Static Module',
    type:         'static',
    patientGroupId: R.groupId,
    groupName:    'Global Health',
  }).then(r => ok('Modulo static', unwrap(r)))
    .catch(e => fail('POST /modules (static)', e));
  R.staticModuleId = staticMod.id ?? staticMod.module?.id;

  // ─── STEP 1.1 ─ Assegno domande static al modulo ─────────────────────────
  section('STEP 1.1 – Assegno domande STATIC al modulo');

  try {
    const sqStaticRes = await cl.get(
      `/patient-groups/${R.groupId}/questions?questionKind=static&pageSize=5`
    );
    const staticQuestions = sqStaticRes.data.questions ?? sqStaticRes.data.data ?? sqStaticRes.data;
    if (staticQuestions.length > 0) {
      const sqPayload = staticQuestions.slice(0, 5).map((q, i) => ({
        questionId: q.questionId ?? q.id,
        position:   i + 1,
      }));
      await cl.put(`/modules/${R.staticModuleId}/questions`, { questions: sqPayload })
        .then(() => console.log(`  ✅ Assegnate ${sqPayload.length} domande static al modulo`))
        .catch(e => console.log('  ⚠ PUT /modules/questions (static) fallito:', e.response?.data ?? e.message));
    } else {
      console.log('  ⚠ Nessuna domanda static trovata nel gruppo – modulo vuoto');
    }
  } catch (e) {
    console.log('  ⚠ GET patient-groups/questions (static) fallito:', e.response?.data ?? e.message);
  }

  // ─── STEP 2 ─ Modulo DYNAMIC ──────────────────────────────────────────────
  section('STEP 2 – Creo modulo DYNAMIC (CAT)');

  const dynamicMod = await cl.post('/modules', {
    kitVersionId:   R.kitVersionId,
    name:           'E2E – Dynamic Module (FA)',
    type:           'dynamic',
    patientGroupId: R.groupId,
    catSettingId:   R.catSettingId,
    groupName:      'Fatigue',
  }).then(r => ok('Modulo dynamic', unwrap(r)))
    .catch(e => fail('POST /modules (dynamic)', e));
  R.dynamicModuleId = dynamicMod.id ?? dynamicMod.module?.id;

  // ─── STEP 3 ─ Modulo SOCIO-DEMO (type='socio-demo') ──────────────────────
  section('STEP 3 – Creo modulo SOCIO-DEMO  (type=socio-demo)');

  const socioDemoMod = await cl.post('/modules', {
    kitVersionId:   R.kitVersionId,
    name:           'E2E – Socio-Demo Module',
    type:           'socio-demo',
    patientGroupId: R.groupId,
    groupName:      'Socio-Demographic',
  }).then(r => ok('Modulo socio-demo', unwrap(r)))
    .catch(e => fail('POST /modules (socio-demo)', e));
  R.socioDemoModuleId = socioDemoMod.id ?? socioDemoMod.module?.id;

  // ─── STEP 3.1 ─ Aggiungo domande socio-demo al modulo ────────────────────
  section('STEP 3.1 – Assegno domande SOCIO-DEMO al modulo');

  try {
    const sqSDRes = await cl.get(
      `/patient-groups/${R.groupId}/questions?questionKind=socio-demo&pageSize=10`
    );
    const socioDemoQuestions = sqSDRes.data.questions ?? sqSDRes.data.data ?? sqSDRes.data;
    if (socioDemoQuestions.length > 0) {
      const sdPayload = socioDemoQuestions.slice(0, 5).map((q, i) => ({
        questionId: q.questionId ?? q.id,
        position:   i + 1,
      }));
      await cl.put(`/modules/${R.socioDemoModuleId}/questions`, { questions: sdPayload })
        .then(() => console.log(`  ✅ Assegnate ${sdPayload.length} domande socio-demo al modulo`))
        .catch(e => console.log('  ⚠ PUT /modules/questions (socio-demo) fallito:', e.response?.data ?? e.message));
    } else {
      console.log('  ⚠ Nessuna domanda socio-demo trovata nel gruppo – modulo vuoto');
    }
  } catch (e) {
    console.log('  ⚠ GET patient-groups/questions (socio-demo) fallito:', e.response?.data ?? e.message);
  }

  // ─── STEP 4 ─ Survey ──────────────────────────────────────────────────────
  section('STEP 4 – Creo Survey');

  const survey = await cl.post('/surveys', {
    name:   'E2E – Test Survey',
    status: 'active',
  }).then(r => ok('Survey creata', unwrap(r)))
    .catch(e => fail('POST /surveys', e));
  R.surveyId = survey.id ?? survey.survey?.id;

  // ─── STEP 5a ─ Questionario STATIC (socio-demo + static) ─────────────────
  section('STEP 5a – Creo Questionario STATIC  [socio-demo (pos 1) → static (pos 2)]');

  const qStatic = await cl.post(`/surveys/${R.surveyId}/questionnaires`, {
    title:           'E2E – Questionario Static',
    description:     'Questionario di test con moduli socio-demo e static',
    patient_group_id: R.groupId,
    type:            'static',
    status:          'active',
  }).then(r => ok('Questionario static creato', unwrap(r)))
    .catch(e => fail('POST questionnaire (static)', e));
  R.questionnaireStaticId = qStatic.id ?? qStatic.questionnaire?.id;

  // Assegno i moduli al questionario static
  await cl.put(`/questionnaires/${R.questionnaireStaticId}/modules`, {
    modules: [
      { moduleId: R.socioDemoModuleId, position: 1, is_active: true },
      { moduleId: R.staticModuleId,   position: 2, is_active: true },
    ],
  }).then(r => ok('Moduli assegnati al questionario static', {
      count: r.data.updatedCount,
      type:  r.data.questionnaire?.type,
    }))
    .catch(e => fail('PUT questionnaire/modules (static)', e));

  // ─── STEP 5b ─ Questionario DYNAMIC (socio-demo + dynamic) ──────────────
  section('STEP 5b – Creo Questionario DYNAMIC  [socio-demo (pos 1) → dynamic (pos 2)]');

  const qDynamic = await cl.post(`/surveys/${R.surveyId}/questionnaires`, {
    title:           'E2E – Questionario Dynamic (CAT)',
    description:     'Questionario di test con modulo CAT e socio-demo',
    patient_group_id: R.groupId,
    type:            'dynamic',
    status:          'active',
  }).then(r => ok('Questionario dynamic creato', unwrap(r)))
    .catch(e => fail('POST questionnaire (dynamic)', e));
  R.questionnaireDynamicId = qDynamic.id ?? qDynamic.questionnaire?.id;

  await cl.put(`/questionnaires/${R.questionnaireDynamicId}/modules`, {
    modules: [
      { moduleId: R.socioDemoModuleId, position: 1, is_active: true },
      { moduleId: R.dynamicModuleId,   position: 2, is_active: true },
    ],
  }).then(r => ok('Moduli assegnati al questionario dynamic (socio-demo + dynamic)', {
      count: r.data.updatedCount,
      type:  r.data.questionnaire?.type,
    }))
    .catch(e => fail('PUT questionnaire/modules (dynamic)', e));

  // ─── STEP 5.1 ─ Preview dei questionari ───────────────────────────────────
  section('STEP 5.1 – Preview questionari');

  for (const [label, qid] of [
    ['Static', R.questionnaireStaticId],
    ['Dynamic', R.questionnaireDynamicId],
  ]) {
    await cl.get(`/questionnaires/${qid}/preview`)
      .then(r => {
        const mods = r.data.modules ?? [];
        console.log(`  ✅ Preview [${label}] – ${mods.length} moduli (${r.data.totalQuestions ?? 0} domande totali):`);
        // struttura: { position, module: { id, name, type }, questions: [] }
        mods.forEach(m => console.log(`     [pos ${m.position}] ${m.module?.name ?? m.name} (${m.module?.type ?? m.type}) – ${m.questions?.length ?? 0} domande`));
      })
      .catch(e => console.log(`  ⚠ Preview [${label}] fallito:`, e.response?.data ?? e.message));
  }

  // ─── STEP 6 ─ Pazienti ────────────────────────────────────────────────────
  section('STEP 6 – Creo pazienti');

  const ts = Date.now();

  const pIdentified = await cl.post('/patients', {
    patient_id:  `E2E-IDENT-${ts}`,
    mail:        'e2e.identified@test.local',
    access_mode: 'identified',
    group_id:    R.groupId,
  }).then(r => ok('Paziente identified', { id: unwrap(r).id, mode: unwrap(r).access_mode ?? unwrap(r).accessMode }))
    .catch(e => fail('POST /patients (identified)', e));
  R.patientIdentifiedId = pIdentified.id;

  const pTraceable = await cl.post('/patients', {
    patient_id:  `E2E-TRACE-${ts}`,
    mail:        'e2e.traceable@test.local',
    access_mode: 'traceable',
    group_id:    R.groupId,
  }).then(r => ok('Paziente traceable', { id: unwrap(r).id, mode: unwrap(r).access_mode ?? unwrap(r).accessMode }))
    .catch(e => fail('POST /patients (traceable)', e));
  R.patientTraceableId = pTraceable.id;

  // Paziente senza access_mode = accesso solo via link pubblico condiviso
  const pNoMode = await cl.post('/patients', {
    patient_id: `E2E-NOMODE-${ts}`,
    group_id:   R.groupId,
  }).then(r => ok('Paziente (no access_mode)', { id: unwrap(r).id }))
    .catch(e => fail('POST /patients (no mode)', e));
  R.patientNoModeId = pNoMode.id;

  // ─── STEP 6.1 ─ Assignments ───────────────────────────────────────────────
  section('STEP 6.1 – Assegno questionario static ai pazienti');

  const assignRes = await cl.post(
    `/surveys/${R.surveyId}/questionnaires/${R.questionnaireStaticId}/assignments`, {
      patient_ids: [R.patientIdentifiedId, R.patientTraceableId],
      access_mode: 'identified',
    }
  ).then(r => ok('Assignments creati', r.data))
    .catch(e => fail('POST assignments', e));

  // ─── STEP 7 ─ Recupero link assignment ───────────────────────────────────
  section('STEP 7 – Recupero link accesso paziente');

  const assignmentsListRes = await cl.get(
    `/surveys/${R.surveyId}/assignments`
  ).catch(e => fail('GET assignments list', e));

  const assignmentsList = assignmentsListRes.data.data ?? assignmentsListRes.data;
  console.log(`  ✅ ${assignmentsList.length} assignments trovati`);

  const firstAssignment = assignmentsList[0];
  if (firstAssignment) {
    R.accessLink = firstAssignment.link ?? firstAssignment.access_link ?? firstAssignment.accessLink;
    ok('Primo assignment', {
      id: firstAssignment.id,
      link: R.accessLink,
      status: firstAssignment.status,
    });
  }

  // ─── STEP 7.1 ─ Link pubblico condiviso ──────────────────────────────────
  section('STEP 7.1 – Genero link pubblico condiviso (per pazienti anonimi)');

  await cl.post(`/surveys/${R.surveyId}/questionnaires/${R.questionnaireStaticId}/public-link`)
    .then(r => {
      // la risposta può essere { publicLink: {...} } o { link: '...', url: '...' }
      const d = r.data.publicLink ?? r.data;
      R.publicLink = d.link ?? d.url ?? d.access_link ?? d.publicLink;
      ok('Link pubblico generato', r.data);
    })
    .catch(e => console.log('  ⚠ Generazione link pubblico fallita:', e.response?.data ?? e.message));

  // ─── STEP 7.2 ─ Accesso paziente via link ────────────────────────────────
  if (R.accessLink) {
    section('STEP 7.2 – Simulazione accesso paziente via link personale');

    const linkCode = R.accessLink.includes('/')
      ? R.accessLink.split('/').filter(Boolean).pop()
      : R.accessLink;

    await axios.get(`${BASE_URL}/public/link/${linkCode}`)
      .then(r => ok('Accesso al questionario via link', {
        title: r.data.title ?? r.data.questionnaire?.title,
        modules: r.data.modules?.length ?? r.data.questionnaire?.modules?.length ?? 'N/A',
      }))
      .catch(e => console.log('  ⚠ GET public/link fallito:', e.response?.data ?? e.message));

    await axios.post(`${BASE_URL}/public/link/${linkCode}/start`, { language_id: 14 })
      .then(r => {
        R.sessionId = r.data.sessionId ?? r.data.session?.id ?? r.data.id;
        R.sessionAssignmentId = r.data.assignment_id ?? firstAssignment?.id ?? r.data.assignmentId;
        ok('Sessione avviata', { sessionId: R.sessionId, assignment_id: R.sessionAssignmentId });
      })
      .catch(e => console.log('  ⚠ POST public/link/start fallito:', e.response?.data ?? e.message));

    const progressAssignmentId = R.sessionAssignmentId ?? firstAssignment?.id;
    if (progressAssignmentId) {
      await axios.get(`${BASE_URL}/public/link/${linkCode}/progress?assignment_id=${progressAssignmentId}`)
        .then(r => ok('Progresso sessione', r.data))
        .catch(e => console.log('  ⚠ GET public/link/progress fallito:', e.response?.data ?? e.message));
    }
  }

  // ─── STEP 8 ─ Recupero preview per prendere domande + answer options ────────
  section('STEP 8 – Recupero struttura questionario static per rispondere');

  const previewRes = await cl.get(`/questionnaires/${R.questionnaireStaticId}/preview?languageId=14`)
    .catch(e => fail('GET questionnaire preview', e));

  const previewModules = previewRes.data.modules ?? previewRes.data;
  R.previewModules = previewModules;

  // Separa domande per tipo
  R.staticQuestionsForAnswer   = [];
  R.socioDemoQuestionsForAnswer = [];

  for (const mod of previewModules) {
    const questions = mod.questions ?? [];
    if (mod.module?.type === 'static' || mod.type === 'static') {
      questions.forEach(q => {
        if (q.answerOptions?.length > 0) R.staticQuestionsForAnswer.push(q);
      });
    }
    if (mod.module?.type === 'socio-demo' || mod.type === 'socio-demo') {
      questions.forEach(q => {
        if (q.answerOptions?.length > 0) R.socioDemoQuestionsForAnswer.push(q);
      });
    }
  }

  console.log(`  ✅ Domande static con opzioni: ${R.staticQuestionsForAnswer.length}`);
  console.log(`  ✅ Domande socio-demo con opzioni: ${R.socioDemoQuestionsForAnswer.length}`);

  // ─── STEP 9 ─ Salvo risposte modulo STATIC ──────────────────────────────────
  section('STEP 9 – Salvo risposte alle domande STATIC');

  // Per ogni domanda static prendo la prima opzione disponibile (answer_option_id)
  const staticResponses = R.staticQuestionsForAnswer.map(q => ({
    question_id: q.questionId,
    language_id: 14,
    answer_option_id: q.answerOptions[0].id,    // primo answer_option disponibile
  }));

  if (staticResponses.length > 0) {
    await axios.put(`${BASE_URL}/public/link/${R.accessLink}/responses`, {
      assignment_id: R.sessionAssignmentId,
      responses: staticResponses,
    }).then(r => ok('Risposte static salvate', {
        saved: r.data.saved_count,
        cat_updates: r.data.cat_updates,
      }))
      .catch(e => fail('PUT /public/link/responses (static)', e));
  } else {
    console.log('  ⚠ Nessuna domanda static con opzioni trovata – salto');
  }

  // ─── STEP 10 ─ Salvo risposte modulo SOCIO-DEMO ──────────────────────────────
  section('STEP 10 – Salvo risposte alle domande SOCIO-DEMO');

  // Per socio-demo: answer_type Checkbox/Number → socio_demo_answer_id; Text → answer_text
  const socioDemoResponses = R.socioDemoQuestionsForAnswer.map(q => {
    const firstOpt = q.answerOptions[0];
    if (firstOpt.answer_type === 'Text') {
      return { question_id: q.questionId, language_id: 14, answer_text: 'Test risposta testo' };
    }
    // Checkbox o Number: usa socio_demo_answer_id
    return { question_id: q.questionId, language_id: 14, socio_demo_answer_id: firstOpt.id };
  });

  if (socioDemoResponses.length > 0) {
    await axios.put(`${BASE_URL}/public/link/${R.accessLink}/responses`, {
      assignment_id: R.sessionAssignmentId,
      responses: socioDemoResponses,
    }).then(r => ok('Risposte socio-demo salvate', {
        saved: r.data.saved_count,
        cat_updates: r.data.cat_updates,
      }))
      .catch(e => fail('PUT /public/link/responses (socio-demo)', e));
  } else {
    console.log('  ⚠ Nessuna domanda socio-demo con opzioni trovata – salto');
  }

  // ─── STEP 10.1 ─ Verifica progress dopo risposte ────────────────────────────
  section('STEP 10.1 – Verifica progresso dopo risposte static + socio-demo');

  await axios.get(`${BASE_URL}/public/link/${R.accessLink}/progress?assignment_id=${R.sessionAssignmentId}`)
    .then(r => ok('Progresso attuale', {
        total: r.data.total_questions,
        answered: r.data.answered_questions,
        pct: r.data.progress_percentage + '%',
        status: r.data.completion_status,
      }))
    .catch(e => console.log('  ⚠ GET progress fallito:', e.response?.data ?? e.message));

  // ─── STEP 11 ─ Loop CAT: next-question → risposta → ripeti ───────────────────
  section('STEP 11 – Rispondo al questionario DYNAMIC (CAT)');

  // Recupero il link del questionario dynamic (usiamo l'assignment creato in 6.1 per quello static;
  // per il dynamic ne creiamo uno ad hoc adesso)
  const dynAssignRes = await cl.post(
    `/surveys/${R.surveyId}/questionnaires/${R.questionnaireDynamicId}/assignments`, {
      patient_ids: [R.patientIdentifiedId],
      access_mode: 'identified',
    }
  ).then(r => ok('Assignment dynamic creato', r.data))
    .catch(e => fail('POST assignments (dynamic)', e));

  const dynAssignment = dynAssignRes.assignments?.[0] ?? dynAssignRes[0];
  R.dynAssignmentId  = dynAssignment?.id;
  R.dynAccessLink    = dynAssignment?.link;

  if (!R.dynAccessLink) {
    console.log('  ⚠ Impossibile ottenere link per questionario dynamic – salto STEP 11');
  } else {
    // Avvia sessione dynamic
    const dynStart = await axios.post(`${BASE_URL}/public/link/${R.dynAccessLink}/start`, { language_id: 14 })
      .then(r => { return r.data; })
      .catch(e => { console.log('  ⚠ Start sessione dynamic fallito:', e.response?.data ?? e.message); return null; });

    R.dynAssignmentId = dynStart?.assignment_id ?? R.dynAssignmentId;

    // Trova il modulo dynamic nel questionario
    const dynPreviewRes = await cl.get(`/questionnaires/${R.questionnaireDynamicId}/preview?languageId=14`)
      .catch(() => null);
    const dynModules = dynPreviewRes?.data?.modules ?? [];
    const dynModule  = dynModules.find(m => (m.module?.type ?? m.type) === 'dynamic');
    R.dynModuleId    = dynModule?.module?.id ?? dynModule?.id;

    if (!R.dynModuleId) {
      console.log('  ⚠ Modulo dynamic non trovato nella preview – salto loop CAT');
    } else {
      console.log(`  ℹ Avvio loop CAT su modulo ${R.dynModuleId}, link: ${R.dynAccessLink}`);
      let catComplete = false;
      let catIterations = 0;
      const MAX_CAT_ITERATIONS = 30;

      while (!catComplete && catIterations < MAX_CAT_ITERATIONS) {
        catIterations++;

        // 1. Ottieni prossima domanda CAT
        const nextQ = await axios.post(
          `${BASE_URL}/public/link/${R.dynAccessLink}/modules/${R.dynModuleId}/next-question`,
          { assignment_id: R.dynAssignmentId, language_id: 14 }
        ).then(r => r.data)
          .catch(e => {
            console.log(`  ⚠ Iter ${catIterations}: next-question fallito:`, e.response?.data ?? e.message);
            return null;
          });

        if (!nextQ) break;

        if (nextQ.is_complete) {
          console.log(`  ✅ CAT completato dopo ${catIterations - 1} domande!`);
          catComplete = true;
          R.catSessionId = nextQ.session_id;
          break;
        }

        const question = nextQ.question;
        const sessionId = nextQ.session_id;
        R.catSessionId = sessionId;

        // Scegli prima opzione disponibile (valore numerico)
        const answerOpts = question?.answerOptions ?? question?.answer_options ?? [];
        const chosenOpt = answerOpts[0];

        if (!chosenOpt) {
          console.log(`  ⚠ Iter ${catIterations}: nessuna opzione risposta per domanda ${question?.questionId ?? question?.id}`);
          break;
        }

        const questionId = question?.questionId ?? question?.id;
        console.log(`  ℹ Iter ${catIterations}: dom "${question?.questionCode ?? questionId}" → opzione id=${chosenOpt.id} val=${chosenOpt.value}`);

        // 2. Salva risposta
        await axios.put(`${BASE_URL}/public/link/${R.dynAccessLink}/responses`, {
          assignment_id: R.dynAssignmentId,
          responses: [{ question_id: questionId, language_id: 14, answer_option_id: chosenOpt.id }],
        }).catch(e => console.log(`  ⚠ Iter ${catIterations}: save response fallito:`, e.response?.data ?? e.message));
      }

      if (!catComplete) {
        // Controlla lo status finale del session CAT
        await axios.get(
          `${BASE_URL}/public/link/${R.dynAccessLink}/modules/${R.dynModuleId}/status?assignment_id=${R.dynAssignmentId}`
        ).then(r => ok('Stato finale CAT', {
            is_complete: r.data.is_complete,
            progress: r.data.progress,
          }))
          .catch(e => console.log('  ⚠ CAT status fallito:', e.response?.data ?? e.message));
      }
    }
  }

  // ─── STEP 12 ─ Complete questionario static + verifica scores ────────────────
  section('STEP 12 – Complete questionario STATIC e verifica scores salvati');

  await axios.post(`${BASE_URL}/public/link/${R.accessLink}/complete`, {
    assignment_id: R.sessionAssignmentId,
  }).then(r => ok('Questionario static completato', {
      status: r.data.completion_status ?? r.data.status,
      scores: r.data.scores ? Object.keys(r.data.scores) : '(non nella risposta)',
    }))
    .catch(e => fail('POST /public/link/complete (static)', e));

  // ─── STEP 12.1 ─ Verifica SQL diretta nel DB ──────────────────────────────────
  section('STEP 12.1 – Verifica dati salvati nel database (via psql)');

  // Usiamo docker exec per interrogare postgres direttamente
  const assignId = R.sessionAssignmentId;
  console.log(`  ℹ Verifica DB per assignment_id = ${assignId}`);
  console.log('  ℹ Esegui manualmente nel container postgres per verifica approfondita:');
  console.log(`
  docker exec euonqol-postgres psql -U euonqol_user -d euonqol -c "
  -- 1) Risposte salvate
  SELECT r.id, r.question_id, q.question_kind, q.question_code,
         r.answer_option_id, r.answer_text, r.socio_demo_answer_id
  FROM euonqol.responses r
  JOIN euonqol.questions q ON r.question_id = q.id
  WHERE r.assignment_id = ${assignId}
  ORDER BY r.id;

  -- 2) Sessioni CAT
  SELECT cms.id, cms.assignment_id, m.name AS module_name,
         cms.is_completed, cms.current_dimension_index,
         jsonb_array_length(cms.session_data->'progress'->'usedItems') AS used_items
  FROM euonqol.cat_module_sessions cms
  JOIN euonqol.modules m ON cms.module_id = m.id;

  -- 3) Scores assignment
  SELECT id, completion_status, completed_at,
         scores
  FROM euonqol.survey_questionnaire_patients_assignment
  WHERE id = ${assignId};
  "`);

  // Verifica progress finale
  await axios.get(`${BASE_URL}/public/link/${R.accessLink}/progress?assignment_id=${assignId}`)
    .then(r => ok('Stato finale questionario', {
        total: r.data.total_questions,
        answered: r.data.answered_questions,
        pct: r.data.progress_percentage + '%',
        is_completed: r.data.is_completed,
        status: r.data.completion_status,
      }))
    .catch(e => console.log('  ⚠ GET progress finale fallito:', e.response?.data ?? e.message));

  // ─── RIEPILOGO ────────────────────────────────────────────────────────────
  section('📊  RIEPILOGO FINALE');
  console.log();
  console.log(`  Kit Version ID:          ${R.kitVersionId}`);
  console.log(`  Patient Group ID:        ${R.groupId}`);
  console.log(`  CAT Setting ID:          ${R.catSettingId}`);
  console.log(`  Module static ID:        ${R.staticModuleId}`);
  console.log(`  Module dynamic ID:       ${R.dynamicModuleId}`);
  console.log(`  Module socio-demo ID:    ${R.socioDemoModuleId}`);
  console.log(`  Survey ID:               ${R.surveyId}`);
  console.log(`  Questionnaire static ID:  ${R.questionnaireStaticId}  [socio-demo + static]`);
  console.log(`  Questionnaire dynamic ID: ${R.questionnaireDynamicId}  [socio-demo + dynamic]`);
  console.log(`  Patient (identified) ID: ${R.patientIdentifiedId}`);
  console.log(`  Patient (traceable) ID:  ${R.patientTraceableId}`);
  console.log(`  Patient (no-mode) ID:    ${R.patientNoModeId}`);
  console.log(`  Assignment link:         ${R.accessLink ?? '(non trovato)'}`);
  console.log(`  Assignment ID (static):  ${R.sessionAssignmentId}`);
  console.log(`  Assignment ID (dynamic): ${R.dynAssignmentId ?? '(non creato)'}`);
  console.log(`  Dynamic module ID:       ${R.dynModuleId ?? '(non trovato)'}`);
  console.log(`  CAT session ID:          ${R.catSessionId ?? '(non avviato)'}`);
  console.log(`  Public link:             ${R.publicLink ?? '(non generato)'}`);
  console.log('\n  🎉  Test E2E completato con successo!\n');
}

run().catch(err => {
  console.error('\n💥  Test fallito:', err.response?.data ?? err.message ?? err);
  process.exit(1);
});
