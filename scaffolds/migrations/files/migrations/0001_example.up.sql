-- Migration: 0001_example (forward)
-- TODO: customize — replace the statements below with your actual schema change.
--
-- This file is applied first. Keep it idempotent where possible.
-- Pair: 0001_example.down.sql must reverse everything done here.

CREATE TABLE IF NOT EXISTS example (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL
);
