const { getDeviceByToken, getUsage } = require('./db');

const FREE_TIER_LIMIT = parseInt(process.env.FREE_TIER_LIMIT || '10', 10);

// Middleware: authenticate device token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const device = getDeviceByToken(token);
  
  if (!device) {
    return res.status(401).json({ error: 'Invalid device token' });
  }

  req.device = device;
  next();
}

// Middleware: check usage limits
function checkUsage(req, res, next) {
  const device = req.device;
  const usage = getUsage(device.device_id);

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
}

module.exports = { authenticate, checkUsage, FREE_TIER_LIMIT };
