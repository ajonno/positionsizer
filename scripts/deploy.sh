#!/bin/bash
# Deploy positionsizer to Firebase Hosting
# Run from project root: sh scripts/deploy.sh

npm run build && firebase deploy --only hosting
