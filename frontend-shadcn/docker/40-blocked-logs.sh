#!/bin/sh
# Hook eseguito da /docker-entrypoint.sh dell'immagine nginx prima di avviare nginx.
# Prepara la cartella dei log dei tentativi bloccati e avvia crond per la pulizia a 7 giorni.
#
# Volutamente senza `set -e`: se qualcosa qui non riesce, nginx deve partire comunque —
# la pulizia dei log non può diventare un motivo di downtime del sito.

mkdir -p /var/log/nginx/blocked

# La cartella arriva da un bind mount creato da Docker come root, mentre i worker nginx
# scrivono come utente 'nginx': senza questo chown il log dei bloccati non verrebbe scritto.
chown -R nginx:nginx /var/log/nginx/blocked \
  || echo "40-blocked-logs.sh: chown fallito su /var/log/nginx/blocked"

# -b in background, -l 8 log level minimo (nel container syslog non c'è: messaggi scartati).
# La prova che il cron gira è last-cleanup.log, riscritto a ogni esecuzione.
if crond -b -l 8 -c /etc/crontabs; then
  echo "40-blocked-logs.sh: crond avviato, retention log bloccati 7 giorni"
else
  echo "40-blocked-logs.sh: crond NON avviato, la pulizia dei log non è attiva"
fi
