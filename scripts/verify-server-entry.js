// Verification-only server entry: inject the test admin password IN-PROCESS
// (immune to environment-inheritance issues and never touches config/admin.json).
// Usage (from apps/server): node D:\code.game\MyBlog\scripts\verify-server-entry.js
process.env.MYBLOG_ADMIN_PASSWORD = 'verify-pass';

const cwd = process.cwd();
require(cwd + '/node_modules/ts-node/register');
require(cwd + '/src/main.ts');
