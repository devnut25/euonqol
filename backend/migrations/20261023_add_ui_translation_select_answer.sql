-- Migration: Add answer-dropdown placeholder key to ui_translations
-- Date: 2026-10-23
--
-- selectAnswer: placeholder of the dropdown that replaces the radio list on public
-- questionnaire questions with more than 8 single-choice answer options.
-- Same language matching as 20261015_add_ui_translations.sql.

SET search_path TO euonqol;

BEGIN;

INSERT INTO euonqol.ui_translations (key, language_id, value)
SELECT seed.key, c.id, seed.value
FROM (VALUES
    ('english', 'selectAnswer', 'Select an answer'),
    ('italian', 'selectAnswer', 'Seleziona una risposta'),
    ('french', 'selectAnswer', 'Sélectionnez une réponse'),
    ('bulgarian', 'selectAnswer', 'Изберете отговор'),
    ('georgian', 'selectAnswer', 'აირჩიეთ პასუხი'),
    ('albanian', 'selectAnswer', 'Zgjidhni një përgjigje'),
    ('croatian', 'selectAnswer', 'Odaberite odgovor'),
    ('czech', 'selectAnswer', 'Vyberte odpověď'),
    ('danish', 'selectAnswer', 'Vælg et svar'),
    ('dutch', 'selectAnswer', 'Selecteer een antwoord'),
    ('estonian', 'selectAnswer', 'Valige vastus'),
    ('finnish', 'selectAnswer', 'Valitse vastaus'),
    ('german', 'selectAnswer', 'Antwort auswählen'),
    ('greek', 'selectAnswer', 'Επιλέξτε μια απάντηση'),
    ('hungarian', 'selectAnswer', 'Válasszon egy választ'),
    ('irish', 'selectAnswer', 'Roghnaigh freagra'),
    ('latvian', 'selectAnswer', 'Izvēlieties atbildi'),
    ('lithuanian', 'selectAnswer', 'Pasirinkite atsakymą'),
    ('luxemburgish', 'selectAnswer', 'Wielt eng Äntwert'),
    ('maltese', 'selectAnswer', 'Agħżel tweġiba'),
    ('norwegian', 'selectAnswer', 'Velg et svar'),
    ('polish', 'selectAnswer', 'Wybierz odpowiedź'),
    ('portuguese', 'selectAnswer', 'Selecione uma resposta'),
    ('romanian', 'selectAnswer', 'Selectați un răspuns'),
    ('serbian', 'selectAnswer', 'Izaberite odgovor'),
    ('slovak', 'selectAnswer', 'Vyberte odpoveď'),
    ('slovenian', 'selectAnswer', 'Izberite odgovor'),
    ('spanish', 'selectAnswer', 'Seleccione una respuesta'),
    ('swedish', 'selectAnswer', 'Välj ett svar'),
    ('turkish', 'selectAnswer', 'Bir yanıt seçin'),
    ('ukrainian', 'selectAnswer', 'Виберіть відповідь')
) AS seed(lang, key, value)
JOIN euonqol.eu_countries c
  ON CASE lower(split_part(trim(c.language), '-', 1))
       WHEN 'duch' THEN 'dutch'
       ELSE lower(split_part(trim(c.language), '-', 1))
     END = seed.lang
ON CONFLICT (key, language_id) DO NOTHING;

COMMIT;
