#!/bin/sh
# Phase B0 demo. Usage: ADMIN_PASSWORD=... sh docs/demo-b0.sh   (API on http://localhost:4000)
API=${API:-http://localhost:4000/api/v1}
j() { python -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
echo "1. Admin logs in"
TOKEN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"email\":\"thunikartbykrishnasorchids@gmail.com\",\"password\":\"$ADMIN_PASSWORD\"}" | j "d['accessToken']")
echo "2. Create role Store Manager (items.view, stock.view, pos.view, pos.create)"
ROLE=$(curl -s -X POST $API/roles -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"name":"Store Manager","permissions":["items.view","stock.view","pos.view","pos.create"]}' | j "d['id']")
echo "   role id $ROLE"
echo "3. Create a user with that role"
curl -s -X POST $API/users -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"name\":\"Meena K\",\"email\":\"meena@thunikart.local\",\"password\":\"Shop-Floor-2026\",\"roleId\":\"$ROLE\"}" | j "d['email']+' / '+d['roleName']"
echo "4. That user logs in, then calls endpoints outside their permissions"
MT=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d '{"email":"meena@thunikart.local","password":"Shop-Floor-2026"}' | j "d['accessToken']")
for p in users roles settings/business activity-log number-series; do printf "   GET /%s -> " $p; curl -s -o /dev/null -w "%{http_code}\n" $API/$p -H "authorization: Bearer $MT"; done
echo "5. GST status (starts off)"; curl -s $API/settings/gst-status -H "authorization: Bearer $TOKEN"; echo
PROFILE='"legalName":"Krishnas Orchids","brandName":"Thunikart","addressLines":["Near KN Hall"],"city":"Coimbatore","state":"Tamil Nadu","stateCode":"33","pincode":"641016","phone":"8400044191","email":"","website":"","logoKey":null,"pan":"","defaultPrintSize":"4x6","termsText":"T","invoiceFooter":"Thanks"'
echo "6. Save a GSTIN with a bad checksum"
curl -s -X PUT $API/settings/business -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{$PROFILE,\"gstin\":\"33ABCDE1234F1ZA\"}"; echo
echo "7. Save a valid GSTIN (33ABCDE1234F1Z7)"
curl -s -X PUT $API/settings/business -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{$PROFILE,\"gstin\":\"${VALID_GSTIN:-33ABCDE1234F1Z7}\"}" | j "{k:d.get(k) for k in ['gstEnabled','gstGoLiveAt','message']}"
curl -s $API/settings/gst-status -H "authorization: Bearer $TOKEN"; echo
echo "8. Next numbers"; curl -s $API/number-series -H "authorization: Bearer $TOKEN" | j "[s['next'] for s in d['items']]"
