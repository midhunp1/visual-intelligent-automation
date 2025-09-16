# Keep Render Service Awake

## Option 1: Local Keep-Alive Script
Run locally:
```bash
node keep-alive.js
```

## Option 2: Use UptimeRobot (FREE - Recommended)
1. Go to https://uptimerobot.com
2. Sign up for free account
3. Add new monitor:
   - Monitor Type: HTTP(s)
   - URL: https://via-platform.onrender.com/api/health
   - Monitoring Interval: 5 minutes (free tier)
   - Alert when down: Optional

## Option 3: Use Cron-job.org (FREE)
1. Go to https://cron-job.org
2. Sign up for free account
3. Create new cronjob:
   - URL: https://via-platform.onrender.com/api/health
   - Schedule: Every 1 minute
   - HTTP Method: GET

## Option 4: GitHub Actions (FREE)
Create `.github/workflows/keep-alive.yml`:
```yaml
name: Keep Alive
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping service
        run: curl https://via-platform.onrender.com/api/health
```

## Option 5: Better Uptime (FREE)
1. Go to https://betteruptime.com
2. Sign up for free account (30-second checks!)
3. Add monitor for your URL

**Recommendation:** Use UptimeRobot or Better Uptime as they also provide monitoring dashboards!