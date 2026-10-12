# Копия базы вне аккаунта Яндекса (временно — на ноутбук владельца, до своего сервера; STRATEGY §5.4 «Фаза R4»).
# Берёт свежую ночную копию с ВМ, шифрует НА СЕРВЕРЕ тем же паролем, что копии в бакете (pg-backup-show-pass.ps1),
# скачивает в папку вне OneDrive, сверяет SHA-256, хранит последние 8 штук (~2 месяца при запуске раз в неделю).
# Расшифровать: gpg -d fd-ГГГГ-ММ-ДД.dump.gpg > fd.dump  →  восстановление по RUNBOOK §8.
# Разово:     powershell -ExecutionPolicy Bypass -File scripts\pg-backup-pull-laptop.ps1
# Раз в неделю: ... -File scripts\pg-backup-pull-laptop.ps1 -Install   (задача Планировщика Windows)
param([switch]$Install)
$ErrorActionPreference = 'Stop'
$vm = 'ubuntu@158.160.190.61'
$key = Join-Path $env:USERPROFILE '.ssh\fd_agent_staging'
$dir = 'C:\fd-backups'
$keep = 8
$log = Join-Path $dir 'pull.log'

if ($Install) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 10:00
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName 'FitnessDiary-DB-Backup' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Host 'Задача FitnessDiary-DB-Backup: каждый понедельник 10:00 (если ноутбук был выключен — при следующем включении).'
  return
}

New-Item -ItemType Directory -Force $dir | Out-Null
function Say($msg) { $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $msg"; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Host $line }

try {
  $remote = 'sudo bash -c ''set -e; f=$(ls -1t /var/backups/fitness-diary/daily/fd-*.dump | head -1); t=/tmp/fd-pull.gpg; gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file /etc/fitness-diary/backup.pass --symmetric --cipher-algo AES256 -o $t $f; chown ubuntu $t; chmod 600 $t; echo $(basename $f) $(sha256sum $t | cut -c1-64)'''
  $info = ssh -i $key -o BatchMode=yes -o ConnectTimeout=20 $vm $remote
  if ($LASTEXITCODE -ne 0 -or -not $info) { throw 'сервер не подготовил копию (ssh / gpg)' }
  $name, $sha = "$info".Trim() -split '\s+'
  $part = Join-Path $dir "$name.gpg.part"
  scp -q -i $key -o BatchMode=yes "${vm}:/tmp/fd-pull.gpg" $part
  if ($LASTEXITCODE -ne 0) { throw 'не скачался файл (scp)' }
  ssh -i $key -o BatchMode=yes $vm 'rm -f /tmp/fd-pull.gpg' | Out-Null
  if ((Get-FileHash $part -Algorithm SHA256).Hash.ToLower() -ne $sha) { Remove-Item $part; throw 'контрольная сумма не совпала — файл повреждён' }
  Move-Item -Force $part (Join-Path $dir "$name.gpg")
  Get-ChildItem $dir -Filter 'fd-*.dump.gpg' | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item
  $kb = [math]::Round((Get-Item (Join-Path $dir "$name.gpg")).Length / 1KB)
  Say "ок $name.gpg ${kb} КБ, копий в папке: $((Get-ChildItem $dir -Filter 'fd-*.dump.gpg').Count)"
} catch {
  Say "ОШИБКА: $($_.Exception.Message)"
  exit 1
}
