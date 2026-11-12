"""Extracts the stock sheet from the client .xlsb into src/mocks/data/stock.json for MSW mock mode.
Usage: python -I scripts/extract-stock.py ../../docs/source/Master_Sheet_Krishnas_Orchids_Nov_2026.xlsb
The output holds client data, so it is git ignored. The real import is done by the backend."""
import json, sys
from pyxlsb import open_workbook

def clean(v):
    return v.strip() if isinstance(v, str) else v

def hsn(v):
    if v is None: return ''
    if isinstance(v, float): return str(int(v))
    return str(v).strip()

def main(path):
    with open_workbook(path) as wb:
        def rows(name):
            with wb.get_sheet(name) as sh: return [[c.v for c in r] for r in sh.rows()]
        sheets = {s: rows(s) for s in wb.sheets}
    stock = sheets['STOCKSUMMARYASON07112026_071120']
    items = []
    for r in stock[1:]:
        if not r[1]: continue
        items.append(dict(code=clean(r[1]), name=clean(r[2]), printName=clean(r[3]), cat=clean(r[6]), model=clean(r[7]), brand=clean(r[8]),
                          size=clean(r[9]), hsn=hsn(r[12]), qty=int(r[13] or 0), cost=r[15], rate=r[17], mrp=r[19]))
    out = dict(sheets=[dict(name=s.strip(), rows=len(v)) for s, v in sheets.items() if len(v) > 1], items=items)
    json.dump(out, open('src/mocks/data/stock.json', 'w', encoding='utf8'), ensure_ascii=False)
    print(len(items), 'items', sum(i['qty'] for i in items), 'pieces')

main(sys.argv[1])
