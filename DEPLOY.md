# PaperTrail Proxy Deployment

## Quick Railway Deployment

1. **Sign up at Railway.app** with GitHub
2. **Create New Project** → Deploy from GitHub repo
3. **Set Environment Variable**: `ANTHROPIC_API_KEY=sk-ant-api03-...`
4. **Deploy!** Railway will auto-deploy from your repo

## Environment Variables Needed
- `ANTHROPIC_API_KEY` - Your Claude API key (required)
- `PORT` - Auto-set by Railway 
- `RATE_LIMIT_PER_MIN` - Optional (default: 10)
- `FREE_TIER_LIMIT` - Optional (default: 10)

## After Deployment
1. Copy your Railway URL (e.g., `https://papertrail-proxy-production.up.railway.app`)  
2. Update your React Native app to use this URL instead of `localhost:3334`

## Health Check
Your deployed proxy will be healthy at: `https://your-url.railway.app/health`