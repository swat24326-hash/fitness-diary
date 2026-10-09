# Записать ключ сообщества ВК для уведомлений о сбоях прода на ВМ, не показывая его в чате и в консоли.
# Ключ: сообщество → Управление → Работа с API → Ключи доступа → Создать ключ, право «Сообщения сообщества».
# Перед запуском каждый получатель пишет сообществу любое сообщение — иначе ВК не даст писать ему первым.
# Запуск из корня репо: powershell -ExecutionPolicy Bypass -File scripts\ops-set-vk-alert-key.ps1
$ErrorActionPreference = 'Stop'
$vm = 'ubuntu@158.160.190.61'
$key = '.local\ssh\id_ed25519'

$secure = Read-Host 'Ключ сообщества ВК (ввод скрыт)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
$plain = "$plain".Trim()
if (-not $plain) { throw 'Ключ пустой' }

"VK_ALERT_TOKEN=$plain" | ssh -i $key $vm 'sudo bash /opt/fitness-diary/scripts/ops-set-vk-alert-key-vm.sh'
$plain = $null
if ($LASTEXITCODE -ne 0) { throw 'Не удалось записать на ВМ — пришлите агенту Cursor вывод выше' }
Write-Host 'Готово. Во ВК должно прийти «проверка связи». Пришлите агенту Cursor строку «Получатели: …»'
