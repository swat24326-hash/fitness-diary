# Записать GEMINI_API_KEY (ИСКРА) на ВМ прода, не показывая ключ в чате и в консоли.
# Ключ: Vercel → проект → Settings → Environment Variables → GEMINI_API_KEY, или Google AI Studio.
# Запуск из корня репо: powershell -ExecutionPolicy Bypass -File scripts\r3-set-gemini-key.ps1
$ErrorActionPreference = 'Stop'
$vm = 'ubuntu@158.160.190.61'
$key = '.local\ssh\id_ed25519'

$secure = Read-Host 'Ключ Gemini (ввод скрыт)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
$plain = "$plain".Trim()
if (-not $plain) { throw 'Ключ пустой' }

"GEMINI_API_KEY=$plain" | ssh -i $key $vm 'sudo bash /opt/fitness-diary/scripts/r3-set-gemini-key-vm.sh'
$plain = $null
if ($LASTEXITCODE -ne 0) { throw 'Не удалось записать на ВМ' }
Write-Host 'Готово. Пришлите агенту Cursor строку «Google: …» из вывода выше'
