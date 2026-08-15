// pm2 进程配置：在服务器 /opt/myblog 下运行
module.exports = {
  apps: [
    {
      name: 'myblog-server',
      cwd: '/opt/myblog/apps/server',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '300M',
      autorestart: true,
      time: true,
    },
  ],
};
