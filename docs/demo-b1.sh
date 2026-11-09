#!/bin/sh
# Phase B1 demo: import the real stock file, review it, scan a barcode, print labels, roll back.
# Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... sh docs/demo-b1.sh   (API on http://localhost:4000, storage in mock mode)
API=${API:-http://localhost:4000/api/v1}
FILE=${FILE:-docs/source/Master_Sheet_Krishnas_Orchids_Nov_2026.xlsb}
j() { python -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
H() { echo "authorization: Bearer $TOKEN"; }
TOKEN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | j "d['accessToken']")
CT="application/vnd.ms-excel.sheet.binary.macroEnabled.12"; SIZE=$(wc -c < "$FILE" | tr -d ' ')
echo "1. Ask for an upload URL (type and size are checked), then upload the file straight to storage"
P=$(curl -s -X POST $API/uploads/presign -H "$(H)" -H 'content-type: application/json' -d "{\"purpose\":\"import\",\"filename\":\"stock.xlsb\",\"contentType\":\"$CT\",\"size\":$SIZE}")
KEY=$(echo "$P" | j "d['key']"); URL=$(echo "$P" | j "d['uploadUrl']")
curl -s -X PUT "$URL" -H "content-type: $CT" --data-binary @"$FILE"; echo
echo "2. Register the import: sheets are detected and the saved Krishnas Orchids mapping is suggested"
IMP=$(curl -s -X POST $API/imports -H "$(H)" -H 'content-type: application/json' -d "{\"fileKey\":\"$KEY\",\"filename\":\"stock.xlsb\",\"target\":\"opening_stock\"}")
ID=$(echo "$IMP" | j "d['id']"); echo "$IMP" | j "d['suggestedMapping']['name'], d['suggestedMapping']['sheet']"
MAP=$(echo "$IMP" | j "__import__('json').dumps({'sheet':d['suggestedMapping']['sheet'],'mapping':d['suggestedMapping']['mapping']})")
curl -s -X PUT $API/imports/$ID/mapping -H "$(H)" -H 'content-type: application/json' -d "$MAP" | j "'status:', d['status']"
echo "3. Dry run (writes nothing)"
curl -s $API/imports/$ID/preview -H "$(H)" | j "'\n'.join(str(x) for x in [d['counts'], d['totals']] + d['notes'])"
echo "4. Commit (batched, one transaction per batch, resumable)"
curl -s -X POST $API/imports/$ID/commit -H "$(H)" -H 'content-type: application/json' -d '{}' | j "d"
echo "5. Review queue summary, and HSN codes with no GST rate rule"
curl -s $API/imports/data-quality -H "$(H)" | j "d['summary'], d['hsnWithoutRate']"
echo "6. Approve every HSN suggestion in bulk (never applied silently)"
curl -s -X PATCH $API/imports/review-queue/bulk -H "$(H)" -H 'content-type: application/json' -d '{"reason":"MISSING_HSN","action":"apply_suggestion"}'; echo
echo "7. Scan a barcode"
curl -s "$API/items/lookup?barcode=KO1000369" -H "$(H)" | j "d['variant']['itemCode'], d['price'], d['stockByStore']"
echo "8. Print labels (50 x 25 mm PDF)"
VID=$(curl -s "$API/items/lookup?barcode=KO1000369" -H "$(H)" | j "d['variant']['id']")
curl -s -X POST $API/labels/print -H "$(H)" -H 'content-type: application/json' -d "{\"items\":[{\"variantId\":\"$VID\",\"copies\":3}]}" -o /tmp/labels.pdf && echo "saved /tmp/labels.pdf ($(wc -c < /tmp/labels.pdf) bytes)"
echo "9. Roll the batch back (set ROLLBACK=1 to run)"
if [ "$ROLLBACK" = "1" ]; then curl -s -X POST $API/imports/$ID/rollback -H "$(H)" -H 'content-type: application/json' -d '{}'; echo; fi
