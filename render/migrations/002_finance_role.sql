ALTER TABLE members DROP CONSTRAINT members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check
  CHECK (role IN ('admin', 'manager', 'technician', 'finance'));
