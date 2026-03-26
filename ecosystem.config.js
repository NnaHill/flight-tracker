module.exports = {
  apps: [
    {
      name:             'flight-tracker',
      script:           'server.js',
      watch:            false,
      max_memory_restart: '300M',
      env_file:         '.env',
      env: {
        NODE_ENV: 'production',
        PORT:     3000
      },
      error_file:  'logs/err.log',
      out_file:    'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
