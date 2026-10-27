#!/bin/sh
# Hook eseguito da /docker-entrypoint.sh dell'immagine nginx prima di avviare nginx.
# Con FRONTEND_TLS=on attiva il server HTTPS (https.conf) e il rimando dalla
# porta 80; con qualunque altro valore li toglie, e nginx serve l'app solo in
# HTTP, come prima di questo script.
#
# A differenza di 40-blocked-logs.sh un errore qui ferma il container: con
# l'HTTPS richiesto ma senza certificato e' meglio non partire che servire l'app
# in chiaro.
set -e

if [ "$FRONTEND_TLS" != "on" ]; then
  rm -f /etc/nginx/conf.d/https.conf /etc/nginx/https-redirect.conf
  exit 0
fi

for f in /etc/nginx/tls/fullchain.pem /etc/nginx/tls/privkey.pem; do
  if [ ! -s "$f" ]; then
    echo "30-https.sh: FRONTEND_TLS=on ma manca $f (lo prepara make web-certs)"
    exit 1
  fi
done

cp /etc/nginx/https.conf /etc/nginx/conf.d/https.conf

# Incluso dal server sulla porta 80 (nginx.conf). Le richieste per localhost
# e 127.0.0.1 restano in HTTP: sono quelle dell'healthcheck dell'immagine (wget
# http://127.0.0.1/), che dietro un rimando fallirebbe sul certificato.
port=""
if [ "${FRONTEND_HTTPS_PORT:-443}" != "443" ]; then
  port=":$FRONTEND_HTTPS_PORT"
fi
cat > /etc/nginx/https-redirect.conf <<EOF
if (\$host !~ "^(localhost|127\.0\.0\.1)\$") {
    return 301 https://\$host$port\$request_uri;
}
EOF

echo "30-https.sh: HTTPS attivo sulla 443, la porta 80 rimanda a https://<host>$port"
