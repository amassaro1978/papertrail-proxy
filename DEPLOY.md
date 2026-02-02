# Deployment Options

## Railway (Current Issue)
The app crashes after 47 seconds due to missing environment variable.

**Fix:** Add environment variable in Railway dashboard:
- Variable: `ANTHROPIC_API_KEY`  
- Value: (copy from local .env file)

## Alternative Deployment Options

### Render
1. Connect GitHub repo
2. Set environment variable in dashboard  
3. Auto-deploy

### Docker (Local/VPS)
```bash
docker build -t papertrail-proxy .
docker run -p 3334:3334 -e ANTHROPIC_API_KEY="your-key-here" papertrail-proxy
```

### Heroku
```bash
heroku create papertrail-proxy
heroku config:set ANTHROPIC_API_KEY="your-key-here"
git push heroku main
```