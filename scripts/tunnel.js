#!/usr/bin/env node

const { execSync } = require('child_process');

function extractTunnelId(payload) {
  if (!payload) return undefined;
  if (typeof payload.tunnelId === 'string') return payload.tunnelId;
  if (payload.tunnel && typeof payload.tunnel.tunnelId === 'string') return payload.tunnel.tunnelId;
  if (Array.isArray(payload) && payload[0]) return extractTunnelId(payload[0]);
  if (Array.isArray(payload.value) && payload.value[0]) return extractTunnelId(payload.value[0]);
  return undefined;
}

function getOrCreateTunnel() {
  try {
    const output = execSync('devtunnel list -j', { encoding: 'utf-8' });
    const tunnels = JSON.parse(output);
    const tunnelId = extractTunnelId(tunnels);
    
    if (tunnelId) {
      console.log(`Using existing tunnel: ${tunnelId}`);
      return tunnelId;
    }
  } catch (error) {
    // No tunnels exist, devtunnel may not be installed, or JSON parse failed
    console.warn('Could not read existing tunnels:', error.message);
  }
  
  console.log('Creating new tunnel...');
  try {
    const output = execSync('devtunnel create --allow-anonymous -j', { encoding: 'utf-8' });
    const tunnel = JSON.parse(output);
    const tunnelId = extractTunnelId(tunnel);

    if (!tunnelId) {
      console.error('Failed to parse tunnel ID from create response');
      process.exit(1);
    }

    console.log(`✓ Created tunnel: ${tunnelId}`);
    return tunnelId;
  } catch (error) {
    console.error('Failed to create tunnel:', error.message);
    process.exit(1);
  }
}

function hostTunnel(tunnelId) {
  try {
    // First, ensure the port is created (workaround for batch update issue)
    console.log('Configuring port 8787...');
    try {
      execSync(`devtunnel port create ${tunnelId} -p 8787`, { stdio: 'pipe' });
      console.log('✓ Port configured');
    } catch (error) {
      // Port might already exist
      console.warn('Could not create port 8787 (may already exist):', error.message);
    }
    
    console.log('\nStarting tunnel...\n');
    // Then host WITHOUT the -p flag (devtunnel will use configured ports)
    execSync(`devtunnel host ${tunnelId}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Tunnel error:', error.message);
    process.exit(1);
  }
}

async function main() {
  const tunnelId = getOrCreateTunnel();
  hostTunnel(tunnelId);
}

main();
