CREATE TABLE cash_movements (
  id text PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount bigint NOT NULL CHECK (amount > 0),
  date text NOT NULL,
  description text NOT NULL,
  project text REFERENCES projects(id),
  counterparty text NOT NULL,
  method text NOT NULL,
  reference text NOT NULL,
  actor text NOT NULL,
  created text NOT NULL,
  file_id text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL,
  sha256 text NOT NULL
);
CREATE INDEX cash_movements_date ON cash_movements(date);
CREATE INDEX cash_movements_project ON cash_movements(project);
