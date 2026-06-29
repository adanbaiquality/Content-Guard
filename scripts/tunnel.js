#!/usr/bin/env node

const { execSync } = require('child_process');

function getOrCreateTunnel() {
  try {
    const output = execSync('devtunnel list -j', { encoding: 'utf-8' });
    const tunnels = JSON.parse(output);
    
    if (tunnels && tunnels.length > 0) {
      const tunnelId = tunnels[0].tunnelId;
      console.log(`Using existing tunnel: ${tunnelId}`);
      return tunnelId;
    }
  } catch {
    // No tunnels exist or JSON parse failed
  }
  
  console.log('Creating new tunnel...');
  const output = execSync('devtunnel create --allow-anonymous', { encoding: 'utf-8' });
  const match = output.match(/Tunnel ID\s*:\s*([a-z0-9-]+\.[a-z]+)/);
  if (!match || !match[1]) {
    console.error('Failed to parse tunnel ID');
    process.exit(1);
  }
  
  console.log(`✓ Created tunnel: ${match[1]}`);
  return match[1];
}

function hostTunnel(tunnelId) {
  try {
    // First, ensure the port is created (workaround for batch update issue)
    console.log('Configuring port 8787...');
    try {
      execSync(`devtunnel port create ${tunnelId} -p 8787`, { stdio: 'pipe' });
      console.log('✓ Port configured');
    } catch {
      // Port might already exist
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
