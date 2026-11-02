# Acceptance Test Plan

Run these tests against a local development database populated with sample data. Record the actual result and capture screenshots during the demo. Do not claim a test passed until it has been run on the target machine.

| ID | Area | Action | Expected result |
|---|---|---|---|
| AUTH-01 | Admin login | Sign in with the configured `ADMIN_EMAIL` and `ADMIN_PASSWORD` | Login succeeds; role displays as Admin |
| AUTH-02 | Invalid login | Submit an incorrect password | HTTP 401 with a generic credential error; no session is created |
| AUTH-03 | Student signup | Register with an email already present in an active student record and a password of 10+ characters | Account is created with Student role |
| AUTH-04 | Signup restriction | Register with an email not present in the student table | HTTP 400; no account is created |
| AUTH-05 | Role restriction | While logged in as Student, try POST `/api/students` or PATCH an application status to Selected | HTTP 403 |
| AUTH-06 | Logout | Log out, then request `/api/overview` | Session cookie is cleared; protected API returns HTTP 401 |
| STUD-01 | CGPA validation | Admin creates a student with CGPA 11 | Database rejects the row; API returns a client error |
| STUD-02 | Duplicate student | Create a student with an existing ID/email | Database unique constraint rejects it; API returns HTTP 409 |
| STUD-03 | Soft delete | Admin deactivates a student with DELETE `/api/students/:id` | `is_active` becomes false; existing history is retained |
| SKILL-01 | Skill profile | Save `Python:Advanced, SQL:Intermediate` | MongoDB student profile is created/updated |
| INT-01 | Create internship | Admin adds an internship with an existing organization and required skills | PostgreSQL internship and MongoDB skill document are created; returned IDs match |
| INT-02 | Invalid seats | Create internship with 0 seats | Database check constraint rejects it |
| APP-01 | Apply | Student applies to an open internship | Application is created with Submitted status |
| APP-02 | Duplicate application | Apply twice to the same internship as the same student | Unique constraint rejects duplicate; API returns HTTP 409 |
| APP-03 | Invalid transition | Admin attempts Submitted → Selected directly | API returns HTTP 400; status remains unchanged |
| APP-04 | Withdraw | Student withdraws their own Submitted/Under Review/Shortlisted application | Status becomes Withdrawn |
| APP-05 | Other student's record | Student tries to withdraw another student's application | HTTP 403 |
| SQL-01 | Closed internship | Attempt to apply to a closed internship | Database trigger rejects the application |
| SQL-02 | Selection capacity | Select enough applicants to fill all open seats | Trigger auto-closes the internship |
| REP-01 | SQL reports | Admin opens all six SQL reports | Each report returns a table, including empty-result cases without crashing |
| REP-02 | Mongo skill demand | Admin opens Skill demand across internships | Aggregation returns skill counts |
| REP-03 | Demand vs supply | Admin opens Campus skill demand vs supply | Aggregation returns demand/supply counts |
| REP-04 | Common gaps | Generate readiness reports for multiple students, then open common gaps | Aggregation returns saved-report gap statistics |
| READY-01 | Readiness | Student opens their own readiness page | Score and per-skill explanation are shown; report is saved in MongoDB |
| READY-02 | Privacy | Student requests another student's readiness API endpoint | HTTP 403 |
| RES-01 | Research project | Admin creates a project with a valid faculty member and dates | Project is created |
| RES-02 | Participant uniqueness | Add the same student to the same project twice | Unique constraint rejects duplicate participation |
| DOC-01 | Clean startup | Run `npm test`, then `node server.js` | Syntax checks pass; backend connects to both databases |

## Before presenting

- Record the test date, environment, actual outcome, and evidence filename for each executed test.
- Run the three MongoDB aggregation reports on the actual Windows machine; the original handoff marks them unverified.
- Do not run `node seed.js --force` on any database containing data you need to keep.
