# Показать владельцу пароль шифрования копий базы (docs/RELIABILITY_PLAN.md, 2b) — один раз, чтобы сохранить ВНЕ сервера:
# менеджер паролей или бумага в сейфе. Без него копии из бакета не расшифровать, если сервер пропадёт.
# Не пересылать в чат. Запуск из корня репо: powershell -ExecutionPolicy Bypass -File scripts\pg-backup-show-pass.ps1
$ErrorActionPreference = 'Stop'
$vm = 'ubuntu@158.160.190.61'
$key = '.local\ssh\id_ed25519'

$pass = ssh -i $key $vm 'sudo cat /etc/fitness-diary/backup.pass'
if ($LASTEXITCODE -ne 0 -or -not $pass) { throw 'Пароль не найден — сначала агент включает копии (pg-backup-cloud-setup-vm.sh)' }
Write-Host ''
Write-Host 'Пароль шифрования копий базы (сохраните в менеджер паролей, в чат не присылайте):'
Write-Host $pass -ForegroundColor Yellow
Write-Host ''
Read-Host 'Сохранили? Нажмите Enter — экран очистится'
Clear-Host
