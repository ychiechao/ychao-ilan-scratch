UPDATE `question_results`
SET `status` = 'needs_fix', `updated_at` = CURRENT_TIMESTAMP
WHERE `status` = 'passed' AND `score` = 0;
