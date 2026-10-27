-- Rollback: 20261016_add_ui_translations_a11y.sql

SET search_path TO euonqol;

DELETE FROM euonqol.ui_translations
WHERE key IN ('a11yMenu', 'a11yTextSize', 'a11yIncreaseText', 'a11yDecreaseText', 'a11yContrast', 'a11yGrayscale', 'a11yHighlightLinks', 'a11yStopAnimations', 'a11yReset', 'a11yKeyboardTitle', 'a11yKeyTab', 'a11yKeyShiftTab', 'a11yKeyEnter', 'a11yKeyEscape', 'a11yScreenReaderNote');
