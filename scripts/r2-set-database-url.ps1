# Записать DATABASE_URL стенда C2 на ВМ, не показывая пароль в чате и в консоли.
# Запуск из корня репо: powershell -ExecutionPolicy Bypass -File scripts\r2-set-database-url.ps1
$ErrorActionPreference = 'Stop'
$vm = 'ubuntu@158.160.190.61'
$key = '.local\ssh\id_ed25519'
$dbHost = 'rc1d-vltkppdtj89l7q2o.mdb.yandexcloud.net'

$secure = Read-Host 'Пароль пользователя osapp (ввод скрыт)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $plain) { throw 'Пароль пустой' }

$pass = [uri]::EscapeDataString($plain)
$line = "DATABASE_URL=postgres://osapp:$pass@${dbHost}:6432/fitness_diary?sslmode=verify-full&sslrootcert=/etc/ssl/yandex/CA.pem"
$line | ssh -i $key $vm 'sudo bash /opt/fitness-diary/scripts/r2-set-database-url-vm.sh'
$plain = $null; $line = $null
if ($LASTEXITCODE -ne 0) { throw 'Не удалось записать на ВМ' }
Write-Host 'Готово. Напишите агенту Cursor: готово'
