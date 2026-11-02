# Data dictionary (core relational model)

The database column types below are summarized from `schema.sql` and `advanced_features.sql`. Use the SQL files as the authoritative definitions for full constraints and defaults.

| Table | Column | Meaning / rule |
|---|---|---|
| `organization` | `org_id` | Primary key; generated integer |
| `organization` | `name` | Organization name; required and unique |
| `organization` | `industry_sector`, `city` | Required classification and location |
| `organization` | `verification_status` | Pending, Verified, or Blacklisted |
| `faculty` | `faculty_id` | Primary key, e.g. `FAC-0001` |
| `faculty` | `full_name`, `department` | Required faculty identity and department |
| `faculty` | `designation` | Constrained faculty designation |
| `student` | `student_id` | Primary key, format `STU-YYYY-NNNN` |
| `student` | `full_name`, `department` | Required student identity and department |
| `student` | `cgpa` | Numeric CGPA constrained to 0–10 |
| `student` | `email` | Required unique email used for student signup matching |
| `student` | `is_active` | Soft-deactivation flag added by `advanced_features.sql` |
| `internship` | `internship_id` | Primary key; generated integer |
| `internship` | `org_id` | Foreign key to `organization` |
| `internship` | `title`, `mode` | Required title and mode (Remote, On-site, Hybrid) |
| `internship` | `stipend` | Non-negative amount; NULL can represent unpaid |
| `internship` | `open_seats` | Required positive seat count |
| `internship` | `application_deadline` | Required application deadline |
| `internship` | `is_open` | Open/closed flag added by `advanced_features.sql` |
| `research_project` | `project_id` | Primary key; generated integer |
| `research_project` | `lead_faculty_id` | Foreign key to `faculty` |
| `research_project` | `title`, `status` | Project title and constrained status |
| `research_project` | `start_date`, `expected_end_date` | Required dates; end date must be after start date |
| `application` | `application_id` | Primary key; generated integer |
| `application` | `student_id`, `internship_id` | Foreign keys; unique pair prevents duplicate applications |
| `application` | `status` | Constrained workflow status |
| `application` | `applied_at` | Timestamp of application submission |
| `research_participation` | `participation_id` | Primary key; generated integer |
| `research_participation` | `student_id`, `project_id` | Foreign keys; unique pair prevents duplicate membership |
| `research_participation` | `role`, `join_date` | Participant role and join date |
| `application_status_history` | history columns | Audit trail written by application triggers; see SQL definition |
| `app_user` | `user_id` | Primary key; generated integer; created by server startup |
| `app_user` | `email` | Unique login email |
| `app_user` | `password_hash` | Salted scrypt hash; never plaintext |
| `app_user` | `role` | Admin or Student, checked by database constraint |
| `app_user` | `student_id` | Nullable for Admin; required foreign key for Student |

## MongoDB document fields

| Collection | Fields | Meaning |
|---|---|---|
| `internship_details` | `internship_id` | Must match PostgreSQL internship ID |
| `internship_details` | `required_skills[]` | Skill name and level required by an internship |
| `student_profiles` | `student_id` | Must match PostgreSQL student ID |
| `student_profiles` | `skills[]` | Skill name and self-reported proficiency level |
| `skill_gap_reports` | `student_id`, `generated_at` | Student and time the report was generated |
| `skill_gap_reports` | `results[]` | Internship ranking, readiness score, and skill-by-skill breakdown |

Skill levels are Beginner, Intermediate, Advanced, and Expert, mapped to 1–4 for readiness scoring.
