// Simplified version - stores data in memory (resets on deploy)
// For persistent storage, you'll need a database

let keysData = {
  keys: [
    {
      key: "0f370e39f301408b9c1e4af782174a96",
      name: "Primary Key",
      active: true,
      dailyLimit: 100,
      usedToday: 0,
      lastReset: new Date().toISOString()
    },
    {
      key: "YOUR_SECOND_API_KEY_HERE",
      name: "Backup Key 1",
      active: true,
      dailyLimit: 100,
      usedToday: 0,
      lastReset: new Date().toISOString()
    },
    {
      key: "YOUR_THIRD_API_KEY_HERE",
      name: "Backup Key 2",
      active: true,
      dailyLimit: 100,
      usedToday: 0,
      lastReset: new Date().toISOString()
    },
    {
      key: "YOUR_FOURTH_API_KEY_HERE",
      name: "Backup Key 3",
      active: true,
      dailyLimit: 100,
      usedToday: 0,
      lastReset: new Date().toISOString()
    }
  ]
};

// Check if date is from previous day (UTC)
function needsReset(lastResetStr) {
  const lastReset = new Date(lastResetStr);
  const now = new Date();
  
  return lastReset.getUTCDate() !== now.getUTCDate() ||
         lastReset.getUTCMonth() !== now.getUTCMonth() ||
         lastReset.getUTCFullYear() !== now.getUTCFullYear();
}

// Find available key with lowest usage
function findAvailableKey() {
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
    return null;
  }

  // Sort by usage (lowest first)
  availableKeys.sort((a, b) => a.usedToday - b.usedToday);
  
  return availableKeys[0];
}

// Main handler
export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  
  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if this is a failure report
    const failed = req.query.failed === 'true';
    const failedKey = req.query.key;

    if (failed && failedKey) {
      // Mark the failed key as exhausted
      for (let keyObj of keysData.keys) {
        if (keyObj.key === failedKey) {
          keyObj.usedToday = keyObj.dailyLimit;
          console.log(`Key "${keyObj.name}" marked as exhausted`);
          break;
        }
      }
    }

    // Find available key
    const selectedKey = findAvailableKey();

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

    // Log usage
    console.log(`Provided key: ${selectedKey.name} (${selectedKey.usedToday}/${selectedKey.dailyLimit})`);

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
