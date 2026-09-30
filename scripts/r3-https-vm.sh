#!/usr/bin/env bash
# R3 на ВМ: HTTPS для своего домена через Caddy (сертификат Let's Encrypt получает и продлевает сам).
# Прокси на приложение 127.0.0.1:8080. Caddy подменяет X-Forwarded-For адресом клиента —
# на нём держится лимит неудачных входов (authRateLimitCore.clientIpFromHeaders).
# После проверки https: HOST=127.0.0.1 в .env, чтобы :8080 не был виден снаружи в обход лимита.
# Usage: sudo bash scripts/r3-https-vm.sh app-core.ru
set -euo pipefail
DOMAIN="${1:?укажите домен, например app-core.ru}"
command -v caddy >/dev/null || { echo "Нет caddy: поставить пакет caddy (репозиторий cloudsmith caddy/stable)." >&2; exit 1; }

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
echo "Caddy: $DOMAIN → 127.0.0.1:8080. Сертификат появится, когда DNS A укажет на эту ВМ и открыты 80/443."
