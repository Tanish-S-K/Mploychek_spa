// server.ts: Core Express backend server managing routing, database schemas, user authentication, SSE notifications, and assistant integration.
// Dependencies: dotenv/config, express-async-errors, path, bcryptjs, cookie-parser, cors, express, jsonwebtoken, mongoose, @google/genai

import 'dotenv/config';
import 'express-async-errors';
import path from 'path';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { Schema, Types } from 'mongoose';

type Role = 'Admin' | 'General User';
type Status = 'Active' | 'Pending' | 'Closed';
type Department = 'Cyber' | 'Marketing' | 'Development' | 'Operations' | 'Finance' | 'Human Resources';
type JobTitle = 'Manager' | 'Junior Engineer' | 'Senior Engineer' | 'Intern' | 'Analyst' | 'Coordinator';
type Auth = { userId: string; role: Role; name: string };

type ChatScope = {
  users: {
    name: string;
    email: string;
    role: Role;
    department: Department;
    jobTitle: JobTitle;
    salary: number;
    active: boolean;
  }[];
  records: {
    id: string;
    title: string;
    description: string;
    status: Status;
    assignedAt: Date;
    assignedTo: string;
  }[];
};

const env = {
  port: Number(process.env.PORT || 4000),
  mongo: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mploycheck',
  jwtSecret: process.env.JWT_SECRET || 'mploycheck-secret',
  jwtExp: process.env.JWT_EXPIRES_IN || '1d',
  assistantKey: process.env.GEMINI_API_KEY || '',
  assistantModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'General User'], required: true },
    department: {
      type: String,
      enum: ['Cyber', 'Marketing', 'Development', 'Operations', 'Finance', 'Human Resources'],
      required: true
    },
    jobTitle: {
      type: String,
      enum: ['Manager', 'Junior Engineer', 'Senior Engineer', 'Intern', 'Analyst', 'Coordinator'],
      required: true
    },
    salary: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const recordSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Active', 'Pending', 'Closed'], required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Record', recordSchema);
const listeners = new Set<Response>();

const departments: Department[] = ['Cyber', 'Marketing', 'Development', 'Operations', 'Finance', 'Human Resources'];
const jobTitles: JobTitle[] = ['Manager', 'Junior Engineer', 'Senior Engineer', 'Intern', 'Analyst', 'Coordinator'];
const statuses: Status[] = ['Active', 'Pending', 'Closed'];

const allowedOrigins = new Set(
  [
    ...(process.env.FRONTEND_URLS || '').split(','),
    process.env.FRONTEND_URL || ''
  ].filter(Boolean)
);

const isAllowedOrigin = (origin?: string) =>
  !origin ||
  allowedOrigins.has(origin) ||
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

const sign = (authPayload: Auth) =>
  jwt.sign(authPayload, env.jwtSecret, {
    expiresIn: env.jwtExp as jwt.SignOptions['expiresIn']
  });

const send = (type: string, userId?: string) =>
  listeners.forEach((res) =>
    res.write(`data:${JSON.stringify({ type, userId })}\n\n`)
  );

const delay = async (req: Request) => {
  const ms = Number(req.query.delay || 0);
  if (ms > 0 && ms < 10000) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
};

const pickUser = (user: globalThis.Record<string, unknown>) => ({
  id: String(user._id),
  username: String(user.username),
  name: String(user.name),
  role: user.role as Role,
  department: user.department as Department,
  jobTitle: user.jobTitle as JobTitle,
  salary: Number(user.salary),
  active: Boolean(user.active),
  createdAt: String(user.createdAt || ''),
});

const pickRecord = (
  record: globalThis.Record<string, unknown> & {
    assignedTo?: globalThis.Record<string, unknown> | Types.ObjectId;
  }
) => ({
  id: String(record._id),
  title: String(record.title),
  description: String(record.description),
  status: record.status as Status,
  assignedTo:
    typeof record.assignedTo === 'object' && record.assignedTo && 'toString' in record.assignedTo
      ? String((record.assignedTo as globalThis.Record<string, unknown>)._id || record.assignedTo)
      : String(record.assignedTo),
  assignedToName:
    typeof record.assignedTo === 'object' && record.assignedTo && 'name' in record.assignedTo
      ? String((record.assignedTo as globalThis.Record<string, unknown>).name)
      : '',
  assignedAt: String(record.assignedAt),
  createdAt: String(record.createdAt || ''),
});

const mockTaskDescriptions = [
  'Perform quarterly background check audit for operation department.',
  'Resolve client onboarding ticket and prepare workflow documentation.',
  'Audit active user access permissions on internal servers.',
  'Coordinate with human resources to update engineer onboarding files.',
  'Validate financial compliance checklist for senior promotions.',
  'Review marketing department campaign delivery milestones.',
  'Verify payroll adjustments for engineering team promotions.',
  'Organize operations sync schedule and prepare meeting minutes.',
  'Review junior developer project proposals and document feedback.',
  'Close resolved verification requests and update database registry.'
];

async function seed() {
  const base = [
    {
      username: 'admin@mploycheck.com',
      name: 'MPloyChek Admin',
      password: 'Admin@123',
      role: 'Admin' as Role,
      department: 'Operations' as Department,
      jobTitle: 'Manager' as JobTitle,
      salary: 50000
    },
    {
      username: 'user1@mploycheck.com',
      name: 'Employee One',
      password: 'User@123',
      role: 'General User' as Role,
      department: 'Development' as Department,
      jobTitle: 'Junior Engineer' as JobTitle,
      salary: 22000
    },
    {
      username: 'user2@mploycheck.com',
      name: 'Employee Two',
      password: 'User@123',
      role: 'General User' as Role,
      department: 'Cyber' as Department,
      jobTitle: 'Analyst' as JobTitle,
      salary: 28000
    },
  ];
  await User.deleteMany({ username: { $nin: base.map((x) => x.username) } });
  const users = await Promise.all(
    base.map(async (user) =>
      User.findOneAndUpdate(
        { username: user.username },
        { ...user, password: await bcrypt.hash(user.password, 10), active: true },
        { upsert: true, returnDocument: 'after' },
      ),
    ),
  );
  await Task.deleteMany({});
  await Task.insertMany(
    Array.from({ length: 10 }, (_, index) => ({
      title: `Staff Record ${index + 1}`,
      description: mockTaskDescriptions[index],
      status: statuses[index % statuses.length],
      assignedTo: users[(index % 2) + 1]._id,
      assignedAt: new Date(),
    })),
  );
}

async function scopeFor(authPayload: Auth): Promise<ChatScope> {
  const [users, records] = await Promise.all([
    User.find(authPayload.role === 'Admin' ? {} : { _id: authPayload.userId }).lean(),
    Task.find(authPayload.role === 'Admin' ? {} : { assignedTo: authPayload.userId })
      .populate('assignedTo', 'name')
      .lean(),
  ]);
  return {
    users: users.map((user) => ({
      name: String(user.name),
      email: String(user.username),
      role: user.role as Role,
      department: user.department as Department,
      jobTitle: user.jobTitle as JobTitle,
      salary: Number(user.salary),
      active: Boolean(user.active),
    })),
    records: records.map((record) => ({
      id: String(record._id),
      title: String(record.title),
      description: String(record.description),
      status: record.status as Status,
      assignedAt: new Date(String(record.assignedAt)),
      assignedTo:
        typeof record.assignedTo === 'object' && record.assignedTo && 'name' in record.assignedTo
          ? String((record.assignedTo as globalThis.Record<string, unknown>).name)
          : '',
    })),
  };
}

function resolveLocalQuery(question: string, scope: ChatScope, role: Role) {
  const q = question.toLowerCase();

  if (q.includes('find') && (q.includes('salary') || q.includes('salaries'))) {
    return 'To find an employee\'s salary, log in as an Admin and view the "Users" list. Each employee\'s salary is displayed under the "Salary" column.';
  }
  if (q.includes('change') && (q.includes('status') || q.includes('task') || q.includes('record'))) {
    return 'To change a task status, log in as an Admin. In the "Records" table, use the select dropdown in the "Status" column to pick a new status (Active, Pending, or Closed).';
  }
  if (q.includes('add') && (q.includes('user') || q.includes('employee') || q.includes('create'))) {
    return 'To add a new user, log in as an Admin and click the "Add User" button. Fill in the name, email, salary, and access details, then click "Create".';
  }
  if (q.includes('search')) {
    return 'To search records or users, type into the search bar marked with a magnifying glass 🔎 located above the respective list.';
  }
  if (q.includes('logout') || q.includes('sign out')) {
    return 'To log out of the portal, click the "Logout" button in the top right corner of the page header.';
  }
  if (q.includes('how to') || q.includes('help') || q.includes('use')) {
    return 'You can search records/users, update task statuses (if Admin), register new employees (if Admin), or view profile statistics. Ask specifically about how to do one of these for step-by-step help.';
  }

  const top = [...scope.users].sort((a, b) => b.salary - a.salary)[0];
  if (q.includes('highest salary')) {
    return top
      ? `${top.name} has the highest salary at $${top.salary.toLocaleString()}.`
      : 'No salary data is available.';
  }
  if (q.includes('active user')) {
    return scope.users.filter((x) => x.active).map((x) => `${x.name} (${x.department})`).join(', ') || 'No active users.';
  }
  if (q.includes('pending')) {
    return scope.records.filter((x) => x.status === 'Pending').map((x) => `${x.title} for ${x.assignedTo}`).join(', ') || 'No pending tasks.';
  }
  if (q.includes('task') || q.includes('assigned')) {
    return scope.records.map((x) => `${x.title} is ${x.status}${role === 'Admin' ? ` for ${x.assignedTo}` : ''}.`).join(' ') || 'No visible tasks.';
  }
  if (q.includes('profile') || q.includes('detail')) {
    const user = scope.users[0];
    return user
      ? `${user.name} is a ${user.jobTitle} in ${user.department} with ${user.role} portal access.`
      : 'No user details are available.';
  }
  return role === 'Admin'
    ? `Portal snapshot: ${scope.users.length} users and ${scope.records.length} tasks are available.`
    : `You currently have ${scope.records.length} visible tasks.`;
}

async function queryAssistant(question: string, authPayload: Auth) {
  const scope = await scopeFor(authPayload);
  if (!env.assistantKey) {
    return resolveLocalQuery(question, scope, authPayload.role);
  }
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: env.assistantKey });
    const response = await client.models.generateContent({
      model: env.assistantModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Guidelines for using the portal UI:
- To view salaries, log in as Admin and read the Users table.
- To change task status, log in as Admin and use the select dropdown under the Status column.
- To add a user, log in as Admin and click the Add User button.
- To search records/users, type into the 🔎 search boxes above the tables.
- To log out, click the Logout button in the header.

Answer using only the database scope and portal guidelines. ${
                authPayload.role === 'Admin' ? 'Admin can see all users.' : 'User can only see their own data.'
              }\nData:${JSON.stringify(scope)}\nQuestion:${question}`
            }
          ]
        }
      ],
    });
    return response.text?.trim() || resolveLocalQuery(question, scope, authPayload.role);
  } catch {
    return resolveLocalQuery(question, scope, authPayload.role);
  }
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cookieParser());
app.use(async (req, _res, next) => {
  await delay(req);
  next();
});

const authGate = async (req: Request & { auth?: Auth }, res: Response, next: NextFunction) => {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.cookies.token;
  if (!raw) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.auth = jwt.verify(raw, env.jwtSecret) as Auth;
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const user = await User.findOne({ username: String(username || '').toLowerCase(), active: true });
  if (!user || !(await bcrypt.compare(String(password || ''), String(user.password)))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const tokenPayload = sign({ userId: String(user._id), role: user.role as Role, name: String(user.name) });
  res.cookie('token', tokenPayload, { httpOnly: true, sameSite: 'lax' });
  res.json({ token: tokenPayload, user: pickUser(user.toObject()) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authGate, async (req: Request & { auth?: Auth }, res) => {
  const user = await User.findById(req.auth!.userId).lean();
  if (!user || !user.active) return res.status(401).json({ message: 'Unauthorized' });
  res.json({ user: pickUser(user) });
});

app.get('/api/records', authGate, async (req: Request & { auth?: Auth }, res) => {
  const query = req.auth!.role === 'Admin' ? {} : { assignedTo: req.auth!.userId };
  const records = await Task.find(query).populate('assignedTo', 'name').sort({ createdAt: -1 }).lean();
  res.json(records.map((x) => pickRecord(x)));
});

app.post('/api/records', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const record = await Task.create({ ...req.body, assignedAt: new Date() });
  const populated = await record.populate('assignedTo', 'name');
  send('records', String((populated.assignedTo as unknown as { _id: Types.ObjectId })._id || populated.assignedTo));
  res.status(201).json(pickRecord(populated.toObject()));
});

app.patch('/api/records/:id', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const record = await Task.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true })
    .populate('assignedTo', 'name')
    .lean();
  if (!record) return res.status(404).json({ message: 'Record not found' });
  send('records', typeof record.assignedTo === 'object' && record.assignedTo ? String((record.assignedTo as { _id: Types.ObjectId })._id) : '');
  res.json(pickRecord(record));
});

app.put('/api/records/:id', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const record = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true })
    .populate('assignedTo', 'name')
    .lean();
  if (!record) return res.status(404).json({ message: 'Record not found' });
  send('records', typeof record.assignedTo === 'object' && record.assignedTo ? String((record.assignedTo as { _id: Types.ObjectId })._id) : '');
  res.json(pickRecord(record));
});

app.delete('/api/records/:id', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const record = await Task.findByIdAndDelete(req.params.id).lean();
  if (!record) return res.status(404).json({ message: 'Record not found' });
  send('records', String(record.assignedTo));
  res.json({ ok: true });
});

app.get('/api/users', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.json(users.map((x) => pickUser(x)));
});

app.post('/api/users', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const data = req.body as {
    username: string;
    name: string;
    password: string;
    role: Role;
    department: Department;
    jobTitle: JobTitle;
    salary: number;
  };
  const user = await User.create({ ...data, password: await bcrypt.hash(data.password, 10), active: true });
  send('users');
  res.status(201).json(pickUser(user.toObject()));
});

app.put('/api/users/:id', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  send('users', String(user._id));
  res.json(pickUser(user));
});

app.delete('/api/users/:id', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin') return res.status(403).json({ message: 'Forbidden' });
  const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true }).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });
  send('users', String(user._id));
  res.json(pickUser(user));
});

app.get('/api/users/:id/records', authGate, async (req: Request & { auth?: Auth }, res) => {
  if (req.auth!.role !== 'Admin' && req.auth!.userId !== req.params.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const records = await Task.find({ assignedTo: req.params.id })
    .populate('assignedTo', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json(records.map((x) => pickRecord(x)));
});

app.post('/api/assistant/chat', authGate, async (req: Request & { auth?: Auth }, res) => {
  res.json({ answer: await queryAssistant(String(req.body.question || ''), req.auth!) });
});

app.get('/api/events', authGate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  listeners.add(res);
  res.write('data:{"type":"ready"}\n\n');
  req.on('close', () => listeners.delete(res));
});

if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../frontend/dist/frontend/browser');
  app.use(express.static(clientPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/events')) return next();
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

mongoose
  .connect(env.mongo)
  .then(seed)
  .then(() =>
    app.listen(env.port, () =>
      console.log(`MPloyChek backend listening on port ${env.port}`)
    )
  )
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
