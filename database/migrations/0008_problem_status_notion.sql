UPDATE problems SET status = 'Not started' WHERE status IN ('Unsolved', 'unsolved');
UPDATE problems SET status = 'Revision needed' WHERE status IN ('Attempted', 'attempted');
