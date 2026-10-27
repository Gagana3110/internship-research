-- =====================================================================
-- advanced_features.sql  -  ALTER, triggers, view, function, indexes, transaction
-- Safe to run more than once. Run:
--   psql -U gagana -d internship_research_db -f advanced_features.sql
-- =====================================================================

-- ---------- 1. ALTER TABLE (DDL) ----------
ALTER TABLE internship ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE student    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;  -- soft delete

-- ---------- 2. New table: audit trail of every status change ----------
CREATE TABLE IF NOT EXISTS application_status_history (
    history_id     SERIAL       PRIMARY KEY,
    application_id INT          NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
    old_status     VARCHAR(15),
    new_status     VARCHAR(15)  NOT NULL,
    changed_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- 3. TRIGGER A: block applications to closed internships ----------
CREATE OR REPLACE FUNCTION fn_block_closed_internship() RETURNS trigger AS $$
BEGIN
    IF NOT (SELECT is_open FROM internship WHERE internship_id = NEW.internship_id) THEN
        RAISE EXCEPTION 'Internship % is closed to new applications', NEW.internship_id;
    END IF;
    IF NOT (SELECT is_active FROM student WHERE student_id = NEW.student_id) THEN
        RAISE EXCEPTION 'Student % is inactive', NEW.student_id;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_closed ON application;
CREATE TRIGGER trg_block_closed BEFORE INSERT ON application
    FOR EACH ROW EXECUTE FUNCTION fn_block_closed_internship();

-- ---------- 4. TRIGGER B: only allow valid status transitions ----------
CREATE OR REPLACE FUNCTION fn_validate_transition() RETURNS trigger AS $$
DECLARE v_ok BOOLEAN;
BEGIN
    v_ok := CASE OLD.status
        WHEN 'Submitted'    THEN NEW.status IN ('Under Review', 'Withdrawn')
        WHEN 'Under Review' THEN NEW.status IN ('Shortlisted', 'Rejected', 'Withdrawn')
        WHEN 'Shortlisted'  THEN NEW.status IN ('Selected', 'Rejected', 'Withdrawn')
        ELSE FALSE END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_transition ON application;
CREATE TRIGGER trg_validate_transition BEFORE UPDATE OF status ON application
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fn_validate_transition();

-- ---------- 5. TRIGGER C: log history + auto-close when all seats are filled ----------
CREATE OR REPLACE FUNCTION fn_after_application() RETURNS trigger AS $$
DECLARE v_seats INT; v_taken INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO application_status_history (application_id, old_status, new_status)
        VALUES (NEW.application_id, NULL, NEW.status);
    ELSE
        INSERT INTO application_status_history (application_id, old_status, new_status)
        VALUES (NEW.application_id, OLD.status, NEW.status);
        IF NEW.status = 'Selected' THEN
            SELECT open_seats INTO v_seats FROM internship WHERE internship_id = NEW.internship_id;
            SELECT COUNT(*) INTO v_taken FROM application
             WHERE internship_id = NEW.internship_id AND status = 'Selected';
            IF v_taken >= v_seats THEN
                UPDATE internship SET is_open = FALSE WHERE internship_id = NEW.internship_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_insert ON application;
DROP TRIGGER IF EXISTS trg_after_update ON application;
CREATE TRIGGER trg_after_insert AFTER INSERT ON application
    FOR EACH ROW EXECUTE FUNCTION fn_after_application();
CREATE TRIGGER trg_after_update AFTER UPDATE OF status ON application
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION fn_after_application();

-- Record the status of applications that already exist (only on the first run)
INSERT INTO application_status_history (application_id, old_status, new_status, changed_at)
SELECT application_id, NULL, status, applied_at FROM application
 WHERE NOT EXISTS (SELECT 1 FROM application_status_history);

-- ---------- 6. VIEW: application summary per internship ----------
CREATE OR REPLACE VIEW v_application_summary AS
SELECT i.internship_id, i.title, o.name AS organization, i.open_seats,
       COUNT(a.application_id)                                   AS total_applications,
       COUNT(*) FILTER (WHERE a.status = 'Shortlisted')          AS shortlisted,
       COUNT(*) FILTER (WHERE a.status = 'Selected')             AS selected,
       COUNT(*) FILTER (WHERE a.status = 'Rejected')             AS rejected,
       COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'Rejected')
                      / NULLIF(COUNT(a.application_id), 0), 1), 0) AS rejection_rate_pct
  FROM internship i
  JOIN organization o ON o.org_id = i.org_id
  LEFT JOIN application a ON a.internship_id = i.internship_id
 GROUP BY i.internship_id, i.title, o.name, i.open_seats;

-- ---------- 7. STORED FUNCTION: selection rate of a department ----------
CREATE OR REPLACE FUNCTION fn_selection_rate(p_department VARCHAR) RETURNS NUMERIC AS $$
    SELECT COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'Selected')
                          / NULLIF(COUNT(*), 0), 1), 0)
      FROM application a JOIN student s ON s.student_id = a.student_id
     WHERE s.department = p_department;
$$ LANGUAGE sql STABLE;

-- ---------- 8. INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_app_student       ON application (student_id, status);
CREATE INDEX IF NOT EXISTS idx_app_internship2   ON application (internship_id, status);
CREATE INDEX IF NOT EXISTS idx_history_app       ON application_status_history (application_id);
CREATE INDEX IF NOT EXISTS idx_internship_fts    ON internship USING GIN (to_tsvector('english', title));  -- full-text search
CREATE INDEX IF NOT EXISTS idx_student_dept      ON student (department);

SELECT 'advanced features installed' AS result;
