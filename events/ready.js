const config = require('../config/config');
const { stmts } = require('../database/db');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log('\n' + '='.repeat(45));
    console.log('  Zuest Bot — Online');
    console.log('  Logged in as ' + client.user.tag);
    console.log('  Serving ' + client.guilds.cache.size + ' server(s)');
    console.log('  Owner ID: ' + (config.ownerId || 'NOT SET'));
    console.log('='.repeat(45) + '\n');

    client.user.setActivity('Quests', { type: 3 });

    if (config.questCheckInterval > 0) {
      startAutoQuestLoop(client);
    }
  },
};

function startAutoQuestLoop(client) {
  const delay = config.questCheckInterval;
  console.log('[AutoQuest] Check interval set to ' + (delay / 60000) + ' minutes');

  setInterval(async () => {
    try {
      const users = stmts.getAutoquestUsers.all();
      if (users.length === 0) return;

      console.log('[AutoQuest] Checking quests for ' + users.length + ' user(s)...');

      const { fetchQuests, completeAllQuests, getQuestName } = require('../utils/questAPI');

      for (const user of users) {
        if (!user.user_token) continue;
        const logPrefix = '[AutoQuest] User ' + user.user_id.slice(0, 8);

        try {
          console.log(logPrefix + ' Fetching quests...');
          const response = await fetchQuests(user.user_token);
          const allQuests = (response && response.quests) || [];

          if (allQuests.length === 0) {
            console.log(logPrefix + ' No quests found');
            continue;
          }

          // completeAllQuests handles gateway session, filtering, completion, and claiming
          const batch = await completeAllQuests(user.user_token, allQuests, [], logPrefix);

          for (const r of batch.results) {
            if (r.success && !r.claimError) {
              const status = r.claimed ? 'claimed' : 'completed';
              console.log(logPrefix + ' ' + status + ': ' + (r.questName || 'unknown'));
              stmts.logQuest.run(user.user_id, r.questId || 'unknown', r.questName || 'unknown', status);
            } else if (!r.success) {
              console.error(logPrefix + ' Failed: ' + (r.questName || 'unknown') + ' — ' + (r.error || 'unknown'));
            }
          }

          console.log(logPrefix + ' Batch done: ' + batch.succeeded + ' ok, ' + batch.failed + ' fail, ' + batch.claimed + ' claimed');
        } catch (e) {
          console.error(logPrefix + ' Fatal error: ' + e.message);
        }
      }
    } catch (err) {
      console.error('[AutoQuest] Loop error:', err.message);
    }
  }, delay);
}
