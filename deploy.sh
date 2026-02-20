#!/bin/bash
set -e

echo "Deploying C3P1..."

cd ~/c3p1
git pull
npm run build
sudo systemctl restart cortana

echo "Done. C3P1 is live."
