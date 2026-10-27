require('dotenv').config();
const express = require('express'), path = require('path');
const { Pool } = require('pg'); const { MongoClient } = require('mongodb');
const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
const pg = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE,
  user: process.env.PGUSER, password: process.env.PGPASSWORD || undefined });
const mc = new MongoClient(process.env.MONGODB_URI); let mdb;
const LV = { Beginner: 1, Intermediate: 2, Advanced: 3, Expert: 4 };
const NEXT = { Submitted: ['Under Review', 'Withdrawn'], 'Under Review': ['Shortlisted', 'Rejected', 'Withdrawn'],
  Shortlisted: ['Selected', 'Rejected', 'Withdrawn'] };
const q = async (sql, p) => (await pg.query(sql, p)).rows;
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e.message);
  const dup = e.code === '23505', chk = e.code === '23514' || e.code === '23503';
  res.status(dup ? 409 : chk ? 400 : e.status || 500).json({ error: dup ? 'Already exists' : e.message }); });

app.get('/health', wrap(async (req, res) => { const [d] = await q('SELECT current_database() db'); await mdb.command({ ping: 1 });
  res.json({ status: 'connected', postgresql: d.db, mongodb: mdb.databaseName }); }));

app.get('/api/overview', wrap(async (req, res) => {
  const [c] = await q(`SELECT (SELECT COUNT(*) FROM student)::int students, (SELECT COUNT(*) FROM internship)::int internships,
    (SELECT COUNT(*) FROM application)::int applications, (SELECT COUNT(*) FROM research_project)::int projects`);
  const collections = await Promise.all(['internship_details', 'student_profiles', 'skill_gap_reports']
    .map(async name => ({ name, documents: await mdb.collection(name).countDocuments() })));
  res.json({ postgresql: { database: process.env.PGDATABASE, ...c }, mongodb: { database: mdb.databaseName, collections } }); }));

app.get('/api/students', wrap(async (req, res) => {
  const rows = await q('SELECT student_id, full_name, department, cgpa, email FROM student ORDER BY full_name');
  const prof = await mdb.collection('student_profiles').find().toArray();
  const m = Object.fromEntries(prof.map(p => [p.student_id, p.skills]));
  res.json(rows.map(r => ({ ...r, skills: m[r.student_id] || [] }))); }));
app.post('/api/students', wrap(async (req, res) => { const b = req.body;
  res.status(201).json((await q('INSERT INTO student (student_id, full_name, department, cgpa, email) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [b.student_id, b.full_name, b.department, b.cgpa, b.email]))[0]); }));
app.put('/api/students/:id/skills', wrap(async (req, res) => {
  if (!(await q('SELECT 1 FROM student WHERE student_id=$1', [req.params.id])).length) throw fail(404, 'Student not found');
  const skills = (req.body.skills || []).filter(s => s.skill && LV[s.level]);
  await mdb.collection('student_profiles').updateOne({ student_id: req.params.id }, { $set: { student_id: req.params.id, skills } }, { upsert: true });
  res.json({ student_id: req.params.id, skills }); }));

app.get('/api/internships', wrap(async (req, res) => {
  const rows = await q(`SELECT i.*, o.name AS organization, o.industry_sector, (SELECT COUNT(*)::int FROM application a WHERE a.internship_id=i.internship_id) AS applications
    FROM internship i JOIN organization o USING (org_id) ORDER BY i.application_deadline`);
  const det = await mdb.collection('internship_details').find().toArray();
  const m = Object.fromEntries(det.map(d => [d.internship_id, d.required_skills]));
  res.json(rows.map(r => ({ ...r, required_skills: m[r.internship_id] || [] }))); }));

app.get('/api/applications', wrap(async (req, res) => res.json(await q(`SELECT a.application_id, s.full_name AS student, i.title AS internship,
  o.name AS organization, a.status, a.applied_at FROM application a JOIN student s USING (student_id)
  JOIN internship i USING (internship_id) JOIN organization o ON o.org_id=i.org_id ORDER BY a.applied_at DESC`))));
app.post('/api/applications', wrap(async (req, res) => { const { student_id, internship_id } = req.body;
  const [i] = await q('SELECT application_deadline FROM internship WHERE internship_id=$1', [internship_id]);
  if (!i) throw fail(404, 'Internship not found');
  if (new Date(i.application_deadline) < new Date(new Date().toDateString())) throw fail(400, 'Application deadline has passed');
  res.status(201).json((await q('INSERT INTO application (student_id, internship_id) VALUES ($1,$2) RETURNING *', [student_id, internship_id]))[0]); }));
app.patch('/api/applications/:id/status', wrap(async (req, res) => {
  const [a] = await q('SELECT status FROM application WHERE application_id=$1', [req.params.id]); if (!a) throw fail(404, 'Not found');
  if (!(NEXT[a.status] || []).includes(req.body.status)) throw fail(400, `Invalid transition: ${a.status} -> ${req.body.status}`);
  res.json((await q('UPDATE application SET status=$1 WHERE application_id=$2 RETURNING *', [req.body.status, req.params.id]))[0]); }));

app.get('/api/projects', wrap(async (req, res) => res.json(await q(`SELECT p.project_id, p.title, p.status, p.start_date, p.expected_end_date,
  f.full_name AS lead_supervisor, COALESCE(json_agg(json_build_object('name', s.full_name, 'role', r.role)) FILTER (WHERE r.student_id IS NOT NULL), '[]') AS participants
  FROM research_project p JOIN faculty f ON f.faculty_id=p.lead_faculty_id
  LEFT JOIN research_participation r ON r.project_id=p.project_id LEFT JOIN student s ON s.student_id=r.student_id
  GROUP BY p.project_id, f.full_name ORDER BY p.project_id`))));

const REPORTS = {
  'Internships per organization': `SELECT o.name AS organization, COUNT(i.internship_id) AS total_internships FROM organization o LEFT JOIN internship i ON o.org_id=i.org_id GROUP BY o.org_id, o.name ORDER BY total_internships DESC`,
  'Applications by status': `SELECT status, COUNT(*) AS total_applications FROM application GROUP BY status ORDER BY total_applications DESC`,
  'Research participation by project': `SELECT rp.title AS research_project, f.full_name AS faculty_supervisor, COUNT(r.participation_id) AS total_students FROM research_project rp JOIN faculty f ON rp.lead_faculty_id=f.faculty_id LEFT JOIN research_participation r ON rp.project_id=r.project_id GROUP BY rp.project_id, rp.title, f.full_name ORDER BY total_students DESC`,
  'Average CGPA by department': `SELECT department, COUNT(*) AS students, ROUND(AVG(cgpa),2) AS average_cgpa FROM student GROUP BY department ORDER BY average_cgpa DESC`,
  'Average stipend by industry sector': `SELECT o.industry_sector, COUNT(*) AS internships, ROUND(AVG(i.stipend),0) AS avg_stipend FROM internship i JOIN organization o ON o.org_id=i.org_id WHERE i.stipend IS NOT NULL GROUP BY o.industry_sector ORDER BY avg_stipend DESC`,
  'Department-wise selection rate': `SELECT s.department, COUNT(*) AS applications, COUNT(*) FILTER (WHERE a.status='Selected') AS selected, ROUND(100.0*COUNT(*) FILTER (WHERE a.status='Selected')/COUNT(*),1) AS selection_rate_pct FROM application a JOIN student s USING (student_id) GROUP BY s.department ORDER BY selection_rate_pct DESC` };
app.get('/api/reports', (req, res) => res.json(Object.keys(REPORTS)));
app.get('/api/reports/:name', wrap(async (req, res) => { if (!REPORTS[req.params.name]) throw fail(404, 'Unknown report'); res.json(await q(REPORTS[req.params.name])); }));

// NOVEL FEATURE - cross-database: internships (PostgreSQL) + required skills & student skills (MongoDB) -> explainable readiness
app.get('/api/readiness/:sid', wrap(async (req, res) => { const sid = req.params.sid;
  const [s] = await q('SELECT student_id, full_name FROM student WHERE student_id=$1', [sid]); if (!s) throw fail(404, 'Student not found');
  const prof = await mdb.collection('student_profiles').findOne({ student_id: sid });
  const have = Object.fromEntries((prof?.skills || []).map(x => [x.skill.toLowerCase(), LV[x.level]]));
  const ints = await q('SELECT i.internship_id, i.title, o.name AS organization FROM internship i JOIN organization o USING (org_id)');
  const results = [];
  for (const i of ints) {
    const d = await mdb.collection('internship_details').findOne({ internship_id: i.internship_id });
    const breakdown = (d?.required_skills || []).map(r => { const need = LV[r.level] || 2, got = have[r.skill.toLowerCase()] || 0;
      return { skill: r.skill, required: r.level || 'Intermediate', student_level: Object.keys(LV).find(k => LV[k] === got) || 'None',
        score: Math.min(got / need, 1), status: got >= need ? 'Met' : got > 0 ? 'Partial' : 'Missing' }; });
    results.push({ ...i, breakdown, readiness: breakdown.length ? Math.round(100 * breakdown.reduce((a, b) => a + b.score, 0) / breakdown.length) : 0 });
  }
  results.sort((a, b) => b.readiness - a.readiness);
  await mdb.collection('skill_gap_reports').updateOne({ student_id: sid }, { $set: { student_id: sid, generated_at: new Date(), results } }, { upsert: true });
  res.json({ student: s, results }); }));

(async () => { try {
  await pg.query('SELECT 1'); console.log('PostgreSQL connected');
  await mc.connect(); mdb = mc.db(process.env.MONGODB_DATABASE); await mdb.command({ ping: 1 }); console.log('MongoDB connected');
  const port = Number(process.env.PORT) || 3000; app.listen(port, () => console.log(`Website running at http://localhost:${port}`));
} catch (e) { console.error('Startup failed:', e.message); process.exit(1); } })();
