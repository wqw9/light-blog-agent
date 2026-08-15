# Clean local runtime data: database, secret key, uploaded files, admin credential,
# and restore config templates from git (removes personal edits).
# Run AFTER stopping dev servers (Ctrl+C in the dev terminal).
# After this script, run:  corepack pnpm setup
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot

# 1. Database and encryption key
Remove-Item (Join-Path $root 'data\myblog.db') -Force
Remove-Item (Join-Path $root 'data\myblog.db-journal') -Force
Remove-Item (Join-Path $root 'data\myblog.db-wal') -Force
Remove-Item (Join-Path $root 'data\myblog.db-shm') -Force
Remove-Item (Join-Path $root 'data\secret.key') -Force

# 2. Uploaded files (Live2D models are kept)
Remove-Item (Join-Path $root 'uploads\files\*') -Force -Recurse
Remove-Item (Join-Path $root 'uploads\img\*') -Force -Recurse
Remove-Item (Join-Path $root 'uploads\tmp\*') -Force -Recurse

# 3. Admin credential (password hash) and server-side runtime config copies
Remove-Item (Join-Path $root 'config\admin.json') -Force
Remove-Item (Join-Path $root 'deploy\runtime-config\*.json') -Force

# 4. Restore config templates from git (removes personal edits / uploaded URLs)
git -C $root restore config\site.json config\about.json config\mascot.json config\llm.json

Write-Host ''
Write-Host 'OK: local runtime data cleaned.'
Write-Host 'Next steps:'
Write-Host '  1. corepack pnpm setup                 (fresh database + sample articles)'
Write-Host '  2. set a new admin password in config/admin.json'
Write-Host '  3. corepack pnpm dev'
