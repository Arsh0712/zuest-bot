const fetch = require('node-fetch');
const { execFile } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const config = require('../config/config');

const API_BASE = 'https://discord.com/api/v10';
const BRIDGE_PATH = path.join(__dirname, 'discord_api_bridge.py');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) discord/1.0.9215 Chrome/138.0.7204.251 ' +
  'Electron/37.6.0 Safari/537.36';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// x-super-properties — must match Python reference exactly
const PROPERTIES = {
  os: 'Windows',
  browser: 'Discord Client',
  release_channel: 'stable',
  client_version: '1.0.9215',
  os_version: '10.0.19045',
  os_arch: 'x64',
  app_arch: 'x64',
  system_locale: 'en-US',
  has_client_mods: false,
  client_launch_id: uuid(),
  browser_user_agent: USER_AGENT,
  browser_version: '37.6.0',
  os_sdk_version: '19045',
  client_build_number: 471091,
  native_build_number: 72186,
  client_event_source: null,
  launch_signature: uuid(),
  client_heartbeat_session_id: uuid(),
  client_app_state: 'focused',
};

const XSUP = Buffer.from(JSON.stringify(PROPERTIES)).toString('base64');

// ============================================================
// TASK TYPE DETECTION — matches Python reference priority order
// ============================================================

// Python checks in this order: WATCH_VIDEO, PLAY_ON_DESKTOP, STREAM_ON_DESKTOP,
// PLAY_ACTIVITY, WATCH_VIDEO_ON_MOBILE, PLAY_ON_MOBILE, LINK_ACCOUNT, PLAY_GAME, WATCH_STREAM
// We classify into types our handlers support.

const TASK_PRIORITY = [
  'WATCH_VIDEO',
  'PLAY_ON_DESKTOP',
  'STREAM_ON_DESKTOP',
  'PLAY_ACTIVITY',
  'WATCH_VIDEO_ON_MOBILE',
  'PLAY_ON_MOBILE',
  'LINK_ACCOUNT',
  'PLAY_GAME',
  'WATCH_STREAM',
  'ACHIEVEMENT_IN_ACTIVITY',
];

const EXCLUDED_GAMES = ['DESTINY', 'DESTINY 2'];
const EXCLUDED_QUEST_ID = '1412491570820812933';
const SUPPORTED_TASKS = new Set([
  'WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE',
  'PLAY_ON_DESKTOP',
  'STREAM_ON_DESKTOP', 'WATCH_STREAM',
  'PLAY_ACTIVITY',
  'ACHIEVEMENT_IN_ACTIVITY',
  'PLAY_ON_MOBILE',
  'PLAY_GAME',
]);
const VIDEO_TASKS = new Set(['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE']);

// ============================================================
// HTTP CLIENT — mirrors Python DiscordREST
// ============================================================

function buildHeaders(token, extra) {
  const h = {
    Authorization: token,
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    'Accept-Language': 'en-US',
    Origin: 'https://discord.com',
    Referer: 'https://discord.com/channels/@me',
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    Priority: 'u=1, i',
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-debug-options': 'bugReporterEnabled',
    'x-discord-locale': 'en-US',
    'x-discord-timezone': 'Asia/Kolkata',
    'x-super-properties': XSUP,
  };
  if (extra) Object.assign(h, extra);
  return h;
}

/**
 * discordRequest — mirrors Python DiscordREST._request exactly.
 * Retries on 429 and 5xx, throws on other errors.
 */
async function discordRequest(token, method, path, body, retries, delay) {
  retries = retries || 3;
  delay = delay || 0.5;
  const url = API_BASE + path;
  const opts = { method, headers: buildHeaders(token), timeout: 10000 };
  if (body !== undefined) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      const sc = res.status;

      if (sc === 429) {
        let ra = delay * (attempt + 1);
        try { ra = (await res.json()).retry_after || ra; } catch (_) {}
        await sleep(ra * 1000);
        continue;
      }

      if (sc >= 500 && sc <= 504) {
        await sleep(delay * (attempt + 1) * 1000);
        continue;
      }

      if (sc === 204) return {};

      if (sc === 200 || sc === 201) {
        try { return await res.json(); } catch (_) { return {}; }
      }

      let errBody = {};
      try { errBody = await res.json(); } catch (_) {}
      const err = new Error(errBody.message || 'HTTP ' + sc);
      err.status = sc;
      err.body = errBody;
      throw err;
    } catch (e) {
      if (e.status !== undefined) throw e; // Re-throw HTTP errors with status
      if (attempt < retries - 1) {
        await sleep(delay * 1000);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Max retries exceeded');
}

// Raw fetch for external URLs (Discord Says bypass)
async function rawFetch(url, options) {
  const res = await fetch(url, { timeout: 15000, ...options });
  return { status: res.status, body: await res.text() };
}

// ============================================================
// PYTHON BRIDGE — Chrome TLS fingerprint for quest-critical requests
// ============================================================

/**
 * bridgeRequest — calls Python tls_client bridge for quest-critical endpoints.
 * Uses Chrome 120 JA3 fingerprint, matching Python reference exactly.
 * Falls back to discordRequest on bridge failure.
 */
async function bridgeRequest(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const child = execFile('python3', [BRIDGE_PATH, method, apiPath], {
      timeout: 20000,
      env: {
        ...process.env,
        DISCORD_USER_TOKEN: token,
        DISCORD_XSUP: XSUP,
      },
    }, (error, stdout, stderr) => {
      if (error) {
        console.log('[Bridge] Process error:', error.message);
        reject(new Error('Bridge process failed: ' + error.message));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.error && result.status === 0) {
          reject(new Error(result.error));
          return;
        }
        const err = new Error(result.body && result.body.message ? result.body.message : 'HTTP ' + result.status);
        err.status = result.status;
        err.body = result.body;
        if (result.status >= 200 && result.status < 300) {
          resolve(result.body);
        } else {
          reject(err);
        }
      } catch (e) {
        console.log('[Bridge] Parse error:', e.message, 'stdout:', (stdout || '').slice(0, 200));
        reject(new Error('Bridge output parse failed'));
      }
    });

    // Send body via stdin if present
    if (body !== undefined && body !== null) {
      const jsonStr = JSON.stringify(body);
      child.stdin.write(jsonStr);
    }
    child.stdin.end();
  });
}

/**
 * discordRequestSecure — uses Python bridge for quest-critical paths,
 * falls back to node-fetch discordRequest if bridge fails.
 * Critical paths: video-progress, heartbeat, enroll, user-status, claim-reward
 */
const BRIDGE_PATHS = ['/video-progress', '/heartbeat', '/enroll', '/user-status', '/claim-reward'];

function isBridgePath(apiPath) {
  return BRIDGE_PATHS.some(function(p) { return apiPath.includes(p); });
}

async function discordRequestSecure(token, method, apiPath, body, retries, delay) {
  if (isBridgePath(apiPath)) {
    try {
      return await bridgeRequest(token, method, apiPath, body);
    } catch (e) {
      console.log('[Bridge] Failed for ' + apiPath + ', falling back to node-fetch:', e.message);
    }
  }
  return discordRequest(token, method, apiPath, body, retries, delay);
}

// ============================================================
// QUEST HELPERS
// ============================================================

function getQuestName(q) {
  // Primary: q.config.messages.quest_name (matches Python exactly)
  if (q.config && q.config.messages && q.config.messages.quest_name) {
    return q.config.messages.quest_name;
  }
  // Fallback 1: direct name field
  if (q.name) return q.name;
  // Fallback 2: config.name
  if (q.config && q.config.name) return q.config.name;
  // Fallback 3: title inside messages
  if (q.config && q.config.messages && q.config.messages.title) {
    return q.config.messages.title;
  }
  // Fallback 4: app name + task type
  const app = getAppName(q);
  if (app) return app;
  return 'Unknown';
}
function getGameTitle(q) {
  return (q.config && q.config.messages && q.config.messages.game_title) || '';
}
function getAppId(q) {
  return (q.config && q.config.application && q.config.application.id) || '';
}
function getAppName(q) {
  return (q.config && q.config.application && q.config.application.name) || '';
}
function isExpired(q) {
  try {
    const exp = q.config && (q.config.expires_at || q.config.expiresAt);
    if (!exp) return false;
    return new Date(exp) < new Date();
  } catch (_) { return false; }
}
function isCompleted(q) {
  return !!(q.user_status && (q.user_status.completed_at || q.user_status.completedAt));
}
function isEnrolled(q) {
  return !!(q.user_status && (q.user_status.enrolled_at || q.user_status.enrolledAt));
}
function hasClaimed(q) {
  return !!(q.user_status && (q.user_status.claimed_at || q.user_status.claimedAt));
}

/**
 * getTaskInfo — checks both task_config (v1) and task_config_v2 (Discord Quests 2.0).
 * Returns { taskName, type, target, done, appId }
 */
function getTaskInfo(q) {
  // Try task_config first (v1 quests), then task_config_v2 (feature-15 / Quests 2.0)
  const tasks = (q.config && q.config.task_config && q.config.task_config.tasks)
    || (q.config && q.config.task_config_v2 && q.config.task_config_v2.tasks) || {};
  const progress = (q.user_status && q.user_status.progress) || {};
  const appId = (q.config && q.config.application && q.config.application.id) || '';

  // Check in Python's priority order
  for (const name of TASK_PRIORITY) {
    if (tasks[name] !== null && tasks[name] !== undefined) {
      const taskData = tasks[name];
      const target = (taskData && taskData.target) || 0;
      const done = (progress[name] && progress[name].value) || 0;
      // Get appId from task's applications array if available
      const taskAppId = (taskData && taskData.applications && taskData.applications[0] && taskData.applications[0].id) || appId;
      return { taskName: name, type: classifyType(name), target, done, appId: String(taskAppId || '') };
    }
  }

  // Fallback: check any remaining keys
  for (const [name, val] of Object.entries(tasks)) {
    if (val !== null && val !== undefined) {
      const target = (typeof val === 'object' && val.target) || 0;
      const done = (progress[name] && progress[name].value) || 0;
      return { taskName: name, type: classifyType(name), target, done, appId: taskAppId || appId };
    }
  }

  // Final fallback: feature 15 with no task_config at all
  const features = (q.config && q.config.features) || [];
  if (features.includes(15) && Object.keys(tasks).length === 0) {
    // Quests 2.0 with no task data — default to PLAY_ON_DESKTOP
    return { taskName: 'PLAY_ON_DESKTOP', type: 'GAME', target: 900, done: 0, appId };
  }

  return { taskName: null, type: null, target: 0, done: 0, appId: '' };
}

function classifyType(taskName) {
  if (!taskName) return null;
  if (VIDEO_TASKS.has(taskName)) return 'VIDEO';
  if (taskName === 'PLAY_ON_DESKTOP' || taskName === 'PLAY_ON_MOBILE' || taskName === 'PLAY_GAME') return 'GAME';
  if (taskName.startsWith('STREAM') || taskName === 'WATCH_STREAM') return 'STREAM';
  if (taskName === 'PLAY_ACTIVITY') return 'ACTIVITY';
  if (taskName === 'ACHIEVEMENT_IN_ACTIVITY') return 'ACHIEVEMENT';
  if (taskName === 'LINK_ACCOUNT') return 'LINK_ACCOUNT';
  return null;
}

/**
 * filterValidQuests — mirrors Python QuestManager.filterQuestsValid exactly.
 * Checks SUPPORTED_TASKS and feature 15, same as reference.
 */
function filterValidQuests(quests, targetQuestIds) {
  const result = [];
  for (const q of quests) {
    if (isCompleted(q) || isExpired(q)) continue;
    if (q.id === EXCLUDED_QUEST_ID) continue;

    // If specific quest IDs requested, only include those
    if (targetQuestIds && targetQuestIds.length > 0) {
      if (targetQuestIds.includes(q.id)) result.push(q);
      continue;
    }

    // Check excluded games
    const gt = getGameTitle(q).toUpperCase();
    const qn = getQuestName(q).toUpperCase();
    if (EXCLUDED_GAMES.some(n => gt.includes(n) || qn.includes(n))) continue;

    // Check if quest has a supported task (v1 and v2 task configs)
    const tasks = (q.config && q.config.task_config && q.config.task_config.tasks)
      || (q.config && q.config.task_config_v2 && q.config.task_config_v2.tasks) || {};
    const features = (q.config && q.config.features) || [];
    let hasSupported = false;
    for (const k of Object.keys(tasks)) {
      if (SUPPORTED_TASKS.has(k) && tasks[k] !== null) {
        hasSupported = true;
        break;
      }
    }
    const isFeature15 = features.includes(15);

    if (hasSupported || isFeature15) {
      result.push(q);
    }
  }
  return result;
}

// ============================================================
// CORE QUEST OPERATIONS — matching Python reference exactly
// ============================================================

async function fetchQuests(token) {
  return discordRequest(token, 'GET', '/quests/@me');
}

/**
 * enrollQuest — matches Python exactly:
 * {"location": 11, "is_targeted": false, "metadata_raw": null}
 */
async function enrollQuest(token, questId) {
  return discordRequestSecure(token, 'POST', '/quests/' + questId + '/enroll', {
    location: 11,
    is_targeted: false,
    metadata_raw: null,
  });
}

async function getUserStatus(token, questId) {
  return discordRequestSecure(token, 'GET', '/quests/' + questId + '/user-status');
}

/**
 * claimReward — simplified body matching Python reference approach.
 */
async function claimReward(token, questId) {
  return discordRequestSecure(token, 'POST', '/quests/' + questId + '/claim-reward', {
    location: 11,
  });
}

// ============================================================
// GATEWAY — Persistent session + reconnect pulses
// ============================================================

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

/**
 * createGatewaySession — creates a persistent gateway connection
 * that stays alive with heartbeat. Mirrors Python's _loginAccount gateway.
 * Returns { destroy() } — call destroy() when done.
 */
function createGatewaySession(token) {
  let ws = null;
  let hbTimer = null;
  let seq = null;
  let alive = true;
  let resolved = false;

  try {
    ws = new WebSocket(GATEWAY_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
  } catch (e) {
    return { destroy: function() {}, ready: Promise.resolve(false) };
  }

  const ready = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(false); }
    }, 30000);

    ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        const op = payload.op;
        const d = payload.d;
        const s = payload.s;

        if (s !== null && s !== undefined) seq = s;

        if (op === 10) {
          // HELLO
          const interval = d.heartbeat_interval;
          const jitter = Math.random() * interval;
          hbTimer = setTimeout(function heartbeatLoop() {
            if (alive && ws && ws.readyState === 1) {
              try { ws.send(JSON.stringify({ op: 1, d: seq })); } catch (_) {}
            }
            if (alive) {
              hbTimer = setTimeout(heartbeatLoop, interval);
            }
          }, jitter);

          // Send IDENTIFY — matching Python GatewayClient._send_identify exactly
          ws.send(JSON.stringify({
            op: 2,
            d: {
              token: token,
              capabilities: 30717,
              properties: {
                os: 'Windows',
                browser: 'Discord Client',
                release_channel: 'stable',
                client_version: '1.0.9215',
                os_version: '10.0.19045',
                os_arch: 'x64',
                app_arch: 'x64',
                system_locale: 'en-US',
                has_client_mods: false,
                browser_user_agent: USER_AGENT,
                browser_version: '37.6.0',
                os_sdk_version: '19045',
                client_build_number: 471091,
                native_build_number: 72186,
                client_event_source: null,
              },
              presence: { status: 'online', since: 0, activities: [], afk: false },
              compress: false,
              client_state: { guild_versions: {} },
            },
          }));
        } else if (op === 0 && payload.t === 'READY') {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.log('[Gateway] Connected and READY');
            resolve(true);
          }
        } else if (op === 9) {
          // Invalid session
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(false);
          }
        }
      } catch (_) {}
    });

    ws.on('error', () => {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve(false); }
    });

    ws.on('close', () => {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve(false); }
    });
  });

  return {
    ready: ready,
    destroy: function() {
      alive = false;
      if (hbTimer) { clearTimeout(hbTimer); hbTimer = null; }
      if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    },
  };
}

/**
 * gatewayReconnect — matches Python _reconnect_gateway exactly.
 * Creates a temporary connection, waits for READY, then destroys.
 * Used during video-progress when progress stalls.
 */
async function gatewayReconnect(token) {
  const session = createGatewaySession(token);
  try {
    const ok = await session.ready;
    return ok;
  } finally {
    session.destroy();
    await sleep(1500);
  }
}

// ============================================================
// VIDEO QUEST HANDLER — exact port of Python doingQuest VIDEO branch
// ============================================================

/**
 * handleVideoQuest — exact port of Python manager.py lines 185-294.
 * STEP=2, builds timestamps in 2-second increments with random jitter,
 * sends them 0.15s apart, polls user-status, reconnects gateway on stall/400.
 */
async function handleVideoQuest(token, quest, taskInfo, log) {
  const questId = quest.id;
  const questName = getQuestName(quest);
  const { target: secondsNeeded, done: startDone } = taskInfo;
  let lastGoodTs = startDone;
  const STEP = 2;
  const MAX_RETRIES = 60; // Python uses 60

  /**
 * buildTimestamps — exact port of Python _build_ts.
 * cursor goes from start to end in increments of STEP,
 * each timestamp has tiny random jitter (0.0-0.1).
 */
  function buildTimestamps(start, end) {
    const tsList = [];
    let cursor = start;
    while (cursor < end) {
      cursor = Math.min(cursor + STEP, end);
      tsList.push(Math.round((cursor + Math.random() * 0.1) * 10) / 10);
    }
    // Ensure the last timestamp is exactly the target
    if (tsList.length > 0 && tsList[tsList.length - 1] !== parseFloat(end)) {
      tsList.push(parseFloat(end));
    }
    return tsList;
  }

  // Step 1: Probe — send timestamp 1.0 first (matching Python exactly)
  try {
    await discordRequestSecure(token, 'POST', '/quests/' + questId + '/video-progress', {
      timestamp: 1.0,
    });
  } catch (e) {
    if (e.status === 404) {
      console.log(log + ' VIDEO 404 on probe for ' + questName);
      return false;
    }
    // Any other error on probe is silently ignored (matching Python)
  }

  console.log(log + ' VIDEO quest: ' + questName + ' (' + Math.floor(lastGoodTs) + '/' + secondsNeeded + 's)');

  let completed = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (completed) break;

    // Check current server status (matching Python)
    try {
      const fresh = await discordRequestSecure(token, 'GET', '/quests/' + questId + '/user-status');
      if (fresh) {
        quest.user_status = fresh;
        if (fresh.completed_at || fresh.completedAt) {
          completed = true;
          console.log(log + ' VIDEO completed (server check)');
          break;
        }
        // Sync progress from server
        const sv = fresh.progress;
        if (sv) {
          for (const k of ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE']) {
            const v = sv[k] && sv[k].value;
            if (v && v > lastGoodTs) { lastGoodTs = Math.max(lastGoodTs, v); break; }
          }
        }
      }
    } catch (_) {}

    if (completed) break;

    // Build and send timestamp batch
    const tsList = buildTimestamps(lastGoodTs, secondsNeeded);
    let got400 = false;

    for (const ts of tsList) {
      if (completed) break;
      try {
        const res = await discordRequestSecure(token, 'POST', '/quests/' + questId + '/video-progress', {
          timestamp: ts,
        });
        if (res) {
          quest.user_status = res;
          lastGoodTs = ts;
          if (res.completed_at || res.completedAt) {
            completed = true;
            console.log(log + ' VIDEO completed at ts=' + ts);
            break;
          }
        }
      } catch (e) {
        const status = e.status || 0;
        if (status === 404) {
          console.log(log + ' VIDEO 404 for ' + questName);
          return false;
        } else if (status === 400) {
          got400 = true;
          break;
        } else if (status !== 429 && status < 500) {
          console.log(log + ' VIDEO progress rejected (' + status + ')');
        }
      }
      // 0.15s + random 0-0.1s between timestamps (matching Python exactly)
      await sleep(150 + Math.random() * 100);
    }

    if (completed) break;

    // After sending all timestamps, check if completed (matching Python)
    if (got400) {
      // On 400: reconnect gateway immediately
      console.log(log + ' VIDEO got 400, reconnecting gateway...');
      await gatewayReconnect(token);
    } else {
      // No 400: poll user-status 5 times with 1s sleep (matching Python)
      for (let i = 0; i < 5; i++) {
        await sleep(1000);
        try {
          const st = await discordRequestSecure(token, 'GET', '/quests/' + questId + '/user-status');
          if (st && (st.completed_at || st.completedAt)) {
            quest.user_status = st;
            completed = true;
            console.log(log + ' VIDEO completed (poll ' + (i + 1) + ')');
            break;
          }
        } catch (_) {}
      }
      // If still not completed and not last attempt, reconnect gateway
      if (!completed && attempt < MAX_RETRIES - 1) {
        console.log(log + ' VIDEO not done (attempt ' + (attempt + 1) + '/' + MAX_RETRIES + ', ts=' + Math.floor(lastGoodTs) + '), reconnecting gateway...');
        await gatewayReconnect(token);
      }
    }
  }

  if (completed || isCompleted(quest)) {
    console.log(log + ' VIDEO completed: ' + questName);
    return true;
  }
  console.log(log + ' VIDEO incomplete: ' + questName);
  return false;
}

// ============================================================
// GAME QUEST HANDLER — exact port of Python PLAY_ON_DESKTOP branch
// ============================================================

/**
 * handleGameQuest — exact port of Python manager.py lines 296-328.
 * Sends heartbeat with {application_id, terminal: false} every 30 seconds.
 * Then sends terminal heartbeat. NO stream_key (matching Python reference).
 */
async function handleGameQuest(token, quest, taskInfo, log) {
  const questId = quest.id;
  const questName = getQuestName(quest);
  const { target: secondsNeeded, appId, taskName: taskKeyName } = taskInfo;

  if (!appId) {
    console.log(log + ' GAME no app_id for ' + questName);
    return false;
  }

  console.log(log + ' GAME quest: ' + questName + ' (app: ' + appId + ', target: ' + secondsNeeded + 's)');

  // Main heartbeat loop — matching Python exactly
  while (!isCompleted(quest) && !isExpired(quest)) {
    // Check current progress
    const freshInfo = getTaskInfo(quest);
    const done = freshInfo.done || 0;
    if (done >= secondsNeeded) break;

    try {
      const res = await discordRequestSecure(token, 'POST', '/quests/' + questId + '/heartbeat', {
        application_id: appId,
        terminal: false,
      });
      if (res) {
        quest.user_status = res;
      }
    } catch (_) {
      // Python: except: break (any error breaks the loop)
      console.log(log + ' GAME heartbeat error, stopping');
      break;
    }
    await sleep(30000); // Python: _sleep(30.0)
  }

  // Terminal heartbeat — matching Python exactly
  try {
    const res = await discordRequestSecure(token, 'POST', '/quests/' + questId + '/heartbeat', {
      application_id: appId,
      terminal: true,
    });
    if (res) {
      quest.user_status = res;
    }
  } catch (_) {}

  if (isCompleted(quest)) {
    console.log(log + ' GAME completed: ' + questName);
    return true;
  }
  console.log(log + ' GAME incomplete: ' + questName);
  return false;
}

// ============================================================
// STREAM QUEST HANDLER
// ============================================================

/** Build a stream key for heartbeat-based quests. */
async function buildStreamKey(token, userId) {
  try {
    const channels = await discordRequest(token, 'GET', '/users/@me/channels');
    if (Array.isArray(channels) && channels.length > 0) {
      return 'call:' + channels[0].id + ':' + userId;
    }
  } catch (_) {}

  try {
    const guilds = await discordRequest(token, 'GET', '/users/@me/guilds');
    if (Array.isArray(guilds)) {
      for (const g of guilds) {
        try {
          const chans = await discordRequest(token, 'GET', '/guilds/' + g.id + '/channels');
          const vc = Array.isArray(chans) && chans.find(c => c.type === 2);
          if (vc) return 'guild:' + g.id + ':' + vc.id + ':' + userId;
        } catch (_) { break; }
      }
    }
  } catch (_) {}

  return 'call:' + userId + ':' + userId;
}

/**
 * handleStreamQuest — heartbeat with stream_key for STREAM type quests.
 */
async function handleStreamQuest(token, quest, taskInfo, streamKey, log) {
  const questId = quest.id;
  const questName = getQuestName(quest);
  const { target, done: startDone, appId, taskName: taskKeyName } = taskInfo;
  let cur = startDone;
  let failCount = 0;
  const startTime = Date.now();

  console.log(log + ' STREAM quest: ' + questName + ' (target: ' + target + ')');

  while (cur < target) {
    try {
      const beat = { stream_key: streamKey, application_id: appId || '', terminal: false };
      const r = await discordRequestSecure(token, 'POST', '/quests/' + questId + '/heartbeat', beat);
      if (r) {
        quest.user_status = r;
        const reported = (r.progress && r.progress[taskKeyName] && r.progress[taskKeyName].value) || 0;
        if (typeof reported === 'number' && reported > cur) cur = reported;
        if (r.completed_at || r.completedAt) { cur = target; break; }
      }
      failCount = 0;
    } catch (e) {
      failCount++;
      if ([400, 403, 404, 410].includes(e.status)) {
        console.log(log + ' STREAM client error ' + e.status);
        return false;
      }
      if (failCount >= 5) {
        console.log(log + ' STREAM too many failures');
        return false;
      }
    }
    console.log(log + ' STREAM progress: ' + Math.floor(cur) + '/' + target);
    if (Date.now() - startTime > 25 * 60 * 1000) {
      console.log(log + ' STREAM timeout');
      return false;
    }
    await sleep(rnd(19000, 22000));
  }

  try {
    await discordRequestSecure(token, 'POST', '/quests/' + questId + '/heartbeat', { stream_key: streamKey, application_id: appId || '', terminal: true });
  } catch (_) {}

  return cur >= target;
}

/**
 * handleActivityQuest — heartbeat with stream_key for PLAY_ACTIVITY quests.
 */
async function handleActivityQuest(token, quest, taskInfo, streamKey, log) {
  const questId = quest.id;
  const questName = getQuestName(quest);
  const { target, done: startDone, appId, taskName: taskKeyName } = taskInfo;
  let cur = startDone;
  let failCount = 0;
  const startTime = Date.now();

  console.log(log + ' ACTIVITY quest: ' + questName + ' (target: ' + target + ')');

  while (cur < target) {
    try {
      const beat = { stream_key: streamKey, application_id: appId || '', terminal: false };
      const r = await discordRequestSecure(token, 'POST', '/quests/' + questId + '/heartbeat', beat);
      if (r) {
        quest.user_status = r;
        const reported = (r.progress && r.progress[taskKeyName] && r.progress[taskKeyName].value) || 0;
        if (typeof reported === 'number' && reported > cur) cur = reported;
        if (r.completed_at || r.completedAt) { cur = target; break; }
      }
      failCount = 0;
    } catch (e) {
      failCount++;
      if ([400, 403, 404, 410].includes(e.status)) {
        console.log(log + ' ACTIVITY client error ' + e.status);
        return false;
      }
      if (failCount >= 5) {
        console.log(log + ' ACTIVITY too many failures');
        return false;
      }
    }
    console.log(log + ' ACTIVITY progress: ' + Math.floor(cur) + '/' + target);
    if (Date.now() - startTime > 25 * 60 * 1000) {
      console.log(log + ' ACTIVITY timeout');
      return false;
    }
    await sleep(rnd(19000, 22000));
  }

  try {
    await discordRequestSecure(token, 'POST', '/quests/' + questId + '/heartbeat', { stream_key: streamKey, application_id: appId || '', terminal: true });
  } catch (_) {}

  return cur >= target;
}

/**
 * handleAchievementQuest — tries heartbeat first, then Discord Says bypass.
 */
async function handleAchievementQuest(token, quest, taskInfo, streamKey, log) {
  const questName = getQuestName(quest);
  console.log(log + ' ACHIEVEMENT quest: ' + questName);

  // Phase 1: Try heartbeat spoofing
  const hbResult = await handleActivityQuest(token, quest, taskInfo, streamKey, log);
  if (hbResult) return true;

  console.log(log + ' ACHIEVEMENT heartbeat failed, trying Discord Says bypass...');

  try {
    const bypassResult = await discordSaysBypass(token, quest, taskInfo, log);
    if (bypassResult) {
      console.log(log + ' ACHIEVEMENT bypass succeeded for ' + questName);
      return true;
    }
  } catch (e) {
    console.log(log + ' ACHIEVEMENT bypass error: ' + e.message);
  }

  console.log(log + ' ACHIEVEMENT all methods failed for ' + questName);
  return false;
}

/**
 * discordSaysBypass — OAuth bypass for ACHIEVEMENT quests.
 */
async function discordSaysBypass(token, quest, taskInfo, log) {
  const appId = taskInfo.appId || getAppId(quest);
  if (!appId || !/^\d+$/.test(String(appId))) {
    console.log(log + ' BYPASS invalid appId: ' + appId);
    return false;
  }

  const questId = quest.id;
  const target = taskInfo.target || 1;

  let preGrantIds = new Set();
  try {
    const before = await discordRequest(token, 'GET', '/oauth2/tokens');
    if (Array.isArray(before)) {
      preGrantIds = new Set(before.filter(t => t.application && t.application.id === appId).map(t => t.id));
    }
  } catch (_) {}

  try {
    const authRes = await discordRequest(token, 'POST', '/oauth2/authorize?response_type=code&client_id=' + appId, {
      permissions: '0',
      authorize: true,
      integration_type: 1,
      location_context: { guild_id: '10000', channel_id: '10000', channel_type: 10000 },
    });
    const location = authRes && authRes.location;
    if (!location) { console.log(log + ' BYPASS no redirect location'); return false; }
    const authCode = new URL(location).searchParams.get('code');
    if (!authCode) { console.log(log + ' BYPASS no auth code'); return false; }

    await sleep(rnd(500, 1000));

    let proxyTicket = '';
    try {
      const ticketRes = await discordRequest(token, 'POST', '/applications/' + appId + '/proxy-tickets', {});
      proxyTicket = (ticketRes && ticketRes.ticket) || '';
    } catch (e) {
      console.log(log + ' BYPASS proxy-tickets failed: ' + e.message);
    }

    const referrer = 'https://' + appId + '.discordsays.com/?instance_id=zuest-bot&platform=desktop&discord_proxy_ticket=' + encodeURIComponent(proxyTicket);
    await sleep(rnd(500, 1000));

    const dsAuthRes = await rawFetch(
      'https://' + appId + '.discordsays.com/.proxy/acf/authorize',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': '',
          'X-Discord-Quest-ID': questId,
          'Referer': referrer,
        },
        body: JSON.stringify({ code: authCode }),
      }
    );
    const dsBody = JSON.parse(dsAuthRes.body || '{}');
    const dsToken = dsBody.token;
    if (!dsToken) { console.log(log + ' BYPASS no DS token'); return false; }

    await sleep(rnd(500, 1000));

    const progressRes = await rawFetch(
      'https://' + appId + '.discordsays.com/.proxy/acf/quest/progress',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': dsToken,
          'X-Discord-Quest-ID': questId,
          'Referer': referrer,
        },
        body: JSON.stringify({ progress: target }),
      }
    );

    console.log(log + ' BYPASS progress posted: HTTP ' + progressRes.status);
    return progressRes.status >= 200 && progressRes.status < 300;
  } catch (e) {
    console.log(log + ' BYPASS error: ' + e.message);
    return false;
  } finally {
    try {
      const after = await discordRequest(token, 'GET', '/oauth2/tokens');
      if (Array.isArray(after)) {
        const ours = after.filter(t => t.application && t.application.id === appId && !preGrantIds.has(t.id));
        for (const g of ours) {
          try { await discordRequest(token, 'DELETE', '/oauth2/tokens/' + g.id); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

// ============================================================
// FULL QUEST COMPLETION PIPELINE — matching Python doingQuest exactly
// ============================================================

/**
 * completeQuestFull — mirrors Python QuestManager.doingQuest exactly.
 * 1. Enroll (if not enrolled) — body: {location:11, is_targeted:false, metadata_raw:null}
 * 2. Get fresh user-status
 * 3. Get task info (with feature 15 fallback)
 * 4. Execute task handler
 * 5. Claim reward
 *
 * @param {string} token - User's Discord token
 * @param {object} quest - Quest object from /quests/@me
 * @param {string} logPrefix - Log prefix
 * @param {object|null} gwSession - Optional persistent gateway session
 */
async function completeQuestFull(token, quest, logPrefix, gwSession) {
  const questId = quest.id;
  const questName = getQuestName(quest);
  const log = logPrefix || '';

  // Step 1: Enroll if not already enrolled (matching Python exactly)
  if (!isEnrolled(quest)) {
    try {
      console.log(log + ' Enrolling: ' + questName);
      const enrollRes = await enrollQuest(token, questId);
      if (enrollRes) quest.user_status = enrollRes;
      await sleep(rnd(800, 1500));
    } catch (e) {
      const msg = (e.body && e.body.message) || e.message || '';
      if (e.status === 400 && msg.toLowerCase().includes('already')) {
        // Already enrolled — continue
      } else if ([403, 404, 410].includes(e.status)) {
        return { success: false, error: 'Enroll failed (HTTP ' + e.status + '): ' + msg };
      } else {
        console.log(log + ' Enroll non-fatal error: ' + msg);
      }
    }
  }

  // Step 2: Get fresh user-status (matching Python)
  try {
    const us = await getUserStatus(token, questId);
    if (us) quest.user_status = us;
  } catch (_) {}

  // If already completed, skip task execution
  if (isCompleted(quest)) {
    console.log(log + ' Already completed: ' + questName);
  } else {
    // Step 3: Get task info
    const info = getTaskInfo(quest);

    if (!info.taskName) {
      return { success: false, error: 'No supported task for: ' + questName };
    }

    const taskName = info.taskName;
    const secondsNeeded = info.target;
    const secondsDone = info.done;

    // Step 4: Execute task handler (matching Python doingQuest)
    let taskCompleted = false;

    if (taskName === 'WATCH_VIDEO' || taskName === 'WATCH_VIDEO_ON_MOBILE') {
      taskCompleted = await handleVideoQuest(token, quest, { taskName, target: secondsNeeded, done: secondsDone, appId: info.appId }, log);
    } else if (taskName === 'PLAY_ON_DESKTOP' || taskName === 'PLAY_ON_MOBILE' || taskName === 'PLAY_GAME') {
      taskCompleted = await handleGameQuest(token, quest, { taskName, target: secondsNeeded, done: secondsDone, appId: info.appId }, log);
    } else if (taskName.startsWith('STREAM') || taskName === 'WATCH_STREAM') {
      let streamKey = null;
      try {
        const userId = (await discordRequest(token, 'GET', '/users/@me')).id;
        streamKey = await buildStreamKey(token, userId);
      } catch (_) {}
      if (!streamKey) return { success: false, error: 'No voice channel for STREAM quest' };
      taskCompleted = await handleStreamQuest(token, quest, { taskName, target: secondsNeeded, done: secondsDone, appId: info.appId }, streamKey, log);
    } else if (taskName === 'PLAY_ACTIVITY') {
      let streamKey = null;
      try {
        const userId = (await discordRequest(token, 'GET', '/users/@me')).id;
        streamKey = await buildStreamKey(token, userId);
      } catch (_) {}
      if (!streamKey) return { success: false, error: 'No voice channel for ACTIVITY quest' };
      taskCompleted = await handleActivityQuest(token, quest, { taskName, target: secondsNeeded, done: secondsDone, appId: info.appId }, streamKey, log);
    } else if (taskName === 'ACHIEVEMENT_IN_ACTIVITY') {
      let streamKey = 'call:0:0'; // Fallback for bypass
      try {
        const userId = (await discordRequest(token, 'GET', '/users/@me')).id;
        streamKey = await buildStreamKey(token, userId);
      } catch (_) {}
      taskCompleted = await handleAchievementQuest(token, quest, { taskName, target: secondsNeeded, done: secondsDone, appId: info.appId }, streamKey, log);
    } else {
      return { success: false, error: 'Unsupported task type: ' + taskName };
    }

    if (!taskCompleted) {
      return { success: false, error: 'Task not completed: ' + questName };
    }
  }

  // Step 5: Claim reward
  await sleep(rnd(2500, 6000));
  try {
    console.log(log + ' Claiming: ' + questName);
    await claimReward(token, questId);
    console.log(log + ' Claimed: ' + questName);
    return { success: true, questName };
  } catch (e) {
    const msg = (e.body && e.body.message) || e.message || '';
    if (e.body && (e.body.captcha_key || e.body.captcha_sitekey)) {
      return { success: true, questName, claimError: 'Captcha required - claim from Discord UI' };
    }
    return { success: true, questName, claimError: msg };
  }
}

// ============================================================
// BATCH COMPLETION WITH GATEWAY SESSION
// ============================================================

/**
 * completeAllQuests — processes all valid quests in PARALLEL batches of 5.
 * Each quest gets its own gateway session. Video quests are batched separately
 * since they're fast. Game/stream quests run concurrently.
 *
 * @param {string} token - User's Discord token
 * @param {Array} quests - Raw quests from /quests/@me
 * @param {Array} targetQuestIds - Optional specific quest IDs
 * @param {string} logPrefix - Log prefix
 * @returns {Promise<{succeeded: number, failed: number, claimed: number, results: Array}>}
 */
async function completeAllQuests(token, quests, targetQuestIds, logPrefix) {
  const log = logPrefix || '';
  const validQuests = filterValidQuests(quests, targetQuestIds || []);
  const unclaimed = quests.filter(q => isCompleted(q) && !hasClaimed(q) && !validQuests.find(v => v.id === q.id));

  const BATCH_SIZE = 5;
  const results = [];
  let succeeded = 0;
  let failed = 0;
  let claimed = 0;

  // Claim already-completed quests first (fast, no gateway needed)
  for (const quest of validQuests) {
    if (isCompleted(quest)) {
      const questName = getQuestName(quest);
      try {
        await claimReward(token, quest.id);
        claimed++;
        results.push({ success: true, questId: quest.id, questName, claimed: true });
      } catch (e) {
        results.push({ success: true, questId: quest.id, questName, claimError: e.message });
      }
    }
  }

  // Claim unclaimed rewards
  for (const quest of unclaimed) {
    const questName = getQuestName(quest);
    try {
      await claimReward(token, quest.id);
      claimed++;
      results.push({ success: true, questName, claimed: true });
    } catch (e) {
      results.push({ success: true, questName, claimError: e.message });
    }
  }

  // Get quests that actually need completion
  const toComplete = validQuests.filter(q => !isCompleted(q));
  console.log(log + ' Processing ' + toComplete.length + ' quest(s) in parallel batches of ' + BATCH_SIZE);

  // Process in parallel batches
  for (let i = 0; i < toComplete.length; i += BATCH_SIZE) {
    const batch = toComplete.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toComplete.length / BATCH_SIZE);
    console.log(log + ' Batch ' + batchNum + '/' + totalBatches + ' (' + batch.length + ' quests)');

    // Launch all quests in this batch simultaneously — each gets its own gateway
    const batchPromises = batch.map(async function(quest) {
      const questName = getQuestName(quest);
      const questLog = log + ' [' + questName.slice(0, 20) + ']';

      // Each quest gets its own gateway session for parallel execution
      console.log(questLog + ' Starting (parallel)...');
      const gwSession = createGatewaySession(token);
      try {
        const gwOk = await gwSession.ready;
        console.log(questLog + ' Gateway ' + (gwOk ? 'connected' : 'failed (continuing)'));
      } catch (_) {}

      try {
        const result = await completeQuestFull(token, quest, questLog, gwSession);
        return result;
      } catch (e) {
        return { success: false, questName, error: e.message };
      } finally {
        gwSession.destroy();
      }
    });

    // Wait for entire batch to finish
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
      results.push(result);
    }

    console.log(log + ' Batch ' + batchNum + ' done: ' + batchResults.filter(function(r) { return r.success; }).length + '/' + batch.length + ' succeeded');
  }

  return { succeeded, failed, claimed, results, totalValid: validQuests.length, totalUnclaimed: unclaimed.length };
}

/** Validate a token by fetching /users/@me */
async function validateToken(token) {
  try {
    const data = await discordRequest(token, 'GET', '/users/@me');
    return { valid: true, username: data.username || '', id: data.id || '' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = {
  fetchQuests,
  enrollQuest,
  getUserStatus,
  claimReward,
  completeQuestFull,
  completeAllQuests,
  filterValidQuests,
  validateToken,
  buildStreamKey,
  createGatewaySession,
  getQuestName,
  getGameTitle,
  getAppName,
  getAppId,
  isExpired,
  isCompleted,
  isEnrolled,
  hasClaimed,
  getTaskInfo,
  handleVideoQuest,
  handleGameQuest,
  handleStreamQuest,
  handleActivityQuest,
  handleAchievementQuest,
  claimQuest: claimReward,
};