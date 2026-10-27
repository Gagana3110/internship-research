// Creates MongoDB indexes. Run once:  node mongo_setup.js
require('dotenv').config(); const { MongoClient } = require('mongodb');
(async () => {
  const mc = new MongoClient(process.env.MONGODB_URI); await mc.connect(); const db = mc.db(process.env.MONGODB_DATABASE);
  const idx = [['internship_details', { internship_id: 1 }, { unique: true }], ['internship_details', { 'required_skills.skill': 1 }, {}],
    ['student_profiles', { student_id: 1 }, { unique: true }], ['student_profiles', { 'skills.skill': 1 }, {}],
    ['skill_gap_reports', { student_id: 1 }, { unique: true }], ['skill_gap_reports', { generated_at: -1 }, {}]];
  for (const [c, k, o] of idx) console.log(c.padEnd(20), await db.collection(c).createIndex(k, o));
  await mc.close();
})().catch(e => { console.error('Index setup failed:', e.message); process.exit(1); });
