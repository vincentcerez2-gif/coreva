import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const db = new Database('vahub.db');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT CHECK(role IN ('admin', 'employer', 'va')) NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'suspended')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS va_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    headline TEXT,
    bio TEXT,
    hourly_rate REAL,
    monthly_salary REAL,
    availability TEXT,
    experience_years INTEGER,
    id_proof_score INTEGER DEFAULT 0,
    iq_score INTEGER DEFAULT 0,
    english_score INTEGER DEFAULT 0,
    education TEXT,
    last_active TEXT,
    intro_video_url TEXT,
    resume_url TEXT,
    profile_views INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS employer_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    company_name TEXT,
    company_description TEXT,
    website TEXT,
    industry TEXT,
    team_size TEXT,
    logo_url TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    employer_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    salary_min REAL,
    salary_max REAL,
    job_type TEXT,
    experience_level TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'closed')),
    is_featured BOOLEAN DEFAULT 0,
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_user_id TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    va_id TEXT NOT NULL,
    cover_letter TEXT,
    status TEXT DEFAULT 'applied' CHECK(status IN ('applied', 'shortlisted', 'rejected', 'hired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (va_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    employer_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT,
    current_period_end DATETIME,
    FOREIGN KEY (employer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    job_post_limit INTEGER,
    messaging_limit INTEGER,
    candidate_unlock_limit INTEGER,
    featured_jobs_limit INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message_body TEXT NOT NULL,
    is_flagged BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS va_skills (
    id TEXT PRIMARY KEY,
    va_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    years_experience TEXT,
    FOREIGN KEY (va_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS job_skills (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );
`);

// Add columns if they don't exist (for existing DBs)
try { db.exec("ALTER TABLE va_profiles ADD COLUMN id_proof_score INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE va_profiles ADD COLUMN iq_score INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE va_profiles ADD COLUMN english_score INTEGER DEFAULT 0;"); } catch(e) {}
try { db.exec("ALTER TABLE va_profiles ADD COLUMN education TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE va_profiles ADD COLUMN last_active TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE va_profiles ADD COLUMN monthly_salary REAL;"); } catch(e) {}

// Seed default plans if they don't exist
const plansCount = db.prepare('SELECT count(*) as count FROM plans').get() as { count: number };
if (plansCount.count === 0) {
  const insertPlan = db.prepare('INSERT INTO plans (id, name, price, job_post_limit, messaging_limit, candidate_unlock_limit, featured_jobs_limit) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertPlan.run('free', 'Free', 0, 3, 0, 0, 0);
  insertPlan.run('pro', 'PRO', 29, 3, 75, 200, 0);
  insertPlan.run('premium', 'PREMIUM', 39, 10, 500, 200, 2);
} else {
  // Update existing plans to new prices
  db.prepare('UPDATE plans SET price = ?, name = ? WHERE id = ?').run(29, 'PRO', 'pro');
  db.prepare('UPDATE plans SET price = ?, name = ? WHERE id = ?').run(39, 'PREMIUM', 'premium');
}

// Seed admin if not exists
const adminCount = db.prepare('SELECT count(*) as count FROM users WHERE role = ?').get('admin') as { count: number };
if (adminCount.count === 0) {
  db.prepare('INSERT INTO users (id, role, name, email, password, status) VALUES (?, ?, ?, ?, ?, ?)').run(
    'admin-1', 'admin', 'System Admin', 'admin@vahub.com', 'Memyselfandi!1', 'approved'
  );
} else {
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run('Memyselfandi!1', 'admin@vahub.com');
}

// Seed demo accounts
const vaDemoCount = db.prepare('SELECT count(*) as count FROM users WHERE email = ?').get('va@demo.com') as { count: number };
if (vaDemoCount.count === 0) {
  const vaId = 'va-demo-1';
  db.prepare('INSERT INTO users (id, role, name, email, password, status) VALUES (?, ?, ?, ?, ?, ?)').run(
    vaId, 'va', 'Demo VA', 'va@demo.com', 'vademo', 'approved'
  );
  db.prepare('INSERT INTO va_profiles (id, user_id, headline, bio, hourly_rate, monthly_salary, id_proof_score, education, last_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'va-prof-demo', vaId, 'Expert Virtual Assistant', 'I am a demo VA profile with extensive experience in administrative tasks.', 15, 2400, 80, 'Bachelors degree', 'Today'
  );
} else {
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run('vademo', 'va@demo.com');
}

const employerDemoCount = db.prepare('SELECT count(*) as count FROM users WHERE email = ?').get('emp@demo.com') as { count: number };
if (employerDemoCount.count === 0) {
  const empId = 'employer-demo-1';
  db.prepare('INSERT INTO users (id, role, name, email, password, status) VALUES (?, ?, ?, ?, ?, ?)').run(
    empId, 'employer', 'Demo Employer', 'emp@demo.com', 'empdemo', 'approved'
  );
  db.prepare('INSERT INTO employer_profiles (id, user_id, company_name, industry) VALUES (?, ?, ?, ?)').run(
    'emp-prof-demo', empId, 'Demo Corp', 'Technology'
  );
} else {
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run('empdemo', 'emp@demo.com');
}

// Seed provided VAs
const vaProfilesCount = db.prepare('SELECT count(*) as count FROM users WHERE role = ?').get('va') as { count: number };
if (vaProfilesCount.count <= 2) { // Only seed if empty or just the demo
  const insertUser = db.prepare('INSERT INTO users (id, role, name, email, password, status) VALUES (?, ?, ?, ?, ?, ?)');
  const insertProfile = db.prepare(`
    INSERT INTO va_profiles (id, user_id, headline, bio, hourly_rate, monthly_salary, id_proof_score, education, last_active, availability)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSkill = db.prepare('INSERT INTO va_skills (id, va_id, skill_name, years_experience) VALUES (?, ?, ?, ?)');

  const vas = [
    {
      name: 'Oliver',
      headline: 'Web Developer & Designer | Next.js & TypeScript Expert',
      idProof: 70,
      hourly: 4.42,
      monthly: 800,
      education: 'Bachelors degree',
      lastActive: 'Today',
      bio: "I am a versatile Web Developer & Designer who builds high-performance web applications. I don't just write code; I design user-centric interfaces in Figma and bring them to life with modern technologies.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'Figma', exp: '2 - 5 years' },
        { name: 'Next JS', exp: '1 - 2 years' },
        { name: 'Web Development', exp: '2 - 5 years' }
      ]
    },
    {
      name: 'Mika-Ella',
      headline: 'Web Developer',
      idProof: 85,
      hourly: 7.08,
      monthly: 1280,
      education: 'Bachelors degree',
      lastActive: 'Today',
      bio: "Experienced Software Developer and Frontend Developer with expertise in mobile and web application development. Passionate about creating exceptional user experiences through clean and efficient code.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'Javascript', exp: '2 - 5 years' },
        { name: 'React JS', exp: '1 - 2 years' },
        { name: 'TailwindCSS', exp: '1 - 2 years' }
      ]
    },
    {
      name: 'Ashley',
      headline: 'Web Developer/Full stack',
      idProof: 40,
      hourly: 2.12,
      monthly: 384,
      education: 'Bachelors degree',
      lastActive: 'Today',
      bio: "I'm Ashley Durano Rodriguez, Graduated from Cebu Technological University Danao Campus pursuing Bachelor of Science in Information Technology Major in Programming. I am looking for opportunities to grow.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'Web Design & Page Layout', exp: 'Less than 6 months' },
        { name: 'React JS', exp: 'Less than 6 months' },
        { name: 'React Native', exp: 'Less than 6 months' }
      ]
    },
    {
      name: 'Angelito',
      headline: 'Offensive Security Engineer, Data Engineer, Graphic Artist, UI/UX Web Design, Web Developer, Fullstack',
      idProof: 70,
      hourly: 12.39,
      monthly: 2240,
      education: 'Bachelors degree',
      lastActive: 'Today',
      bio: "To be able to work in an environment that provides opportunities to practice my obtained knowledge and skills in the field of Information Technology.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'Graphic Design', exp: '2 - 5 years' },
        { name: 'Data Analytics', exp: '1 - 2 years' },
        { name: 'Cybersecurity', exp: '2 - 5 years' },
        { name: 'Web Development', exp: '2 - 5 years' }
      ]
    },
    {
      name: 'Keito',
      headline: 'SEO Specialist|Web Developer|Technical VA',
      idProof: 80,
      hourly: 5.31,
      monthly: 960,
      education: 'Bachelors degree in Information Technology',
      lastActive: 'Today',
      bio: "Hi, I’m Kit, your new Technical Virtual Assistant. With three years of experience in SEO, web development, technical support, and social media management, I bring a wealth of skills.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'SEO', exp: '2 - 5 years' },
        { name: 'On-Page', exp: '2 - 5 years' },
        { name: 'Wordpress', exp: '2 - 5 years' }
      ]
    },
    {
      name: 'Gerald',
      headline: 'Web Designer/Developer + VA',
      idProof: 85,
      hourly: 8.85,
      monthly: 1600,
      education: 'Bachelors degree',
      lastActive: 'Today',
      bio: "GeralDesign ? Web Designer/Developer | Funnel Designer | WordPress | Virtual Assistant & Personal Assistant. I specialize first and foremost in Web Design and Front-End development.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'Graphic Design', exp: '2 - 5 years' },
        { name: 'Web Design & Page Layout', exp: '2 - 5 years' },
        { name: 'Wordpress', exp: '2 - 5 years' }
      ]
    },
    {
      name: 'Royena',
      headline: 'Web Developer | PHP & WordPress Expert',
      idProof: 60,
      hourly: 5.31,
      monthly: 960,
      education: 'Associates degree',
      lastActive: 'Today',
      bio: "Results-driven Full Stack Web Developer with 5+ years of experience building high-performance websites. Skilled in PHP, WordPress, Laravel, CodeIgniter, and modern frontend frameworks.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'PHP', exp: '2 - 5 years' },
        { name: 'Wordpress', exp: '2 - 5 years' },
        { name: 'CSS', exp: '2 - 5 years' },
        { name: 'HTML', exp: 'Less than 6 months' }
      ]
    },
    {
      name: 'Paul',
      headline: 'Senior Web Developer',
      idProof: 90,
      hourly: 17.70,
      monthly: 3200,
      education: 'Bachelors degree',
      lastActive: 'Today',
      bio: "PHP, Laravel, AWS, MWS, SPAPI, Twilio, Coldfusion, Docker, Wordpress, Opencart, Payment gateways, API development, Html/Html5, Css/Css3/Scss/Sass, Bootstrap, Js, Jquery, Ajax.",
      availability: 'full-time work (8 hours/day)',
      skills: [
        { name: 'PHP', exp: '5+ years' },
        { name: 'Laravel', exp: '5+ years' },
        { name: 'AWS', exp: '2 - 5 years' }
      ]
    }
  ];

  for (const va of vas) {
    const userId = uuidv4();
    const email = `${va.name.toLowerCase().replace(/\s+/g, '')}@demo.com`;
    insertUser.run(userId, 'va', va.name, email, 'demo', 'approved');
    insertProfile.run(uuidv4(), userId, va.headline, va.bio, va.hourly, va.monthly, va.idProof, va.education, va.lastActive, va.availability);
    for (const skill of va.skills) {
      insertSkill.run(uuidv4(), userId, skill.name, skill.exp);
    }
  }
}

// Seed sample jobs
const sampleJobsCount = db.prepare('SELECT count(*) as count FROM jobs').get() as { count: number };
if (sampleJobsCount.count <= 1) { // Only seed if empty or just the one from previous test
  const employerId = 'employer-demo-1';
  const insertJob = db.prepare(`
    INSERT INTO jobs (id, employer_id, title, description, salary_min, salary_max, job_type, experience_level, status, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
  `);

  const jobsData = [
    { id: 'j1', title: 'Warm-Call Appointment Setter – Remote', desc: 'Are you a great communicator who enjoys talking to people and making a positive impact? We are looking for a Warm-Call Appointment Setter to join...', min: 1000, max: 1200, type: 'Full-Time', featured: 1 },
    { id: 'j2', title: 'Warm Call Appointment Setter (NO COLD CALLING!)', desc: 'Are you a great communicator who enjoys talking to people and making a positive impact? We are looking for a Warm-Call Appointment...', min: 1000, max: 1200, type: 'Full-Time', featured: 0 },
    { id: 'j3', title: 'Full-Time Remote Sales Specialist (Chat-Based)', desc: 'We are a growing U.S.-based inventory buying company looking for a full-time chat-based Sales Specialist.', min: 800, max: 2500, type: 'Full-Time', featured: 1 },
    { id: 'j4', title: 'Assistant for Property Management', desc: 'We are seeking an organized and proactive Assistant to support our property management operations.', min: 650, max: 900, type: 'Full-Time', featured: 0 },
    { id: 'j5', title: 'Virtual Real Estate Assistant/Admin', desc: 'The Harbert Real Estate Group is a fast-growing real estate company, and we are currently seeking a dedicated, organized, and proactive Virtual Real Estate Assistant/Admin.', min: 500, max: 500, type: 'Full-Time', featured: 0 },
    { id: 'j6', title: 'Transaction Coordinator (FLUENT ENGLISH)', desc: 'MUST HAVE GREAT ENGLISH AS THIS IS A CLIENT RELATIONS POSITION. Texas-based real estate experience preferred.', min: 650, max: 800, type: 'Full-Time', featured: 0 },
    { id: 'j7', title: 'Multiple Virtual Assistant Roles!', desc: 'Team Growth are expanding. Open Roles: General Admin REVA, Executive Assistant, Marketing/Graphics VA, ISA Caller.', min: 500, max: 1000, type: 'Full-Time', featured: 0 },
    { id: 'j8', title: 'Digital Products VA — Etsy Store Builder', desc: 'We are a growing digital products and e-commerce company. We need someone exceptional to grow with us.', min: 400, max: 700, type: 'Full-Time', featured: 0 },
    { id: 'j9', title: 'Excel & Data Management Virtual Assistant', desc: 'We are looking for a dedicated Virtual Assistant with advanced Excel skills to join our team.', min: 800, max: 800, type: 'Full-Time', featured: 0 },
    { id: 'j10', title: 'Social Media Video Editor (AI TikTok)', desc: 'Hiring immediately! We are looking for a full-time Social Media Content Creator who specializes in creating AI-generated TikTok videos at scale.', min: 700, max: 700, type: 'Full-Time', featured: 1 },
    { id: 'j11', title: 'SALES CLOSER - Buying from Sellers', desc: 'This is NOT a basic Sales VA or admin role. This is a real sales closer position for someone who is hungry and coachable.', min: 800, max: 2500, type: 'Full-Time', featured: 0 },
    { id: 'j12', title: 'Senior Full Stack Developer', desc: 'We’re Acore Technology, a business technology and ERP solutions firm. Custom ERP systems, workflow automation.', min: 850, max: 1625, type: 'Full-Time', featured: 1 },
    { id: 'j13', title: 'Graphic Designer - 3 Month Project', desc: 'Arispheris is looking for a highly skilled and innovative Graphic Designer to join our team for a 3-month full-time project.', min: 700, max: 700, type: 'Full-Time', featured: 0 },
    { id: 'j14', title: 'Life Insurance Salesman', desc: 'All leads are inbound calls to your computer looking for help. Answering client phone calls about premium reduction.', min: 4000, max: 5000, type: 'Gig', featured: 0 },
    { id: 'j15', title: 'Landscape Architect', desc: 'We are seeking a talented and detail-oriented Landscape Architect with at least 5 years of experience.', min: 1000, max: 1500, type: 'Full-Time', featured: 0 },
    { id: 'j16', title: 'Site Planner & Project Manager', desc: 'Responsible for site planning, design, and layout to secure approvals for commercial and industrial projects.', min: 1000, max: 1500, type: 'Full-Time', featured: 0 },
    { id: 'j17', title: 'Figma Web Designer (Real Estate & Construction Brands)', desc: 'Job Title: Figma Web Designer (Real Estate & Construction Brands)\nCompany: JerryCo\n\nJob Type: Project-Based (Long-Term / Full-Time Opportunity)\nLocation: Remote\n\nAbout JerryCo\nJerryCo is a growing marketing and development agency focused on real estate, construction, and service-based brands.', min: 500, max: 500, type: 'Full-Time', featured: 0 },
    { id: 'j18', title: 'Web Designer & Page Builder (WordPress + AI Tools)', desc: "We're a growing US-based digital marketing agency that builds websites and runs SEO for home service contractors (HVAC, roofing, plumbing, electrical). We need a sharp web designer/page builder who can take AI-generated pages from about 90% to 100%.", min: 700, max: 900, type: 'Full-Time', featured: 0 },
    { id: 'j19', title: 'Content Manager: Social Media & Web (WordPress + Elementor)', desc: "We're not looking for someone who's \"pretty good.\" We need someone who's obsessive about details. The kind of person who notices when an image is 2 pixels off. Who reads a caption four times before hitting publish.", min: 0, max: 0, type: 'Part-Time', featured: 0 },
    { id: 'j20', title: 'Hiring: Shopify Web Designer + Amazon Specialist (Hair Brand) – Remote Gig', desc: "IF YOU QUALIFY PLEASE MESSAGE ME ON WHATS APP +14704303083. PLEASE BE READY TO START IMMEDIATELY. We are building and scaling a premium hair company (wigs, bundles, extensions) and are currently hiring.", min: 0, max: 0, type: 'Gig', featured: 0 },
    { id: 'j21', title: 'Web Designer (Squarespace, Wordpress, & Shopify)', desc: "We are seeking a highly skilled and creative Web Designer with expert-level proficiency in Squarespace, Shopify, and WordPress. The ideal candidate will have a strong portfolio showcasing their ability to design visually stunning websites.", min: 1000, max: 2000, type: 'Full-Time', featured: 0 },
    { id: 'j22', title: 'Graphic Designer/Wordpress Website Builder', desc: "We are looking for a creative and detail-oriented Graphic Designer with Web Design experience to join our team. Location: Remote / Hybrid.", min: 780, max: 780, type: 'Full-Time', featured: 0 },
  ];

  for (const job of jobsData) {
    insertJob.run(job.id, employerId, job.title, job.desc, job.min, job.max, job.type, 'Intermediate', job.featured);
  }

  // Seed skills for sample jobs
  const insertJobSkill = db.prepare('INSERT INTO job_skills (id, job_id, skill_name) VALUES (?, ?, ?)');
  const skillsData = [
    { jobId: 'j1', skills: ['Outbound Sales', 'Cold Calling', 'Sales'] },
    { jobId: 'j2', skills: ['Appointment Setting', 'Sales', 'Outbound Calls'] },
    { jobId: 'j3', skills: ['Inbound Sales', 'Outbound Sales', 'Sales'] },
    { jobId: 'j4', skills: ['Real Estate Marketing', 'Customer Support', 'Property Management'] },
    { jobId: 'j10', skills: ['Video Editing', 'Social Media', 'AI Tools'] },
    { jobId: 'j12', skills: ['React JS', 'Next JS', 'Supabase'] },
    { jobId: 'j13', skills: ['Photoshop', 'Graphic Design', 'Canva'] },
    { jobId: 'j17', skills: ['Web Design & Page Layout', 'Figma'] },
    { jobId: 'j18', skills: ['Graphic Design', 'Web Design & Page Layout', 'Wordpress'] },
    { jobId: 'j19', skills: ['Content Management', 'Data Entry', 'Elementor'] },
    { jobId: 'j20', skills: ['Shopify', 'Amazon Specialist'] },
    { jobId: 'j21', skills: ['Shopify', 'Squarespace', 'Wordpress'] },
    { jobId: 'j22', skills: ['Graphic Design', 'Wordpress'] },
  ];

  for (const data of skillsData) {
    for (const skill of data.skills) {
      insertJobSkill.run(uuidv4(), data.jobId, skill);
    }
  }
}

console.log("Database initialized successfully.");

export default db;
