# DahonMD test automation

## 🚀 Quick start: choose the website and phone automation

Run these commands in **Windows PowerShell from the project folder**. The
`-ExecutionPolicy Bypass` setting applies only to the new PowerShell process;
it does not change the system-wide policy.

```powershell
Set-Location 'C:\Users\feann\OneDrive\Documents\Banana-Leaf-Disease-Scanner'
```

| Situation | Command to run | What happens to the phone |
| --- | --- | --- |
| **First setup; USB debugging is stable** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1` | If ADB sees the phone, the script installs the APK and connects it through USB. If no phone is detected, it starts an HTTPS link and shows a QR code. |
| **Phone needs a new APK and an HTTPS link** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Cloudflare` | With an authorized ADB phone, builds the APK if the mobile source or test mode changed, installs it, and sends the HTTPS link. Without ADB, use the QR code or `/connect.html` after installing the APK separately. |
| **APK is already installed; ADB reconnects reliably** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Cloudflare -SkipPhone -AutoConnectPhone` | Starts an HTTPS link without reinstalling the APK. A background watcher sends that link when the phone appears or reappears as `device` in ADB. If ADB is absent, a QR image opens on the laptop. |
| **APK is installed; USB/ADB stays unavailable** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Cloudflare -SkipPhone` | Starts the website only. On the phone, open `<printed-link>/connect.html` and tap **Open DahonMD app**. **Use this when USB is unreliable.** |
| **HTTPS link is already running; enable reconnection watching now** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -WatchPhone` | Starts the watcher for the current link without restarting the website or changing its URL. |
| **Watcher is already running; USB was unplugged and reconnected** | **No command needed.** | When ADB recognizes the phone again, the watcher sends the same running HTTPS link. |
| **Cloudflare is unavailable; phone stays on USB** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -UsbOnly` | Installs the APK, creates an ADB reverse connection, and sends the local `http://127.0.0.1:4174` address. Keep USB attached for connected features. |
| **Force a fresh Android build** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Cloudflare -ForceApkBuild` | With an authorized ADB phone, rebuilds and installs the APK even if the source fingerprint is unchanged. |
| **Stop the test services and watcher** | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -Stop` | Stops the website, API, tunnel, and reconnect watcher started by this script. The installed app remains on the phone. |

Add `-NoOpen` to a start command when you do not want the laptop browser or QR
image to open automatically. It does **not** skip APK installation or phone
connection. `-SkipPhone` does skip APK installation and direct phone setup;
combine it with `-AutoConnectPhone` when you want the reconnect watcher.

### What the phone automation does

- **APK installation** happens only when `-SkipPhone` is absent and an authorized
  phone appears as `device` in `adb devices`. The script may rebuild when mobile
  code changes or when switching between the USB and Cloudflare test builds. It
  reinstalls the APK on every such run, even if a rebuild was unnecessary; this
  can take time for a large test APK. If the app is missing and ADB is unavailable,
  install a test APK manually before using the HTTPS connection commands. See
  [Build a shareable APK](README.md#build-a-shareable-apk).
- **Reconnect watching** sends the current HTTPS server address to the
  **already-installed** app when an authorized ADB phone appears or reappears.
  It cannot reach a phone that does not appear in `adb devices`; a tunnel by
  itself does not provide a way to push a new address to the app. It does not
  repair an unstable USB connection, build an APK, or install one. An ADB launch
  means the link was opened, so confirm **Server connected** on the phone.
  The watcher stops when `-Stop` runs or a new test run replaces the link. Its
  log is `.dahonmd\free-test\phone-watcher.log`.
- **Manual connection** needs no USB: open `<printed-link>/connect.html` in the
  phone browser and tap **Open DahonMD app**. Use Wi-Fi or mobile data, then
  confirm **Server connected** in the app. If Android does not open the app,
  open **Account → Server address** and enter the printed HTTPS link.
- **Reconnect from the app after the tunnel changes:** With Wi-Fi or mobile data
  on, tap the **No connection** icon, then **Try again**. The app checks its
  saved address first. If that address has expired, it opens a QR scanner. Scan
  `.dahonmd\free-test\connect-phone.png` displayed on the laptop. The app
  verifies and saves the new server address; use **Enter server address** if
  camera access is unavailable. A new server address requires signing in again.
  This needs an APK built with the QR scanner change; `-SkipPhone` does not
  update an older installed APK.

For an **offline scan**, open the installed app and use **Scan**; the launcher
and website are not needed. Airplane mode stops account sync and other connected
features while Wi-Fi and mobile data are off. When connectivity returns, the app
can sync with the same running server. The USB-only local address requires the
USB connection and ADB reverse to remain active.

### Link changes, restarts, and common failures

Every Cloudflare test run creates a **new temporary HTTPS link**. Keep the
computer and test processes running while using it. A previous link stops
working when its tunnel stops. The app signs out when its server address
changes, so reconnect to the new link and sign in again. The website link is
printed, copied to the clipboard, and saved in
`.dahonmd\free-test\tunnel-url.txt`.

- **Phone does not update:** If you used `-SkipPhone`, that is expected; it
  does not install new mobile code. Use the APK command above with reliable ADB,
  or install the newly built test APK separately. Website and API changes do
  not update the installed APK.
- **ADB shows no `device`:** Unlock the phone, allow USB debugging, and check
  it with the command below. The reconnect watcher can act only after ADB
  recognizes the phone. Use `/connect.html` when USB debugging is unavailable.
- **Website works but phone does not connect:** Check that the phone has Wi-Fi
  or mobile data, that it received the **current** HTTPS link, and that the
  laptop still has the tunnel running. Open `<printed-link>/api/health` to check
  the API and database.
- **Cloudflare fails:** The script retries HTTP/2 and QUIC. Check
  `.dahonmd\free-test\tunnel-*.err.log`; use `-UsbOnly` if Cloudflare remains
  unavailable and ADB is stable.
- **Port 8002 or 4174 is busy:** Stop the previous test run first. To inspect
  listeners, run
  `Get-NetTCPConnection -LocalPort 8002,4174 -State Listen | Select-Object LocalPort, OwningProcess`.

```powershell
$adb = Join-Path $env:LOCALAPPDATA 'dev-tools\platform-tools\adb.exe'
& $adb devices -l
```

After unplugging a **USB-only** phone, its ADB reverse connection may be lost.
Reconnect USB and rerun `& $adb reverse tcp:4174 tcp:4174` while the local
server is still running, then open the app again. The HTTPS reconnect watcher
does not maintain USB-only loopback connections.

Test data lives in `.dahonmd\free-test\` and is kept between runs. Pending
backend migrations run at startup; test emails are written only to the log.

[Back to main README](README.md).
