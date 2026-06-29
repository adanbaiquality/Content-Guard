#!/usr/bin/env bash
curl -X POST http://localhost:3000/api/webhooks/storyblok/workflow-changed \
  -H "Content-Type: application/json" \
  -d '{"spaceid": "293515764469721", "id": 192656289849877}'
