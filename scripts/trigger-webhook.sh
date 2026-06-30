#!/usr/bin/env bash
curl -k -X POST http://localhost:8787/api/webhooks/storyblok/workflow-changed \
  -H "Content-Type: application/json" \
  -d '{"spaceid": "293515764469721", "id": 192656289849877}'
