const { getDeviceByToken, getUsage } = require('./db');

const FREE_TIER_LIMIT = parseInt(process.env.FREE_TIER_LIMIT || '10', 10);

// Middleware: authenticate device token
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7);
    const device = await getDeviceByToken(token);
    
    if (!device) {
      return res.status(401).json({ error: 'Invalid device token' });
    }

    req.device = device;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Middleware: check usage limits
async function checkUsage(req, res, next) {
  try {
    const device = req.device;
    const usage = await getUsage(device.device_id);

    if (device.plan === 'free' && usage.actions_used >= FREE_TIER_LIMIT) {
      return res.status(429).json({
        error: 'Monthly action limit reached',
        plan: device.plan,
        actionsUsed: usage.actions_used,
        actionsRemaining: 0,
        upgradeUrl: 'papertrail://upgrade',
      });
    }

    req.usage = usage;
    next();
  } catch (err) {
    console.error('Usage check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { authenticate, checkUsage, FREE_TIER_LIMIT };
