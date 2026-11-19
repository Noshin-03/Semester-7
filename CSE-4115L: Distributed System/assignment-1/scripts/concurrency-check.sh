#!/usr/bin/env bash
set -uo pipefail

ORDER_URL="${1:-http://localhost:8082}"
COUNT="${2:-20}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== Concurrency experiment: $COUNT concurrent POST $ORDER_URL/orders ==="
echo

for i in $(seq 1 "$COUNT"); do
  R=$(( (i % 4) + 1 ))
  ITEM=$(( R * 100 + (i % 2) + 1 ))
  QTY=$(( (i % 3) + 1 ))
  (
    curl -sS -o "$TMP_DIR/body_$i.json" -w '%{http_code}\n' \
      -X POST "$ORDER_URL/orders" \
      -H 'content-type: application/json' \
      -H "x-correlation-id: cor_conc_$(printf '%03d' "$i")" \
      -d "{\"restaurant_id\":${R},\"items\":[{\"menu_item_id\":${ITEM},\"quantity\":${QTY}}]}" \
      > "$TMP_DIR/status_$i.txt"
  ) &
done
wait

echo "--- HTTP status codes ---"
cat "$TMP_DIR"/status_*.txt | sort | uniq -c

echo
echo "--- Unique order_ids + state integrity ---"
node -e '
const fs = require("node:fs");
const dir = process.argv[1];
const files = fs.readdirSync(dir).filter((f) => f.startsWith("body_"));
const ids = new Set();
let corrupt = 0;
for (const f of files) {
  const raw = fs.readFileSync(`${dir}/${f}`, "utf8");
  let body;
  try { body = JSON.parse(raw); } catch { console.log(`  UNPARSEABLE: ${f}`); corrupt++; continue; }
  if (!body.order_id) { console.log(`  NO ORDER_ID: ${f} -> ${raw.slice(0,120)}`); corrupt++; continue; }
  ids.add(body.order_id);
  const expected = (body.items ?? []).reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  if (expected !== body.total_cents) { console.log(`  TOTAL MISMATCH in ${f}`); corrupt++; }
  if (body.status !== "CONFIRMED") { console.log(`  BAD STATUS in ${f}: ${body.status}`); corrupt++; }
  if (!body.correlation_id) { console.log(`  MISSING CORRELATION_ID in ${f}`); corrupt++; }
}
console.log(`orders created : ${files.length}`);
console.log(`unique ids     : ${ids.size}`);
console.log(`corrupt orders : ${corrupt}`);
if (ids.size === files.length && corrupt === 0 && files.length > 0) {
  console.log("RESULT         : PASS - every order has a unique id and intact state");
  process.exit(0);
}
console.log("RESULT         : FAIL");
process.exit(1);
' "$TMP_DIR"
CHECK_EXIT=$?

echo
echo "--- Every created order is retrievable via GET /orders/{id} ---"
FAIL=0
COUNT_OK=0
while read -r ID; do
  [ -z "$ID" ] && continue
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$ORDER_URL/orders/$ID")
  if [ "$CODE" != "200" ]; then
    echo "  $ID -> HTTP $CODE (unexpected)"
    FAIL=1
  else
    COUNT_OK=$(( COUNT_OK + 1 ))
  fi
done < <(grep -ho '"order_id":"[^"]*"' "$TMP_DIR"/body_*.json | sed -E 's/.*"order_id":"([^"]+)".*/\1/' | sort -u)

if [ "$FAIL" -eq 0 ]; then
  echo "RESULT         : PASS - all $COUNT_OK orders fetched successfully"
else
  echo "RESULT         : FAIL - some orders could not be fetched"
  exit 1
fi

exit $CHECK_EXIT
