// Loads sample data into BOTH databases.  Run once:  node seed.js   (refuses if students already exist; use --force to wipe first)
require('dotenv').config(); const { Pool } = require('pg'); const { MongoClient } = require('mongodb');
const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
(async () => {
  const pg = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD || undefined });
  const mc = new MongoClient(process.env.MONGODB_URI); await mc.connect(); const mdb = mc.db(process.env.MONGODB_DATABASE);
  const { rows: [{ n }] } = await pg.query('SELECT COUNT(*)::int n FROM student');
  if (n > 0 && !process.argv.includes('--force')) { console.log('Tables already have data. Use: node seed.js --force  (this wipes them)'); process.exit(0); }
  await pg.query('TRUNCATE research_participation, application, research_project, internship, student, faculty, organization RESTART IDENTITY CASCADE');
  const run = async (sql, rows) => { for (const r of rows) await pg.query(sql, r); };
  await run('INSERT INTO organization (name, industry_sector, city, verification_status) VALUES ($1,$2,$3,$4)', [
    ['TechNova Solutions', 'IT', 'Bengaluru', 'Verified'], ['BioGen Labs', 'Biotechnology', 'Hyderabad', 'Verified'], ['Embedded Dynamics', 'Electronics', 'Pune', 'Verified']]);
  await run('INSERT INTO faculty VALUES ($1,$2,$3,$4)', [['FAC-0001', 'Dr. Rajesh Kumar', 'CSE', 'Professor'], ['FAC-0002', 'Dr. Priya Menon', 'CSE', 'Associate Professor']]);
  await run('INSERT INTO student VALUES ($1,$2,$3,$4,$5)', [['STU-2022-0001', 'Aarav Sharma', 'CSE', 8.9, 'aarav@uni.edu'], ['STU-2022-0002', 'Diya Nair', 'CSE', 9.2, 'diya@uni.edu'],
    ['STU-2022-0003', 'Rohan Gupta', 'ECE', 7.4, 'rohan@uni.edu'], ['STU-2023-0001', 'Sneha Iyer', 'Biotechnology', 8.1, 'sneha@uni.edu'], ['STU-2023-0002', 'Karthik Reddy', 'CSE', 6.8, 'karthik@uni.edu']]);
  const I = [[1, 'Machine Learning Intern', 'Hybrid', 20000, 2, d(20)], [1, 'Data Engineering Intern', 'Remote', 15000, 3, d(25)],
    [2, 'Bioinformatics Intern', 'On-site', 10000, 2, d(30)], [3, 'Embedded Firmware Intern', 'On-site', 12000, 2, d(15)]];
  await run('INSERT INTO internship (org_id, title, mode, stipend, open_seats, application_deadline) VALUES ($1,$2,$3,$4,$5,$6)', I);
  await run('INSERT INTO research_project (lead_faculty_id, title, status, start_date, expected_end_date) VALUES ($1,$2,$3,$4,$5)', [
    ['FAC-0001', 'Federated Learning for Medical Imaging', 'Ongoing', d(-300), d(120)], ['FAC-0002', 'Intrusion Detection using GNNs', 'Ongoing', d(-150), d(200)]]);
  await run('INSERT INTO application (student_id, internship_id, status) VALUES ($1,$2,$3)', [['STU-2022-0001', 1, 'Shortlisted'], ['STU-2022-0002', 1, 'Submitted'], ['STU-2023-0001', 3, 'Selected'], ['STU-2022-0003', 4, 'Under Review']]);
  await run('INSERT INTO research_participation (student_id, project_id, role) VALUES ($1,$2,$3)', [['STU-2022-0002', 1, 'Lead Researcher'], ['STU-2022-0001', 1, 'Research Assistant'], ['STU-2023-0001', 2, 'Co-Researcher']]);
  const sk = (...a) => a.map(([skill, level]) => ({ skill, level }));
  await mdb.collection('internship_details').deleteMany({}); await mdb.collection('student_profiles').deleteMany({}); await mdb.collection('skill_gap_reports').deleteMany({});
  await mdb.collection('internship_details').insertMany([
    { internship_id: 1, required_skills: sk(['Python', 'Advanced'], ['Machine Learning', 'Intermediate'], ['SQL', 'Intermediate']) },
    { internship_id: 2, required_skills: sk(['Python', 'Intermediate'], ['SQL', 'Advanced'], ['Cloud Computing', 'Intermediate'], ['Docker', 'Beginner']) },
    { internship_id: 3, required_skills: sk(['Bioinformatics Tools', 'Intermediate'], ['Python', 'Intermediate'], ['Statistics', 'Intermediate']) },
    { internship_id: 4, required_skills: sk(['Embedded C', 'Advanced'], ['C/C++', 'Intermediate'], ['Verilog', 'Beginner']) }]);
  await mdb.collection('student_profiles').insertMany([
    { student_id: 'STU-2022-0001', skills: sk(['Python', 'Advanced'], ['SQL', 'Intermediate'], ['Machine Learning', 'Intermediate']) },
    { student_id: 'STU-2022-0002', skills: sk(['Python', 'Expert'], ['Machine Learning', 'Advanced'], ['Statistics', 'Advanced']) },
    { student_id: 'STU-2022-0003', skills: sk(['Embedded C', 'Advanced'], ['C/C++', 'Advanced'], ['Verilog', 'Intermediate']) },
    { student_id: 'STU-2023-0001', skills: sk(['Bioinformatics Tools', 'Advanced'], ['Python', 'Intermediate']) },
    { student_id: 'STU-2023-0002', skills: sk(['SQL', 'Intermediate'], ['Python', 'Beginner']) }]);
  console.log('Seeded PostgreSQL + MongoDB'); await pg.end(); await mc.close();
})().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
