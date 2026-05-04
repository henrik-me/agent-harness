-- Migration: 0001_example (reverse)
-- TODO: customize — reverse everything done in 0001_example.up.sql.
--
-- This file is applied when rolling back. Make sure it fully undoes the forward
-- migration so the database is returned to its pre-0001 state.

DROP TABLE IF EXISTS example;
