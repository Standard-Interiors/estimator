#!/bin/bash
set -e

echo "=== Cabinet Estimator Deployment ==="
cd /Users/william/estimator

# Set secrets (only needed once or when keys change)
if [ -n "$GOOGLE_API_KEY" ]; then
  echo "Setting GOOGLE_API_KEY secret..."
  flyctl secrets set GOOGLE_API_KEY="$GOOGLE_API_KEY" -a cabinet-estimator
fi

# Create volume if first deploy
flyctl volumes list -a cabinet-estimator | grep -q estimator_data || \
  flyctl volumes create estimator_data --region dfw --size 10 -a cabinet-estimator

# Deploy
echo "Deploying to Fly.io..."
flyctl deploy --now -a cabinet-estimator

# Health check
echo "Checking deployment..."
sleep 5
curl -sf https://cabinet-estimator.fly.dev/health && echo " OK" || echo " FAILED"
echo ""
echo "App URL: https://cabinet-estimator.fly.dev"
