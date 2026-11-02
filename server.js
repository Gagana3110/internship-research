require('dotenv').config();
const express = require('express'), path = require('path'), crypto = require('crypto');
const { Pool } = require('pg'); const { MongoClient } = require('mongodb');
const app = express(); app.use(express.json({ limit: '1mb' })); app.use(express.static(path.join(__dirname, 'public')));
const sessions = new Map(); // demo-friendly in-memory sessions; use a persistent store for production
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
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
  res.status(dup ? 409 : chk ? 400 : e.status || 500).json({ error: dup ? 'Already exists' : (e.status && e.message) || 'Server error' }); });
const hashPassword = password => new Promise((resolve, reject) => { const salt=crypto.randomBytes(16); crypto.scrypt(password, salt, 64, (e, key) => e ? reject(e) : resolve(`${salt.toString('hex')}$${key.toString('hex')}`)); });
const verifyPassword = (password, stored) => new Promise(resolve => { try { const [saltHex, hashHex]=String(stored||'').split('$'); const salt=Buffer.from(saltHex,'hex'), expected=Buffer.from(hashHex,'hex'); if(salt.length!==16||expected.length!==64)return resolve(false); crypto.scrypt(password,salt,64,(e,key)=>resolve(!e&&crypto.timingSafeEqual(key,expected))); } catch { resolve(false); } });
const requireAdmin = (req, res, next) => req.user?.role === 'Admin' ? next() : res.status(403).json({ error: 'Admin role required' });
app.use('/api', (req, res, next) => {
  if (['/auth/login', '/auth/register', '/auth/logout', '/auth/me'].includes(req.path)) return next();
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('ir_session='))?.slice('ir_session='.length);
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return res.status(401).json({ error: 'Please log in to continue' }); }
  req.user = session.user; session.expires = Date.now() + SESSION_TTL_MS; next();
});
app.post('/api/auth/register', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  if (!email || password.length < 10) throw fail(400, 'Enter your student email and a password of at least 10 characters');
  const [student] = await q('SELECT student_id, email, full_name FROM student WHERE lower(email)=lower($1) AND is_active IS DISTINCT FROM false', [email]);
  if (!student) throw fail(400, 'Use the email address already registered for your student record');
  const password_hash = await hashPassword(password);
  await q('INSERT INTO app_user (email, password_hash, role, student_id) VALUES ($1,$2,$3,$4)', [email, password_hash, 'Student', student.student_id]);
  res.status(201).json({ message: 'Account created. You can now log in.' });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  const [u] = await q("SELECT u.user_id, u.email, u.password_hash, u.role, u.student_id FROM app_user u WHERE lower(u.email)=lower($1) AND (u.role='Admin' OR EXISTS (SELECT 1 FROM student s WHERE s.student_id=u.student_id AND s.is_active IS DISTINCT FROM false))", [email]);
  if (!u || !(await verifyPassword(password, u.password_hash))) throw fail(401, 'Email or password is incorrect');
  const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { user: { user_id: u.user_id, email: u.email, role: u.role, student_id: u.student_id }, expires: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', `ir_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS/1000}`);
  res.json({ user: sessions.get(token).user });
}));
app.post('/api/auth/logout', (req, res) => { const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ir_session='))?.slice('ir_session='.length); if(token) sessions.delete(token); res.setHeader('Set-Cookie','ir_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.json({ message:'Logged out' }); });
app.get('/api/auth/me', (req, res) => { const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ir_session='))?.slice('ir_session='.length); const session=token&&sessions.get(token); if(!session||session.expires<Date.now()) return res.status(401).json({error:'Not logged in'}); res.json({user:session.user}); });

app.get('/health', wrap(async (req, res) => { const [d] = await q('SELECT current_database() db'); await mdb.command({ ping: 1 });
  res.json({ status: 'connected', postgresql: d.db, mongodb: mdb.databaseName }); }));

app.get('/api/overview', wrap(async (req, res) => {
  const [c] = await q(`SELECT (SELECT COUNT(*) FROM student)::int students, (SELECT COUNT(*) FROM internship)::int internships,
    (SELECT COUNT(*) FROM application)::int applications, (SELECT COUNT(*) FROM research_project)::int projects`);
  const collections = await Promise.all(['internship_details', 'student_profiles', 'skill_gap_reports']
    .map(async name => ({ name, documents: await mdb.collection(name).countDocuments() })));
  res.json({ postgresql: { database: process.env.PGDATABASE, ...c }, mongodb: { database: mdb.databaseName, collections } }); }));

app.get('/api/students', wrap(async (req, res) => {
  const rows = req.user.role === 'Admin' ? await q('SELECT student_id, full_name, department, cgpa, email FROM student WHERE is_active IS DISTINCT FROM false ORDER BY full_name') : await q('SELECT student_id, full_name, department, cgpa, email FROM student WHERE student_id=$1 AND is_active IS DISTINCT FROM false', [req.user.student_id]);
  const ids = rows.map(r => r.student_id); const prof = await mdb.collection('student_profiles').find({ student_id: { $in: ids } }).toArray();
  const m = Object.fromEntries(prof.map(p => [p.student_id, p.skills]));
  res.json(rows.map(r => ({ ...r, skills: m[r.student_id] || [] }))); }));
app.post('/api/students', requireAdmin, wrap(async (req, res) => { const b = req.body;
  res.status(201).json((await q('INSERT INTO student (student_id, full_name, department, cgpa, email) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [b.student_id, b.full_name, b.department, b.cgpa, b.email]))[0]); }));
app.put('/api/students/:id/skills', wrap(async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.student_id !== req.params.id) throw fail(403, 'You can edit only your own skills');
  if (!(await q('SELECT 1 FROM student WHERE student_id=$1 AND is_active IS DISTINCT FROM false', [req.params.id])).length) throw fail(404, 'Student not found');
  const skills = (req.body.skills || []).filter(s => s.skill && LV[s.level]);
  await mdb.collection('student_profiles').updateOne({ student_id: req.params.id }, { $set: { student_id: req.params.id, skills } }, { upsert: true });
  res.json({ student_id: req.params.id, skills }); }));

app.put('/api/students/:id', requireAdmin, wrap(async (req, res) => {
  const b=req.body; const rows=await q('UPDATE student SET full_name=$1, department=$2, cgpa=$3, email=$4 WHERE student_id=$5 AND is_active IS DISTINCT FROM false RETURNING student_id,full_name,department,cgpa,email',[b.full_name,b.department,b.cgpa,b.email,req.params.id]);
  if(!rows.length) throw fail(404,'Active student not found'); res.json(rows[0]);
}));
app.delete('/api/students/:id', requireAdmin, wrap(async (req,res)=>{const rows=await q('UPDATE student SET is_active=false WHERE student_id=$1 AND is_active IS DISTINCT FROM false RETURNING student_id',[req.params.id]); if(!rows.length) throw fail(404,'Active student not found'); res.json({message:'Student deactivated',student_id:rows[0].student_id});}));

app.get('/api/internships', wrap(async (req, res) => {
  const rows = await q(`SELECT i.*, o.name AS organization, o.industry_sector, (SELECT COUNT(*)::int FROM application a WHERE a.internship_id=i.internship_id) AS applications
    FROM internship i JOIN organization o USING (org_id) ORDER BY i.application_deadline`);
  const det = await mdb.collection('internship_details').find().toArray();
  const m = Object.fromEntries(det.map(d => [d.internship_id, d.required_skills]));
  res.json(rows.map(r => ({ ...r, required_skills: m[r.internship_id] || [] }))); }));

app.post('/api/internships', requireAdmin, wrap(async (req,res)=>{
  const b=req.body; const skills=Array.isArray(b.required_skills)?b.required_skills:[]; const client=await pg.connect(); let createdId;
  try { await client.query('BEGIN'); const r=await client.query('INSERT INTO internship (org_id,title,mode,stipend,open_seats,application_deadline) VALUES ($1,$2,$3,$4,$5,$6) RETURNING internship_id',[b.org_id,b.title,b.mode,(b.stipend ?? null),b.open_seats,b.application_deadline]); createdId=r.rows[0].internship_id;
    await mdb.collection('internship_details').insertOne({internship_id:createdId,required_skills:skills}); await client.query('COMMIT'); res.status(201).json({message:'Internship created in PostgreSQL and MongoDB',internship_id:createdId});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); if(createdId) await mdb.collection('internship_details').deleteOne({internship_id:createdId}).catch(()=>{}); throw e; } finally { client.release(); }
}));
app.get('/api/organizations', requireAdmin, wrap(async(req,res)=>res.json(await q('SELECT org_id,name,industry_sector,city FROM organization ORDER BY name'))));
app.post('/api/organizations', requireAdmin, wrap(async(req,res)=>{const b=req.body; const [r]=await q('INSERT INTO organization(name,industry_sector,city,verification_status) VALUES($1,$2,$3,$4) RETURNING org_id,name,industry_sector,city',[b.name,b.industry_sector,b.city,b.verification_status||'Pending']);res.status(201).json(r)}));
app.get('/api/faculty', requireAdmin, wrap(async(req,res)=>res.json(await q('SELECT faculty_id,full_name,department FROM faculty ORDER BY full_name'))));

app.get('/api/applications', wrap(async (req, res) => res.json(await q(`SELECT a.application_id, s.full_name AS student, s.student_id, i.title AS internship,
  o.name AS organization, a.status, a.applied_at FROM application a JOIN student s USING (student_id)
  JOIN internship i USING (internship_id) JOIN organization o ON o.org_id=i.org_id ${req.user.role === 'Admin' ? '' : 'WHERE s.student_id=$1'} ORDER BY a.applied_at DESC`, req.user.role === 'Admin' ? [] : [req.user.student_id]))));
app.post('/api/applications', wrap(async (req, res) => { const { internship_id } = req.body; const student_id = req.user.role === 'Admin' ? req.body.student_id : req.user.student_id; if (!student_id) throw fail(400, 'Student account is not linked to a student record');
  const [i] = await q('SELECT application_deadline FROM internship WHERE internship_id=$1', [internship_id]);
  if (!i) throw fail(404, 'Internship not found');
  if (new Date(i.application_deadline) < new Date(new Date().toDateString())) throw fail(400, 'Application deadline has passed');
  res.status(201).json((await q('INSERT INTO application (student_id, internship_id) VALUES ($1,$2) RETURNING *', [student_id, internship_id]))[0]); }));
app.patch('/api/applications/:id/status', wrap(async (req, res) => {
  const [a] = await q('SELECT status,student_id FROM application WHERE application_id=$1', [req.params.id]); if (!a) throw fail(404, 'Not found');
  if (req.user.role !== 'Admin' && (a.student_id !== req.user.student_id || req.body.status !== 'Withdrawn')) throw fail(403, 'Students may withdraw only their own applications');
  if (!(NEXT[a.status] || []).includes(req.body.status)) throw fail(400, `Invalid transition: ${a.status} -> ${req.body.status}`);
  res.json((await q('UPDATE application SET status=$1 WHERE application_id=$2 RETURNING *', [req.body.status, req.params.id]))[0]); }));

app.get('/api/projects', wrap(async (req, res) => res.json(await q(`SELECT p.project_id, p.title, p.status, p.start_date, p.expected_end_date,
  f.full_name AS lead_supervisor, COALESCE(json_agg(json_build_object('name', s.full_name, 'role', r.role)) FILTER (WHERE r.student_id IS NOT NULL), '[]') AS participants
  FROM research_project p JOIN faculty f ON f.faculty_id=p.lead_faculty_id
  LEFT JOIN research_participation r ON r.project_id=p.project_id LEFT JOIN student s ON s.student_id=r.student_id
  GROUP BY p.project_id, f.full_name ORDER BY p.project_id`))));

app.post('/api/projects', requireAdmin, wrap(async(req,res)=>{const b=req.body;const [r]=await q('INSERT INTO research_project(lead_faculty_id,title,status,start_date,expected_end_date) VALUES($1,$2,$3,$4,$5) RETURNING project_id,title,status',[b.lead_faculty_id,b.title,b.status||'Proposed',b.start_date,b.expected_end_date]);res.status(201).json(r)}));
app.post('/api/projects/:id/participants', requireAdmin, wrap(async(req,res)=>{const b=req.body;const [r]=await q('INSERT INTO research_participation(student_id,project_id,role,join_date) VALUES($1,$2,$3,$4) RETURNING participation_id,student_id,project_id,role,join_date',[b.student_id,req.params.id,b.role||'Researcher',b.join_date||new Date().toISOString().slice(0,10)]);res.status(201).json(r)}));

const REPORTS = {
  'Internships per organization': `SELECT o.name AS organization, COUNT(i.internship_id) AS total_internships FROM organization o LEFT JOIN internship i ON o.org_id=i.org_id GROUP BY o.org_id, o.name ORDER BY total_internships DESC`,
  'Applications by status': `SELECT status, COUNT(*) AS total_applications FROM application GROUP BY status ORDER BY total_applications DESC`,
  'Research participation by project': `SELECT rp.title AS research_project, f.full_name AS faculty_supervisor, COUNT(r.participation_id) AS total_students FROM research_project rp JOIN faculty f ON rp.lead_faculty_id=f.faculty_id LEFT JOIN research_participation r ON rp.project_id=r.project_id GROUP BY rp.project_id, rp.title, f.full_name ORDER BY total_students DESC`,
  'Average CGPA by department': `SELECT department, COUNT(*) AS students, ROUND(AVG(cgpa),2) AS average_cgpa FROM student GROUP BY department ORDER BY average_cgpa DESC`,
  'Average stipend by industry sector': `SELECT o.industry_sector, COUNT(*) AS internships, ROUND(AVG(i.stipend),0) AS avg_stipend FROM internship i JOIN organization o ON o.org_id=i.org_id WHERE i.stipend IS NOT NULL GROUP BY o.industry_sector ORDER BY avg_stipend DESC`,
  'Department-wise selection rate': `SELECT s.department, COUNT(*) AS applications, COUNT(*) FILTER (WHERE a.status='Selected') AS selected, ROUND(100.0*COUNT(*) FILTER (WHERE a.status='Selected')/COUNT(*),1) AS selection_rate_pct FROM application a JOIN student s USING (student_id) GROUP BY s.department ORDER BY selection_rate_pct DESC` };
app.get('/api/reports', requireAdmin, (req, res) => res.json(Object.keys(REPORTS)));
app.get('/api/reports/:name', requireAdmin, wrap(async (req, res) => { if (!REPORTS[req.params.name]) throw fail(404, 'Unknown report'); res.json(await q(REPORTS[req.params.name])); }));

// NOVEL FEATURE - cross-database: internships (PostgreSQL) + required skills & student skills (MongoDB) -> explainable readiness
app.get('/api/readiness/:sid', wrap(async (req, res) => { const sid = req.params.sid; if (req.user.role !== 'Admin' && req.user.student_id !== sid) throw fail(403, 'You can view readiness only for your own student account');
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

// MongoDB aggregation pipelines
const AGG = {
  'skill-demand': () => mdb.collection('internship_details').aggregate([
    { $unwind: '$required_skills' },
    { $group: { _id: '$required_skills.skill', internships_requiring: { $sum: 1 }, levels: { $addToSet: '$required_skills.level' } } },
    { $sort: { internships_requiring: -1, _id: 1 } },
    { $project: { _id: 0, skill: '$_id', internships_requiring: 1, levels_asked: '$levels' } }]).toArray(),
  'skill-gap': () => mdb.collection('internship_details').aggregate([       // demand vs supply across campus
    { $unwind: '$required_skills' },
    { $group: { _id: { $toLower: '$required_skills.skill' }, skill: { $first: '$required_skills.skill' }, demand: { $sum: 1 } } },
    { $lookup: { from: 'student_profiles', let: { s: '$_id' }, pipeline: [
        { $unwind: '$skills' }, { $match: { $expr: { $eq: [{ $toLower: '$skills.skill' }, '$$s'] } } }, { $count: 'n' }], as: 'supply' } },
    { $project: { _id: 0, skill: 1, internships_requiring: '$demand', students_with_skill: { $ifNull: [{ $first: '$supply.n' }, 0] } } },
    { $addFields: { shortage: { $subtract: ['$internships_requiring', '$students_with_skill'] } } },
    { $sort: { shortage: -1, skill: 1 } }]).toArray(),
  'common-gaps': () => mdb.collection('skill_gap_reports').aggregate([     // from saved readiness reports
    { $unwind: '$results' }, { $unwind: '$results.breakdown' },
    { $match: { 'results.breakdown.status': { $in: ['Missing', 'Partial'] } } },
    { $group: { _id: '$results.breakdown.skill', students: { $addToSet: '$student_id' }, times_flagged: { $sum: 1 } } },
    { $project: { _id: 0, skill: '$_id', students_affected: { $size: '$students' }, times_flagged: 1 } },
    { $sort: { times_flagged: -1 } }]).toArray() };
app.get('/api/mongo/:name', requireAdmin, wrap(async (req, res) => { const f = AGG[req.params.name]; if (!f) throw fail(404, 'Unknown report'); res.json(await f()); }));

(async () => { try {
  await pg.query('SELECT 1'); console.log('PostgreSQL connected');
  await pg.query(`CREATE TABLE IF NOT EXISTS app_user (user_id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('Admin','Student')), student_id TEXT UNIQUE REFERENCES student(student_id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK ((role='Admin' AND student_id IS NULL) OR (role='Student' AND student_id IS NOT NULL)))`);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) { const h=await hashPassword(process.env.ADMIN_PASSWORD); await pg.query("INSERT INTO app_user(email,password_hash,role,student_id) VALUES(lower($1),$2,'Admin',NULL) ON CONFLICT(email) DO NOTHING",[process.env.ADMIN_EMAIL,h]); console.log('Admin bootstrap checked'); } else console.warn('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create the initial admin account');
  await mc.connect(); mdb = mc.db(process.env.MONGODB_DATABASE); await mdb.command({ ping: 1 }); console.log('MongoDB connected');
  const port = Number(process.env.PORT) || 3000; app.listen(port, () => console.log(`Website running at http://localhost:${port}`));
} catch (e) { console.error('Startup failed:', e.message); process.exit(1); } })();
