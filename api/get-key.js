// Vercel Serverless Function - Smart Key Rotation with Usage Tracking
// Place this file at: /api/get-key.js

import fs from 'fs';
import path from 'path';

// Path to your keys data file
const KEYS_FILE = path.join(process.cwd(), 'data', 'keys.json');

// Helper: Read keys from JSON file
function readKeys() {
  try {
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading keys file:', error);
    // Fallback: Use environment variables if file doesn't exist
    return {
      keys: [
        {
          key: process.env.NEWS_API_KEY_1 || "",
          name: "Primary Key",
          active: true,
          dailyLimit: 100,
          usedToday: 0,
          lastReset: new Date().toISOString()
        }
      ],
      updated: new Date().toISOString(),
      version: "1.0"
    };
  }
}

// Helper: Write keys to JSON file
function writeKeys(keysData) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keysData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing keys file:', error);
    return false;
  }
}

// Helper: Check if date is from previous day (UTC)
function needsReset(lastResetStr) {
  const lastReset = new Date(lastResetStr);
  const now = new Date();
  
  // Reset if different UTC day
  return lastReset.getUTCDate() !== now.getUTCDate() ||
         lastReset.getUTCMonth() !== now.getUTCMonth() ||
         lastReset.getUTCFullYear() !== now.getUTCFullYear();
}

// Helper: Find available key with lowest usage
function findAvailableKey(keysData) {
  const now = new Date().toISOString();
  let availableKeys = [];

  for (let keyObj of keysData.keys) {
    if (!keyObj.active) continue;

    // Reset daily counter if needed
    if (needsReset(keyObj.lastReset)) {
      keyObj.usedToday = 0;
      keyObj.lastReset = now;
    }

    // Check if key has available quota
    if (keyObj.usedToday < keyObj.dailyLimit) {
      availableKeys.push(keyObj);
    }
  }

  if (availableKeys.length === 0) {
    return null; // All keys exhausted
  }

  // Sort by usage (lowest first)
  availableKeys.sort((a, b) => a.usedToday - b.usedToday);
  
  return availableKeys[0];
}

// Main handler
export default function handler(req, res) {
  // Security: Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read current keys data
    let keysData = readKeys();

    // Check if this is a failure report
    const failed = req.query.failed === 'true';
    const failedKey = req.query.key;

    if (failed && failedKey) {
      // Mark the failed key as exhausted
      for (let keyObj of keysData.keys) {
        if (keyObj.key === failedKey) {
          keyObj.usedToday = keyObj.dailyLimit; // Mark as exhausted
          console.log(`Key "${keyObj.name}" marked as exhausted`);
          break;
        }
      }
      writeKeys(keysData);
    }

    // Find available key
    const selectedKey = findAvailableKey(keysData);

    if (!selectedKey) {
      console.error('All API keys exhausted!');
      return res.status(503).json({ 
        error: 'All API keys have reached their daily limit. Please try again tomorrow.',
        resetTime: new Date(Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 1,
          0, 0, 0
        )).toISOString()
      });
    }

    // Increment usage counter
    selectedKey.usedToday++;

    // Save updated data
    writeKeys(keysData);

    // Log usage
    console.log(`Provided key: ${selectedKey.name} (${selectedKey.usedToday}/${selectedKey.dailyLimit})`);

    // Set cache headers (short cache - 5 minutes)
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Return the selected key
    return res.status(200).json({
      key: selectedKey.key,
      name: selectedKey.name,
      remaining: selectedKey.dailyLimit - selectedKey.usedToday,
      totalKeys: keysData.keys.filter(k => k.active).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}