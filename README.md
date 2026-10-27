# Internship & Research Management System

A DBMS Level 3 project that manages student internships and research activity using **two databases**:

- **PostgreSQL (RDBMS):** students, faculty, organizations, internships, applications, research projects, participation.
- **MongoDB (NoSQL):** required skills per internship, student skill profiles, and generated skill-gap reports.
- **Node.js + Express:** backend API that connects both databases and serves the website.

## Features
- Dashboard showing PostgreSQL record counts and MongoDB collection counts
- Students, internships, applications and research projects pages
- Application workflow with validated status transitions (enforced by database triggers)
- 6 SQL reports (GROUP BY, HAVING, aggregates, joins)
- **Internship Readiness (novelty):** compares internships (PostgreSQL) with required skills and a student's skills (MongoDB), and produces an explainable, skill-by-skill readiness score

## Database design
- 7 tables: `organization`, `faculty`, `student`, `internship`, `research_project`, `application`, `research_participation`
- Advanced SQL: 3 triggers, 1 view, 1 stored function, indexes (including full-text), audit table `application_status_history`
- MongoDB collections: `internship_details`, `student_profiles`, `skill_gap_reports`

## Setup
**Prerequisites:** Node.js 18+, PostgreSQL, MongoDB (running locally).

```bash
git clone <repo-url>
cd <repo-folder>
npm install

cp .env.example .env          # then edit .env with your own values

createdb internship_research_db
psql -d internship_research_db -f schema.sql
psql -d internship_research_db -f advanced_features.sql

node seed.js                  # loads sample data into both databases
node server.js                # starts the website
```
Open http://localhost:3000

## Project structure
```
server.js                API + static file server
seed.js                  sample data for PostgreSQL and MongoDB
schema.sql               CREATE TABLE statements
advanced_features.sql    ALTER, triggers, view, function, indexes
public/index.html        website
.env.example             required environment variables
```

## Team
| Member | Responsibilities |
|---|---|
| (name) | (e.g. SQL schema, triggers, reports) |
| (name) | (e.g. MongoDB, website, readiness feature) |
