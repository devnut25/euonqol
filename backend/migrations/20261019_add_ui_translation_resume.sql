-- Migration: Add resume-screen key to ui_translations (EK-549)
-- Date: 2026-10-19
--
-- responsesAlreadySaved: label of the resume screen (private link reopened with the
-- questionnaire in progress), followed by the number of responses saved so far,
-- computed by the page ("<label>: 5"). Replaces survey_closing_messages.resume_message
-- (see 20261019_drop_closing_message_resume.sql).
-- Same language matching as 20261015_add_ui_translations.sql.

SET search_path TO euonqol;

BEGIN;

INSERT INTO euonqol.ui_translations (key, language_id, value)
SELECT seed.key, c.id, seed.value
FROM (VALUES
    ('english', 'responsesAlreadySaved', 'Responses already saved'),
    ('italian', 'responsesAlreadySaved', 'Risposte già registrate'),
    ('french', 'responsesAlreadySaved', 'Réponses déjà enregistrées'),
    ('bulgarian', 'responsesAlreadySaved', 'Вече записани отговори'),
    ('georgian', 'responsesAlreadySaved', 'უკვე შენახული პასუხები'),
    ('albanian', 'responsesAlreadySaved', 'Përgjigje të ruajtura tashmë'),
    ('croatian', 'responsesAlreadySaved', 'Već spremljeni odgovori'),
    ('czech', 'responsesAlreadySaved', 'Již uložené odpovědi'),
    ('danish', 'responsesAlreadySaved', 'Allerede gemte svar'),
    ('dutch', 'responsesAlreadySaved', 'Reeds opgeslagen antwoorden'),
    ('estonian', 'responsesAlreadySaved', 'Juba salvestatud vastused'),
    ('finnish', 'responsesAlreadySaved', 'Jo tallennetut vastaukset'),
    ('german', 'responsesAlreadySaved', 'Bereits gespeicherte Antworten'),
    ('greek', 'responsesAlreadySaved', 'Απαντήσεις που έχουν ήδη αποθηκευτεί'),
    ('hungarian', 'responsesAlreadySaved', 'Már mentett válaszok'),
    ('irish', 'responsesAlreadySaved', 'Freagraí sábháilte cheana féin'),
    ('latvian', 'responsesAlreadySaved', 'Jau saglabātās atbildes'),
    ('lithuanian', 'responsesAlreadySaved', 'Jau išsaugoti atsakymai'),
    ('luxemburgish', 'responsesAlreadySaved', 'Scho gespäichert Äntwerten'),
    ('maltese', 'responsesAlreadySaved', 'Tweġibiet diġà ssejvjati'),
    ('norwegian', 'responsesAlreadySaved', 'Allerede lagrede svar'),
    ('polish', 'responsesAlreadySaved', 'Już zapisane odpowiedzi'),
    ('portuguese', 'responsesAlreadySaved', 'Respostas já guardadas'),
    ('romanian', 'responsesAlreadySaved', 'Răspunsuri deja salvate'),
    ('serbian', 'responsesAlreadySaved', 'Već sačuvani odgovori'),
    ('slovak', 'responsesAlreadySaved', 'Už uložené odpovede'),
    ('slovenian', 'responsesAlreadySaved', 'Že shranjeni odgovori'),
    ('spanish', 'responsesAlreadySaved', 'Respuestas ya guardadas'),
    ('swedish', 'responsesAlreadySaved', 'Redan sparade svar'),
    ('turkish', 'responsesAlreadySaved', 'Önceden kaydedilmiş yanıtlar'),
    ('ukrainian', 'responsesAlreadySaved', 'Уже збережені відповіді')
) AS seed(lang, key, value)
JOIN euonqol.eu_countries c
  ON CASE lower(split_part(trim(c.language), '-', 1))
       WHEN 'duch' THEN 'dutch'
       ELSE lower(split_part(trim(c.language), '-', 1))
     END = seed.lang
ON CONFLICT (key, language_id) DO NOTHING;

COMMIT;
