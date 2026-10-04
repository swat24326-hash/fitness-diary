# Записать ключ Yandex AI Studio для ИСКРЫ на ВМ прода, не показывая его в чате и в консоли.
# Ключ: консоль Yandex Cloud → Сервисные аккаунты → iskra-llm → Создать новый ключ → API-ключ
# (область yc.ai.languageModels.execute). Секрет показывается один раз — сразу вставить сюда.
# Запуск из корня репо: powershell -ExecutionPolicy Bypass -File scripts\r3-set-yandex-llm-key.ps1
$ErrorActionPreference = 'Stop'
$vm = 'ubuntu@158.160.190.61'
$key = '.local\ssh\id_ed25519'

$secure = Read-Host 'API-ключ Yandex AI Studio (ввод скрыт)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
$plain = "$plain".Trim()
if (-not $plain) { throw 'Ключ пустой' }

"YANDEX_LLM_API_KEY=$plain" | ssh -i $key $vm 'sudo bash /opt/fitness-diary/scripts/r3-set-yandex-llm-key-vm.sh'
$plain = $null
if ($LASTEXITCODE -ne 0) { throw 'Не удалось записать на ВМ' }
Write-Host 'Готово. Пришлите агенту Cursor строку «Яндекс: …» из вывода выше'
