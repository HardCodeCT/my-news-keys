// Smart key rotation - only decrements when actually used

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

function needsReset(lastResetStr) {
  const lastReset = new Date(lastResetStr);
  const now = new Date();
  
  return lastReset.getUTCDate() !== now.getUTCDate() ||
         lastReset.getUTCMonth() !== now.getUTCMonth() ||
         lastReset.getUTCFullYear() !== now.getUTCFullYear();
}

function findAvailableKey() {
  const now = new Date().toISOString();
  let availableKeys = [];

  for (let keyObj of keysData.keys) {
    if (!keyObj.active) continue;

    if (needsReset(keyObj.lastReset)) {
      keyObj.usedToday = 0;
      keyObj.lastReset = now;
    }

    if (keyObj.usedToday < keyObj.dailyLimit) {
      availableKeys.push(keyObj);
    }
  }

  if (availableKeys.length === 0) return null;

  availableKeys.sort((a, b) => a.usedToday - b.usedToday);
  return availableKeys[0];
}

function findKeyByValue(keyValue) {
  return keysData.keys.find(k => k.key === keyValue);
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ROUTE 1: GET /api/get-key - Return available key WITHOUT decrementing
    if (req.method === 'GET' && !req.query.action) {
      const selectedKey = findAvailableKey();

      if (!selectedKey) {
        return res.status(503).json({ 
          error: 'All API keys exhausted',
          resetTime: new Date(Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate() + 1,
            0, 0, 0
          )).toISOString()
        });
      }

      console.log(`Provided key: ${selectedKey.name} (${selectedKey.usedToday}/${selectedKey.dailyLimit}) - NOT decremented yet`);

      return res.status(200).json({
        key: selectedKey.key,
        name: selectedKey.name,
        remaining: selectedKey.dailyLimit - selectedKey.usedToday,
        totalKeys: keysData.keys.filter(k => k.active).length,
        timestamp: new Date().toISOString()
      });
    }

    // ROUTE 2: POST /api/get-key?action=confirm - Confirm key was used successfully
    if (req.method === 'POST' && req.query.action === 'confirm') {
      const keyValue = req.query.key || req.body?.key;
      
      if (!keyValue) {
        return res.status(400).json({ error: 'Key parameter required' });
      }

      const keyObj = findKeyByValue(keyValue);
      
      if (keyObj) {
        keyObj.usedToday++;
        console.log(`✅ Confirmed usage: ${keyObj.name} (${keyObj.usedToday}/${keyObj.dailyLimit})`);
        
        return res.status(200).json({ 
          success: true,
          message: 'Usage confirmed',
          usedToday: keyObj.usedToday,
          remaining: keyObj.dailyLimit - keyObj.usedToday
        });
      }

      return res.status(404).json({ error: 'Key not found' });
    }

    // ROUTE 3: POST /api/get-key?action=failure - Report key failed (429)
    if (req.method === 'POST' && req.query.action === 'failure') {
      const keyValue = req.query.key || req.body?.key;
      
      if (!keyValue) {
        return res.status(400).json({ error: 'Key parameter required' });
      }

      const keyObj = findKeyByValue(keyValue);
      
      if (keyObj) {
        keyObj.usedToday = keyObj.dailyLimit; // Mark as exhausted
        console.log(`❌ Key failed (429): ${keyObj.name} - marked as exhausted`);
        
        return res.status(200).json({ 
          success: true,
          message: 'Key marked as exhausted',
          willRotate: true
        });
      }

      return res.status(404).json({ error: 'Key not found' });
    }

    // Invalid request
    return res.status(400).json({ 
      error: 'Invalid request',
      usage: {
        getKey: 'GET /api/get-key',
        confirmUsage: 'POST /api/get-key?action=confirm&key=YOUR_KEY',
        reportFailure: 'POST /api/get-key?action=failure&key=YOUR_KEY'
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

