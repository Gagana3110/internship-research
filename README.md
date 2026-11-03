# Internship & Research Management System

A university project that manages internship applications and faculty-led research activity using **PostgreSQL + MongoDB**, with a Node.js/Express API and browser-based interface.

## Features

- Dashboard with PostgreSQL and MongoDB counts.
- Student management, student skill profiles, internship listings and applications.
- Admin and Student accounts with role checks in the API.
- Salted password hashing with Node's built-in `crypto.scrypt` and an HTTP-only session cookie.
- Application status workflow and database triggers/audit history.
- Admin forms for organizations, internships, research projects and research participants.
- Six PostgreSQL reports and three MongoDB aggregation reports.
- Cross-database internship readiness feature with per-skill explanations and saved skill-gap reports.
- Soft deactivation of students, edit forms, application withdrawal, and best-effort compensation if internship creation fails across databases.

## Tech stack

- Node.js + Express
- PostgreSQL (`pg`)
- MongoDB (`mongodb`)
- Static HTML/CSS/JavaScript frontend served by Express

> **Course requirement to confirm:** the handoff says the course brief names Next.js, while this implementation uses plain HTML. Ask the instructor whether this is acceptable before the final presentation.

## Prerequisites

Install Node.js 18+, PostgreSQL, and MongoDB Community Server. Start both database services before starting the app.

## Windows setup (Command Prompt)

1. Open CMD in the project folder (the folder containing `server.js` and `package.json`).
2. Install packages:

   ```bat
   npm install
   ```

3. Create your local environment file:

   ```bat
   copy .env.example .env
   notepad .env
   ```

4. Edit `.env` with your actual PostgreSQL username/password. Set a unique admin email and a strong, unique admin password. **Never commit `.env` or share its contents.** The server creates the `app_user` table and initial Admin account at startup, if the configured admin email is not already present.
5. Confirm `.env` contains `PGDATABASE=internship_research_db` and `MONGODB_DATABASE=internship_research_nosql`.
6. Create the PostgreSQL database if this is a fresh setup:

   ```bat
   "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres internship_research_db
   ```

   If the database already exists, skip this step. Adjust `17` if another PostgreSQL major version is installed.
7. Apply SQL files in order (the original project database already set up on your machine does not need to be recreated):

   ```bat
   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d internship_research_db -f schema.sql
   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d internship_research_db -f advanced_features.sql
   ```

   These commands prompt for the PostgreSQL password. Do not rerun the base schema against an already-populated database unless you know how your local SQL scripts handle existing objects.
8. Set up MongoDB indexes and sample data for a new database:

   ```bat
   node mongo_setup.js
   node seed.js
   ```

   Do **not** run `node seed.js --force` unless you intentionally want to wipe sample tables/documents. Since your local dashboard already showed the expected sample counts, you can skip the SQL setup and seeding steps on that existing working database.
9. Run syntax checks, then start the server:

   ```bat
   npm test
   node server.js
   ```

10. Open `http://localhost:3000`. Sign in using the configured Admin credentials. Student registration works only for an email already present in an active `student` record.

## Environment variables

See `.env.example`. Required values include PostgreSQL host/port/database/user, MongoDB URI/database, and port. `ADMIN_EMAIL` and `ADMIN_PASSWORD` bootstrap the initial Admin account on first startup. The configured Admin password is not reset automatically if an account with that email already exists; change it through a reviewed password-reset procedure if necessary.

## Database design

PostgreSQL tables: `organization`, `faculty`, `student`, `internship`, `research_project`, `application`, `research_participation`, plus `application_status_history` and `app_user`.

MongoDB collections: `internship_details`, `student_profiles`, `skill_gap_reports`.

Read `docs/ER_DIAGRAM.md` for the ER diagram and `docs/PROJECT_REPORT.md` for the report draft. Read `docs/TEST_CASES.md` and execute the tests before the demo.

## Security and demo limitations

- The app uses in-memory sessions, so active sessions end when the Node process restarts. This is acceptable for a local demo but not production-ready.
- For production, add HTTPS, a persistent session store, CSRF protection, login rate limiting, password recovery, and a security review.
- PostgreSQL and MongoDB do not provide one shared distributed transaction here. Internship creation uses a PostgreSQL transaction and best-effort MongoDB compensation if the write fails.
- Reports should be tested on the target machine; the original handoff marked MongoDB aggregations unverified.

## Git workflow

Before committing, run `git status` and confirm `.env` is ignored. Commit only project files, not credentials, `node_modules`, local database dumps, or screenshots containing secrets. Use your own Git identity and commit only the work you actually performed. Push to a branch and open a pull request if that is your team's workflow.
