# ER diagram (Mermaid)

```mermaid
erDiagram
  ORGANIZATION ||--o{ INTERNSHIP : offers
  STUDENT ||--o{ APPLICATION : submits
  INTERNSHIP ||--o{ APPLICATION : receives
  FACULTY ||--o{ RESEARCH_PROJECT : leads
  STUDENT ||--o{ RESEARCH_PARTICIPATION : joins
  RESEARCH_PROJECT ||--o{ RESEARCH_PARTICIPATION : includes
  STUDENT ||--o| APP_USER : authenticates_as

  ORGANIZATION {
    int org_id PK
    string name UK
    string industry_sector
    string city
    string verification_status
  }
  FACULTY {
    string faculty_id PK
    string full_name
    string department
    string designation
  }
  STUDENT {
    string student_id PK
    string full_name
    string department
    decimal cgpa
    string email UK
    boolean is_active
  }
  INTERNSHIP {
    int internship_id PK
    int org_id FK
    string title
    string mode
    decimal stipend
    int open_seats
    date application_deadline
    boolean is_open
  }
  APPLICATION {
    int application_id PK
    string student_id FK
    int internship_id FK
    string status
    datetime applied_at
  }
  RESEARCH_PROJECT {
    int project_id PK
    string lead_faculty_id FK
    string title
    string status
    date start_date
    date expected_end_date
  }
  RESEARCH_PARTICIPATION {
    int participation_id PK
    string student_id FK
    int project_id FK
    string role
    date join_date
  }
  APP_USER {
    int user_id PK
    string email UK
    string password_hash
    string role
    string student_id FK
  }
```

`APP_USER` is created by `server.js` at startup. `is_active` and `is_open` are added by `advanced_features.sql`, so apply `schema.sql` first and `advanced_features.sql` second.
