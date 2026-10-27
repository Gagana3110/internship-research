-- =====================================================================
-- schema.sql  -  the 7 PostgreSQL tables (run once on an EMPTY database)
--   createdb internship_research_db
--   psql -d internship_research_db -f schema.sql
--   psql -d internship_research_db -f advanced_features.sql
-- =====================================================================

-- ---------- 1. Independent (parent) tables ----------
CREATE TABLE organization (
    org_id               SERIAL        PRIMARY KEY,
    name                 VARCHAR(150)  NOT NULL UNIQUE,
    industry_sector      VARCHAR(80)   NOT NULL,
    city                 VARCHAR(80)   NOT NULL,
    verification_status  VARCHAR(12)   NOT NULL DEFAULT 'Pending',
    CONSTRAINT chk_org_status
        CHECK (verification_status IN ('Pending', 'Verified', 'Blacklisted'))
);

CREATE TABLE faculty (
    faculty_id   VARCHAR(10)   PRIMARY KEY,            -- e.g. FAC-0001
    full_name    VARCHAR(120)  NOT NULL,
    department   VARCHAR(80)   NOT NULL,
    designation  VARCHAR(30)   NOT NULL,
    CONSTRAINT chk_designation
        CHECK (designation IN ('Professor', 'Associate Professor',
                               'Assistant Professor', 'Lecturer'))
);

CREATE TABLE student (
    student_id  VARCHAR(13)   PRIMARY KEY,             -- e.g. STU-2022-0001
    full_name   VARCHAR(120)  NOT NULL,
    department  VARCHAR(80)   NOT NULL,
    cgpa        NUMERIC(4,2)  NOT NULL,
    email       VARCHAR(150)  NOT NULL UNIQUE,
    CONSTRAINT chk_student_id_format CHECK (student_id ~ '^STU-[0-9]{4}-[0-9]{4}$'),
    CONSTRAINT chk_cgpa_range        CHECK (cgpa BETWEEN 0.00 AND 10.00)
);

-- ---------- 2. Tables that reference the parents ----------
CREATE TABLE internship (
    internship_id         SERIAL         PRIMARY KEY,
    org_id                INT            NOT NULL
                          REFERENCES organization(org_id) ON DELETE RESTRICT,   -- Offers (1:N)
    title                 VARCHAR(150)   NOT NULL,
    mode                  VARCHAR(10)    NOT NULL,
    stipend               NUMERIC(10,2),                                        -- NULL = unpaid
    open_seats            INT            NOT NULL,
    application_deadline  DATE           NOT NULL,
    CONSTRAINT chk_mode   CHECK (mode IN ('Remote', 'On-site', 'Hybrid')),
    CONSTRAINT chk_stipend CHECK (stipend IS NULL OR stipend >= 0),
    CONSTRAINT chk_seats  CHECK (open_seats > 0)
);

CREATE TABLE research_project (
    project_id         SERIAL        PRIMARY KEY,
    lead_faculty_id    VARCHAR(10)   NOT NULL
                       REFERENCES faculty(faculty_id) ON DELETE RESTRICT,       -- Supervises (1:N)
    title              VARCHAR(200)  NOT NULL,
    status             VARCHAR(12)   NOT NULL DEFAULT 'Proposed',
    start_date         DATE          NOT NULL,
    expected_end_date  DATE          NOT NULL,
    CONSTRAINT chk_project_status CHECK (status IN ('Proposed','Ongoing','Completed','Discontinued')),
    CONSTRAINT chk_project_dates  CHECK (expected_end_date > start_date)
);

-- ---------- 3. Junction tables (resolve the M:N relationships) ----------
CREATE TABLE application (                                                      -- Applies (M:N)
    application_id  SERIAL       PRIMARY KEY,
    student_id      VARCHAR(13)  NOT NULL REFERENCES student(student_id)       ON DELETE RESTRICT,
    internship_id   INT          NOT NULL REFERENCES internship(internship_id) ON DELETE RESTRICT,
    status          VARCHAR(15)  NOT NULL DEFAULT 'Submitted',
    applied_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_app_status CHECK (status IN ('Submitted','Under Review','Shortlisted',
                                                'Selected','Rejected','Withdrawn')),
    CONSTRAINT uq_student_internship UNIQUE (student_id, internship_id)         -- one application each
);

CREATE TABLE research_participation (                                           -- Participates (M:N)
    participation_id  SERIAL       PRIMARY KEY,
    student_id        VARCHAR(13)  NOT NULL REFERENCES student(student_id)           ON DELETE RESTRICT,
    project_id        INT          NOT NULL REFERENCES research_project(project_id)  ON DELETE RESTRICT,
    role              VARCHAR(20)  NOT NULL,
    join_date         DATE         NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT chk_role CHECK (role IN ('Lead Researcher','Co-Researcher','Research Assistant')),
    CONSTRAINT uq_student_project UNIQUE (student_id, project_id)
);

-- ---------- 4. Indexes on foreign keys (speed up joins) ----------
CREATE INDEX idx_internship_org   ON internship (org_id);
CREATE INDEX idx_project_lead     ON research_project (lead_faculty_id);
CREATE INDEX idx_app_internship   ON application (internship_id);
CREATE INDEX idx_part_project     ON research_participation (project_id);

