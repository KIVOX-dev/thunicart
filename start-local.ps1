# Starts everything Thunikart needs on this computer, each in its own hidden window. Run it with:  powershell -ExecutionPolicy Bypass -File D:\thunicart\start-local.ps1
# Ports: database 27019, backend 4000, online store 3000, admin 5180. (5173 and 27018 are left alone: other projects use them.)
$ErrorActionPreference = 'Stop'
$root = 'D:\thunicart'
$logs = 'D:\tmp'
New-Item -ItemType Directory -Force $logs | Out-Null
$env:TEMP = $logs; $env:TMP = $logs
function Up($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Wait($port, $secs) { for ($i = 0; $i -lt $secs; $i++) { if (Up $port) { return $true }; Start-Sleep 1 }; return $false }

# 1. Database: the newest saved Thunikart data folder, as a one node replica set on 27019.
if (-not (Up 27019)) {
  $data = Get-ChildItem $logs -Directory -Filter 'mongo-mem-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $data) { throw 'No saved database folder found in D:\tmp (mongo-mem-*).' }
  Start-Process -FilePath "$env:USERPROFILE\.cache\mongodb-binaries\mongod-x64-win32-7.0.24.exe" -ArgumentList '--port', '27019', '--dbpath', $data.FullName, '--replSet', 'rs0', '--bind_ip', '127.0.0.1', '--noauth' -WindowStyle Hidden -RedirectStandardOutput "$logs\mongo27019.out" -RedirectStandardError "$logs\mongo27019.err"
  if (-not (Wait 27019 30)) { throw 'Database did not start.' }
  Start-Sleep 5
}
'database  27019 ok'

# 2. Backend API (allows the admin on 5180 and the store on 3000).
if (-not (Up 4000)) {
  $env:MONGODB_URI = 'mongodb://127.0.0.1:27019/?replicaSet=rs0'; $env:ADMIN_URL = 'http://localhost:5180'; $env:STOREFRONT_URL = 'http://localhost:3000'
  Start-Process -FilePath node.exe -ArgumentList '--env-file=.env', '--import', 'file:///D:/thunicart/node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/loader.mjs', 'src/main.ts' -WorkingDirectory "$root\backend" -WindowStyle Hidden -RedirectStandardOutput "$logs\backend.out" -RedirectStandardError "$logs\backend.err"
  if (-not (Wait 4000 60)) { throw 'Backend did not start. See D:\tmp\backend.err' }
}
'backend    4000 ok'

# 3. Online store.
if (-not (Up 3000)) {
  $env:NEXT_PUBLIC_API_URL = 'http://localhost:4000/shop'; $env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
  Start-Process -FilePath cmd.exe -ArgumentList '/c', 'npx next dev -p 3000 > D:\tmp\store3000.out 2>&1' -WorkingDirectory "$root\frontend\storefront" -WindowStyle Hidden
  if (-not (Wait 3000 60)) { throw 'Store did not start. See D:\tmp\store3000.out' }
}
'store      3000 ok'

# 4. Admin app and billing counter.
if (-not (Up 5180)) {
  $env:VITE_API_URL = 'http://localhost:4000'; $env:VITE_STOREFRONT_URL = 'http://localhost:3000'
  Start-Process -FilePath cmd.exe -ArgumentList '/c', 'npx vite --port 5180 --strictPort > D:\tmp\admin5180.out 2>&1' -WorkingDirectory "$root\frontend\admin" -WindowStyle Hidden
  if (-not (Wait 5180 60)) { throw 'Admin did not start. See D:\tmp\admin5180.out' }
}
'admin      5180 ok'

''
'Online store:      http://localhost:3000'
'Admin (ERP, POS):  http://localhost:5180'
'Billing counter:   http://localhost:5180/billing'
