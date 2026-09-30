module.exports = {
  apps: [{
    name: 'zuest-bot',
    script: 'index.js',
    cwd: '/home/z/my-project/zuest-bot',
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './data/pm2-error.log',
    out_file: './data/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    restart_delay: 5000,
    max_restarts: 20,
    kill_timeout: 5000,
  }],
};
