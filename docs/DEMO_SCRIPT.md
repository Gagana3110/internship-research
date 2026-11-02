# Suggested 6–8 minute demo flow

Use the actual application and database on the presentation machine. Do not state that a test passed unless you run it live or have recorded evidence.

1. **Architecture (45 sec)** — Explain that Express serves the browser UI and API; PostgreSQL stores related entities and business rules; MongoDB stores flexible skills and readiness documents.
2. **ER diagram and constraints (60 sec)** — Show `ER_DIAGRAM.md`, then `schema.sql`. Point out PKs, FKs, unique student/internship pair, CGPA and seat checks. Show `advanced_features.sql` for triggers, audit history, view, function, and indexes.
3. **Authentication (45 sec)** — Sign in as Admin. Show Admin-only management forms. If a student account is available, sign in as Student and show that the student can see only their own application/readiness and cannot change application status.
4. **CRUD workflow (60 sec)** — Create an organization, then an internship with required skills. Explain that the API inserts the internship in PostgreSQL and its skill requirements in MongoDB, using a PostgreSQL transaction and best-effort compensation for a failed MongoDB write.
5. **Application workflow (60 sec)** — Submit an application. As Admin, move it one valid step at a time (Submitted → Under Review → Shortlisted → Selected/Rejected). Demonstrate an invalid jump being rejected. If selected seats fill the internship capacity, show the trigger closing the internship.
6. **Reports (60 sec)** — Run a PostgreSQL report such as Average CGPA by department and a MongoDB report such as Skill demand across internships. If the common-gap report is empty, generate readiness reports for multiple students first.
7. **Novelty feature (60 sec)** — Select a student in Readiness. Explain the level mapping (1–4), capped per-skill ratio, average readiness percentage, Met/Partial/Missing explanation, and saved MongoDB report. Clearly state the team's own real-world motivation/improvement only if it has actually been decided and implemented.
8. **Validation and wrap-up (45 sec)** — Show a relevant test from `TEST_CASES.md`, then mention the ER diagram, data dictionary, report draft, and test matrix included in `docs/`.

## Likely viva questions

- **Why two databases?** PostgreSQL is suitable for structured entities, relationships, constraints, transactions, and SQL reports. MongoDB supports nested and evolving skill arrays and stored analysis documents.
- **What are the advanced SQL features?** Triggers, audit history, view, stored function, indexes/full-text index, and constraints. Point to the actual definitions in `advanced_features.sql`.
- **How is readiness calculated?** For each required skill, score = `min(student_level / required_level, 1)`; readiness is the mean skill score × 100. Explain that this is a heuristic score, not a guarantee of selection.
- **Are PostgreSQL and MongoDB one atomic transaction?** No. PostgreSQL is transactional; the API attempts a compensating delete in MongoDB on failure. This is best-effort cross-database consistency, not a distributed transaction.
- **Is the frontend Next.js?** No; this version uses static HTML/CSS/JavaScript. Confirm the instructor accepts it or implement the required Next.js frontend before final submission.
- **What is the original novelty?** Explain a genuine problem observed with students/placement processes and the specific team-designed improvement. The handoff says this remains to be decided, so do not invent an answer.
