#!/usr/bin/env bash
# =============================================================================
# Outage experiment: stop the Restaurant Service, submit an order, observe a
# bounded failure (503) instead of an indefinite hang.
#
# Usage: bash scripts/outage-check.sh
# =============================================================================
set -uo pipefail

ORDER_URL="${ORDER_URL:-http://localhost:8082}"
RESTAURANT_URL="${RESTAURANT_URL:-http://localhost:8081}"
TIMEOUT="${TIMEOUT:-30}"

echo "=== Outage experiment ==="
echo

echo "--- Step 1: baseline (both services up) ---"
curl -sS -m "$TIMEOUT" -o /tmp/outage_baseline.json -w 'HTTP %{http_code} in %{time_total}s\n' \
  -X POST "$ORDER_URL/orders" \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":1}]}'
cat /tmp/outage_baseline.json; echo
echo

echo "--- Step 2: stop the Restaurant Service ---"
docker compose stop restaurant-service
echo "restaurant-service stopped"
echo

echo "--- Step 3: submit an order while the dependency is down ---"
START=$(date +%s%3N)
CODE=$(curl -sS -m "$TIMEOUT" -o /tmp/outage_failure.json -w '%{http_code}' \
  -X POST "$ORDER_URL/orders" \
  -H 'content-type: application/json' \
  -H 'x-correlation-id: cor_outage_demo' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":1}]}')
END=$(date +%s%3N)
ELAPSED=$(( END - START ))
echo "HTTP $CODE in ${ELAPSED}ms (curl timeout was ${TIMEOUT}s)"
cat /tmp/outage_failure.json; echo
echo

echo "--- Step 4: restore the Restaurant Service ---"
docker compose start restaurant-service
sleep 6
curl -sS -m "$TIMEOUT" -o /dev/null -w 'recovered: HTTP %{http_code} in %{time_total}s\n' \
  -X POST "$ORDER_URL/orders" \
  -H 'content-type: application/json' \
  -d '{"restaurant_id":1,"items":[{"menu_item_id":101,"quantity":1}]}'
echo
echo "=== Outage experiment finished ==="
