import express from "express";
import { createServer as createViteServer } from "vite";
import db from "./src/db.ts";
import { v4 as uuidv4 } from "uuid";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API ROUTES ---

  // Auth
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for: ${email}`);
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
      if (user) {
        console.log(`Login successful for: ${email}`);
        res.json({ user });
      } else {
        console.log(`Login failed for: ${email} - Invalid credentials`);
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (err: any) {
      console.error(`Login error for ${email}:`, err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/register", (req, res) => {
    const { name, email, password, role } = req.body;
    console.log(`Registration attempt for: ${email} as ${role}`);
    const id = uuidv4();
    try {
      db.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)").run(id, name, email, password, role);
      
      if (role === 'va') {
        db.prepare("INSERT INTO va_profiles (id, user_id) VALUES (?, ?)").run(uuidv4(), id);
      } else if (role === 'employer') {
        db.prepare("INSERT INTO employer_profiles (id, user_id) VALUES (?, ?)").run(uuidv4(), id);
      }
      
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      console.log(`Registration successful for: ${email}`);
      res.json({ user });
    } catch (e: any) {
      console.error(`Registration error for ${email}:`, e.message);
      res.status(400).json({ error: e.message.includes("UNIQUE") ? "Email already exists" : "Registration failed" });
    }
  });

  // Jobs
  app.get("/api/jobs", (req, res) => {
    const jobs = db.prepare(`
      SELECT jobs.*, employer_profiles.company_name, employer_profiles.logo_url 
      FROM jobs 
      JOIN employer_profiles ON jobs.employer_id = employer_profiles.user_id
      WHERE jobs.status = 'approved'
      ORDER BY jobs.is_featured DESC, jobs.created_at DESC
    `).all() as any[];

    const jobsWithSkills = jobs.map(job => {
      const skills = db.prepare("SELECT skill_name FROM job_skills WHERE job_id = ?").all(job.id as string) as any[];
      return { ...job, skills: skills.map(s => s.skill_name) };
    });

    res.json(jobsWithSkills);
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = db.prepare(`
      SELECT jobs.*, employer_profiles.company_name, employer_profiles.company_description, employer_profiles.logo_url 
      FROM jobs 
      JOIN employer_profiles ON jobs.employer_id = employer_profiles.user_id
      WHERE jobs.id = ?
    `).get(req.params.id) as any;

    if (!job) return res.status(404).json({ error: "Job not found" });

    const skills = db.prepare("SELECT skill_name FROM job_skills WHERE job_id = ?").all(job.id) as any[];
    res.json({ ...job, skills: skills.map(s => s.skill_name) });
  });

  app.post("/api/applications", (req, res) => {
    const { job_id, va_id, cover_letter } = req.body;
    const id = uuidv4();
    try {
      db.prepare(`
        INSERT INTO applications (id, job_id, va_id, cover_letter)
        VALUES (?, ?, ?, ?)
      `).run(id, job_id, va_id, cover_letter);
      res.json({ id });
    } catch (e) {
      res.status(400).json({ error: "Application failed" });
    }
  });

  app.post("/api/jobs", (req, res) => {
    const { employer_id, title, description, salary_min, salary_max, job_type, experience_level } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO jobs (id, employer_id, title, description, salary_min, salary_max, job_type, experience_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, employer_id, title, description, salary_min, salary_max, job_type, experience_level);
    res.json({ id });
  });

  // Admin
  app.get("/api/admin/stats", (req, res) => {
    const stats = {
      totalVAs: db.prepare("SELECT count(*) as count FROM users WHERE role = 'va'").get() as any,
      totalEmployers: db.prepare("SELECT count(*) as count FROM users WHERE role = 'employer'").get() as any,
      totalJobs: db.prepare("SELECT count(*) as count FROM jobs").get() as any,
      pendingJobs: db.prepare("SELECT count(*) as count FROM jobs WHERE status = 'pending'").get() as any,
    };
    res.json(stats);
  });

  app.get("/api/admin/pending-jobs", (req, res) => {
    const jobs = db.prepare(`
      SELECT jobs.*, employer_profiles.company_name 
      FROM jobs 
      JOIN employer_profiles ON jobs.employer_id = employer_profiles.user_id
      WHERE jobs.status = 'pending'
      ORDER BY jobs.created_at DESC
    `).all();
    res.json(jobs);
  });

  app.post("/api/admin/approve-job", (req, res) => {
    const { id, admin_id } = req.body;
    db.prepare("UPDATE jobs SET status = 'approved' WHERE id = ?").run(id);
    
    db.prepare("INSERT INTO admin_logs (id, admin_id, action_type, description) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), admin_id, 'job_approved', `Approved job: ${id}`);
      
    res.json({ success: true });
  });

  app.post("/api/admin/reject-job", (req, res) => {
    const { id, reason, admin_id } = req.body;
    db.prepare("UPDATE jobs SET status = 'rejected', rejection_reason = ? WHERE id = ?").run(reason, id);
    
    db.prepare("INSERT INTO admin_logs (id, admin_id, action_type, description) VALUES (?, ?, ?, ?)")
      .run(uuidv4(), admin_id, 'job_rejected', `Rejected job: ${id}. Reason: ${reason}`);
      
    res.json({ success: true });
  });

  app.get("/api/admin/users", (req, res) => {
    const { search } = req.query;
    let query = "SELECT id, name, email, role, status, created_at FROM users WHERE role != 'admin'";
    let params: any[] = [];
    
    if (search) {
      query += " AND (name LIKE ? OR email LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const users = db.prepare(query).all(...params);
    res.json(users);
  });

  app.post("/api/admin/update-user-status", (req, res) => {
    const { id, status, admin_id } = req.body;
    db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
    
    db.prepare("INSERT INTO admin_logs (id, admin_id, action_type, target_user_id, description) VALUES (?, ?, ?, ?, ?)")
      .run(uuidv4(), admin_id, 'user_status_updated', id, `Updated user status to ${status}`);
      
    res.json({ success: true });
  });

  app.delete("/api/admin/delete-user", (req, res) => {
    const { id, admin_id } = req.body;
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    
    db.prepare("INSERT INTO admin_logs (id, admin_id, action_type, target_user_id, description) VALUES (?, ?, ?, ?, ?)")
      .run(uuidv4(), admin_id, 'user_deleted', id, `Deleted user: ${id}`);
      
    res.json({ success: true });
  });

  app.get("/api/admin/logs", (req, res) => {
    const logs = db.prepare(`
      SELECT admin_logs.*, users.name as admin_name 
      FROM admin_logs 
      JOIN users ON admin_logs.admin_id = users.id 
      ORDER BY admin_logs.created_at DESC 
      LIMIT 100
    `).all();
    res.json(logs);
  });

  // VA Profiles
  app.get("/api/talents", (req, res) => {
    const profiles = db.prepare(`
      SELECT va_profiles.*, users.name, users.email 
      FROM va_profiles 
      JOIN users ON va_profiles.user_id = users.id
      WHERE users.status = 'approved'
    `).all() as any[];

    const profilesWithSkills = profiles.map(profile => {
      const skills = db.prepare("SELECT skill_name, years_experience FROM va_skills WHERE va_id = ?").all(profile.user_id) as any[];
      return { ...profile, skills };
    });

    res.json(profilesWithSkills);
  });

  // Subscriptions
  app.get("/api/subscriptions", (req, res) => {
    const { employer_id } = req.query;
    const subscription = db.prepare(`
      SELECT subscriptions.*, plans.name as plan_name, plans.price, plans.job_post_limit, plans.messaging_limit
      FROM subscriptions
      JOIN plans ON subscriptions.plan_id = plans.id
      WHERE subscriptions.employer_id = ?
    `).get(employer_id) as any;
    res.json(subscription || { plan_name: 'Free', job_post_limit: 3 });
  });

  app.post("/api/subscriptions/upgrade", (req, res) => {
    const { employer_id, plan_id } = req.body;
    const id = uuidv4();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    db.prepare("DELETE FROM subscriptions WHERE employer_id = ?").run(employer_id);
    db.prepare(`
      INSERT INTO subscriptions (id, employer_id, plan_id, status, current_period_end)
      VALUES (?, ?, ?, 'active', ?)
    `).run(id, employer_id, plan_id, currentPeriodEnd.toISOString());

    res.json({ success: true });
  });

  app.get("/api/employer/applications", (req, res) => {
    const { employer_id } = req.query;
    const applications = db.prepare(`
      SELECT applications.*, users.name as va_name, jobs.title as job_title
      FROM applications
      JOIN users ON applications.va_id = users.id
      JOIN jobs ON applications.job_id = jobs.id
      WHERE jobs.employer_id = ?
      ORDER BY applications.created_at DESC
    `).all(employer_id);
    res.json(applications);
  });

  // Hiring
  app.post("/api/hire", (req, res) => {
    const { application_id, employer_id } = req.body;
    db.prepare("UPDATE applications SET status = 'hired' WHERE id = ?").run(application_id);
    res.json({ success: true });
  });

  app.post("/api/unhire", (req, res) => {
    const { application_id } = req.body;
    db.prepare("UPDATE applications SET status = 'shortlisted' WHERE id = ?").run(application_id);
    res.json({ success: true });
  });

  // VA Profile
  app.get("/api/va/profile/:userId", (req, res) => {
    const profile = db.prepare(`
      SELECT va_profiles.*, users.name, users.email 
      FROM va_profiles 
      JOIN users ON va_profiles.user_id = users.id
      WHERE va_profiles.user_id = ?
    `).get(req.params.userId) as any;
    
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const skills = db.prepare("SELECT skill_name, years_experience FROM va_skills WHERE va_id = ?").all(req.params.userId);
    res.json({ ...profile, skills });
  });

  app.post("/api/va/profile", (req, res) => {
    const { user_id, headline, bio, hourly_rate, monthly_salary, availability, skills } = req.body;
    
    db.prepare(`
      UPDATE va_profiles 
      SET headline = ?, bio = ?, hourly_rate = ?, monthly_salary = ?, availability = ?
      WHERE user_id = ?
    `).run(headline, bio, hourly_rate, monthly_salary, availability, user_id);

    // Update skills
    db.prepare("DELETE FROM va_skills WHERE va_id = ?").run(user_id);
    for (const skill of skills) {
      db.prepare("INSERT INTO va_skills (id, va_id, skill_name, years_experience) VALUES (?, ?, ?, ?)")
        .run(uuidv4(), user_id, skill.skill_name, skill.years_experience);
    }

    res.json({ success: true });
  });

  // Messages
  app.get("/api/messages/:userId", (req, res) => {
    const messages = db.prepare(`
      SELECT messages.*, sender.name as sender_name, receiver.name as receiver_name
      FROM messages
      JOIN users as sender ON messages.sender_id = sender.id
      JOIN users as receiver ON messages.receiver_id = receiver.id
      WHERE sender_id = ? OR receiver_id = ?
      ORDER BY created_at ASC
    `).all(req.params.userId, req.params.userId);
    res.json(messages);
  });

  app.post("/api/messages", (req, res) => {
    const { sender_id, receiver_id, message_body } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, sender_id, receiver_id, message_body)
      VALUES (?, ?, ?, ?)
    `).run(id, sender_id, receiver_id, message_body);
    res.json({ id });
  });

  // Admin Subscriptions Management
  app.get("/api/admin/subscriptions", (req, res) => {
    const subscriptions = db.prepare(`
      SELECT subscriptions.*, users.name as employer_name, users.email as employer_email, plans.name as plan_name
      FROM subscriptions
      JOIN users ON subscriptions.employer_id = users.id
      JOIN plans ON subscriptions.plan_id = plans.id
    `).all();
    res.json(subscriptions);
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
