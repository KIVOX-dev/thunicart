#!/bin/sh
# Phase B2 demo: buy, receive, bill, pay, move and count stock.
# Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... sh docs/demo-b2.sh   (API on http://localhost:4000)
API=${API:-http://localhost:4000/api/v1}
j() { python -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1"; }
TOKEN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | j "d['accessToken']")
req() { # method path body [idempotency-key]
  curl -s -X "$1" "$API$2" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' ${4:+-H "Idempotency-Key: $4"} ${3:+-d "$3"}
}
R=$(date +%s)
echo "1. Set up: a Tiruppur vendor (state 33), a Surat vendor (state 24), an item"
SHOP=$(req GET "/stores" | j "[s['id'] for s in d['items'] if s['type']=='shop'][0]")
KH=$(req POST /vendors "{\"name\":\"Knitwear Hub Corp $R\",\"email\":\"s$R@knit.in\",\"mobile\":\"98$(printf %08d $((R % 100000000)))\",\"city\":\"Tiruppur\",\"stateCode\":\"33\",\"paymentTerms\":\"NET15\"}" | j "d['id']")
TX=$(req POST /vendors "{\"name\":\"TexStyles $R\",\"email\":\"t$R@tex.in\",\"mobile\":\"97$(printf %08d $((R % 100000000)))\",\"city\":\"Surat\",\"stateCode\":\"24\",\"paymentTerms\":\"NET30\"}" | j "d['id']")
VID=$(req POST /items "{\"name\":\"Demo Tee $R\",\"hsn\":\"6109\",\"variants\":[{\"size\":\"M\",\"mrp\":45000,\"sellingPrice\":45000,\"reorderLevel\":5}]}" | j "d['variants'][0]['id']")
echo "   vendor $KH, $TX, variant $VID"
echo "2. Purchase order to Knitwear Hub: 500 at Rs 150.00, 5% GST (GST is $(curl -s $API/settings/gst-status -H "authorization: Bearer $TOKEN" | j "d['gstMode']"))"
PO=$(req POST /purchase-orders "{\"vendorId\":\"$KH\",\"storeId\":\"$SHOP\",\"lines\":[{\"variantId\":\"$VID\",\"qty\":500,\"unitCost\":15000,\"gstRate\":5}]}")
POID=$(echo "$PO" | j "d['id']"); echo "$PO" | j "d['poNumber'], d['status'], d['totals']"
[ "$(echo "$PO" | j "d['requiresApproval']")" = "True" ] && req POST /purchase-orders/$POID/approve > /dev/null && echo "   approved (above the limit)"
req POST /purchase-orders/$POID/send | j "d['status']"
echo "3. Receive 495 (a short receipt). Idempotency-Key makes a retry safe."
GRN=$(req POST /grn "{\"poId\":\"$POID\",\"vendorInvoiceNo\":\"KH-$R\",\"vendorInvoiceDate\":\"2026-11-06T00:00:00.000Z\",\"lines\":[{\"variantId\":\"$VID\",\"receivedQty\":495}]}" "grn-$R")
echo "$GRN" | j "d['grnNumber'], d['totals']"
GID=$(echo "$GRN" | j "d['id']")
req POST /grn "{\"poId\":\"$POID\",\"vendorInvoiceNo\":\"KH-$R\",\"vendorInvoiceDate\":\"2026-11-06T00:00:00.000Z\",\"lines\":[{\"variantId\":\"$VID\",\"receivedQty\":495}]}" "grn-$R" | j "'retry returns the same GRN:', d['id']==\"$GID\""
req GET /purchase-orders/$POID | j "d['status'], 'pending', d['lines'][0]['pendingQty']"
echo "4. Bill, pay part, and see what we owe"
BILL=$(req POST /purchase-bills "{\"vendorId\":\"$KH\",\"vendorBillNo\":\"BILL-$R\",\"billDate\":\"2026-11-06T00:00:00.000Z\",\"grnIds\":[\"$GID\"]}" "bill-$R")
echo "$BILL" | j "d['billNumber'], 'due', d['dueDate'][:10], 'total', d['grandTotal']"
BID=$(echo "$BILL" | j "d['id']")
req POST /vendor-payments "{\"vendorId\":\"$KH\",\"date\":\"2026-11-09T00:00:00.000Z\",\"mode\":\"upi\",\"reference\":\"UTR$R\",\"amount\":2000000,\"allocations\":[{\"billId\":\"$BID\",\"amount\":2000000}]}" "pay-$R" | j "d['paymentNumber'], d['amount']"
req GET /vendors/$KH/outstanding | j "d['outstanding'], d['ageing']"
echo "5. Return 5 pieces: debit note, stock out"
req POST /purchase-returns "{\"billId\":\"$BID\",\"reason\":\"Wrong colour\",\"lines\":[{\"variantId\":\"$VID\",\"qty\":5}]}" "ret-$R" | j "d['debitNoteNumber'], d['totals']['total']"
echo "6. Weighted average cost, stock, and the ledger"
req GET "/stock?q=Demo%20Tee%20$R" | j "[(i['itemCode'], i['onHand'], i['baseCost'], i['stockStatus']) for i in d['items']]"
req GET "/stock/ledger?variantId=$VID" | j "[(r['type'], r['qty'], r['docNumber']) for r in d['items']]"
echo "7. Transfer 100 to the warehouse, receive 98, record the shortfall"
WH=$(req GET "/stores" | j "[s['id'] for s in d['items'] if s['type']=='warehouse'][0]")
TR=$(req POST /stock/transfers "{\"fromStoreId\":\"$SHOP\",\"toStoreId\":\"$WH\",\"lines\":[{\"variantId\":\"$VID\",\"qty\":100}]}" "tr-$R"); TID=$(echo "$TR" | j "d['id']")
req POST /stock/transfers/$TID/dispatch "{}" "disp-$R" | j "d['status'], 'in transit', d['inTransitTotal']"
req POST /stock/transfers/$TID/receive "{\"lines\":[{\"variantId\":\"$VID\",\"receivedQty\":98}],\"final\":true}" "rec-$R" | j "d['status'], d['lines']"
req GET /stock/transfers/discrepancies | j "[(x['transferNumber'], x['qty'], x['status']) for x in d['items'] if x['status']=='open']"
echo "8. Stock audit of the shop"
AUD=$(req POST /stock/audits "{\"storeId\":\"$SHOP\"}"); AID=$(echo "$AUD" | j "d['id']")
BC=$(req GET "/stock/ledger?variantId=$VID&pageSize=1" | j "d['items'][0]['itemCode']")
req POST /stock/audits/$AID/scan "{\"barcode\":\"$BC\",\"qty\":390,\"set\":true}" | j "d"
req GET /stock/audits/$AID | j "d['summary']"
req POST /stock/audits/$AID/approve "{}" "aud-$R" | j "d['status'], 'posted', d['postedLines']"
echo "9. Reorder alerts"
req GET /stock/reorder-alerts | j "d['totalItems'], 'items need ordering'"
