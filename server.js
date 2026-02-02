require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const { initDb, registerDevice, getDeviceByToken, getUsage, incrementUsage, updatePlan, getResetDate } = require('./db');
const { authenticate, checkUsage, FREE_TIER_LIMIT } = require('./auth');
const { analyzeDocument, generateDraft } = require('./claude');

const app = express();
const PORT = parseInt(process.env.PORT || '3334', 10);

// --- Middleware ---

app.use(cors());
app.use(express.json({ limit: '12mb' })); // 10MB image + overhead

// Per-device rate limiter (keyed by Bearer token)
const perDeviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN || '10', 10),
  keyGenerator: (req) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    // Normalize IPv6-mapped IPv4
    const ip = req.ip || '0.0.0.0';
    return ip.replace(/^::ffff:/, '');
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute.' },
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
});
app.use('/api/', perDeviceLimiter);

// --- Health ---

app.get('/health', (_req, res) => {
  console.log('🏥 Health check requested');
  res.json({ 
    status: 'ok', 
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// --- 1. Register device ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 256) {
      return res.status(400).json({ error: 'deviceId is required (string, max 256 chars)' });
    }

    const token = uuidv4();
    const device = await registerDevice(deviceId, token);
    const usage = await getUsage(device.device_id);
    const actionsRemaining = device.plan === 'pro' ? -1 : Math.max(0, FREE_TIER_LIMIT - usage.actions_used);

    res.json({
      token: device.token,
      plan: device.plan,
      actionsRemaining,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- 2. Analyze document ---

app.post('/api/analyze', authenticate, checkUsage, async (req, res) => {
  try {
    const { image, filename, mimeType } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'image (base64 string) is required' });
    }
    if (!mimeType || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
      return res.status(400).json({ error: 'mimeType must be image/jpeg, image/png, image/webp, or image/gif' });
    }
    // Check ~10MB base64 limit (base64 is ~33% larger than binary)
    if (image.length > 14_000_000) {
      return res.status(413).json({ error: 'Image too large. Max 10MB.' });
    }

    const tasks = await analyzeDocument(image, mimeType);
    await incrementUsage(req.device.device_id);

    const updatedUsage = await getUsage(req.device.device_id);
    const actionsRemaining = req.device.plan === 'pro' ? -1 : Math.max(0, FREE_TIER_LIMIT - updatedUsage.actions_used);

    res.json({
      tasks,
      usage: {
        plan: req.device.plan,
        actionsUsed: updatedUsage.actions_used,
        actionsRemaining,
      },
    });
  } catch (err) {
    console.error('Analyze error:', err);
    if (err.status === 401) return res.status(502).json({ error: 'Invalid API key configured on server' });
    if (err.status === 429) return res.status(502).json({ error: 'Upstream rate limit. Try again shortly.' });
    res.status(500).json({ error: 'Failed to analyze document' });
  }
});

// --- 3. Generate draft ---

app.post('/api/draft', authenticate, checkUsage, async (req, res) => {
  try {
    const { task, draftType } = req.body;

    if (!task || typeof task !== 'object' || !task.title) {
      return res.status(400).json({ error: 'task object with at least a title is required' });
    }
    if (!draftType || !['email', 'letter', 'form', 'appeal'].includes(draftType)) {
      return res.status(400).json({ error: 'draftType must be one of: email, letter, form, appeal' });
    }

    const draft = await generateDraft(task, draftType);
    await incrementUsage(req.device.device_id);

    const updatedUsage = await getUsage(req.device.device_id);
    const actionsRemaining = req.device.plan === 'pro' ? -1 : Math.max(0, FREE_TIER_LIMIT - updatedUsage.actions_used);

    res.json({
      draft,
      usage: {
        plan: req.device.plan,
        actionsUsed: updatedUsage.actions_used,
        actionsRemaining,
      },
    });
  } catch (err) {
    console.error('Draft error:', err);
    if (err.status === 401) return res.status(502).json({ error: 'Invalid API key configured on server' });
    if (err.status === 429) return res.status(502).json({ error: 'Upstream rate limit. Try again shortly.' });
    res.status(500).json({ error: 'Failed to generate draft' });
  }
});

// --- 4. Usage stats ---

app.get('/api/usage', authenticate, async (req, res) => {
  try {
    const usage = await getUsage(req.device.device_id);
    const actionsRemaining = req.device.plan === 'pro' ? -1 : Math.max(0, FREE_TIER_LIMIT - usage.actions_used);

    // Calculate next reset date (first of next month)
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    res.json({
      plan: req.device.plan,
      actionsUsed: usage.actions_used,
      actionsRemaining,
      resetDate: nextReset.toISOString(),
    });
  } catch (err) {
    console.error('Usage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- 5. Verify subscription (placeholder) ---

app.post('/api/subscription/verify', authenticate, async (req, res) => {
  try {
    const { receipt } = req.body;
    if (!receipt || typeof receipt !== 'string') {
      return res.status(400).json({ error: 'receipt string is required' });
    }

    // Placeholder — always succeeds. Real IAP validation comes later.
    const device = await updatePlan(req.device.device_id, 'pro');

    res.json({
      success: true,
      plan: device.plan,
      message: 'Subscription verified (placeholder)',
    });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Start ---

async function startServer() {
  try {
    // Initialize database first
    console.log('📦 Initializing database...');
    await initDb();
    console.log('✅ Database ready');
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 PaperTrail Proxy running on port ${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✅ loaded' : '❌ MISSING'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
