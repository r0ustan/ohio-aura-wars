module.exports = {
  apps: [
    {
      name: 'aura-leaderboard',
      script: 'server.js',
      cwd: __dirname,
      env: {
        PORT: '3009',
        DATA_DIR: '/opt/aura-leaderboard/data',
        NODE_ENV: 'production'
      }
    }
  ]
}
