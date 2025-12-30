# Safe Upload Procedure - Preventing Mac Crashes

If you're experiencing Mac crashes when uploading Arduino sketches with BLE, follow this procedure.

## The Problem

When Arduino uploads BLE sketches, the following can happen:
1. Arduino IDE uploads code and resets the board
2. Board immediately starts BLE advertising
3. macOS BLE stack (bluetoothd) detects the device mid-initialization
4. Conflict occurs between cached BLE data and new device
5. macOS kernel panic or system freeze

This is a **known issue** with macOS + Arduino BLE, especially on:
- macOS Monterey and newer
- Macs with Apple Silicon (M1/M2/M3)
- When uploading repeatedly without clearing BLE cache

## Safe Upload Procedure

### Step 1: Disable Bluetooth Before Upload

**Critical**: Turn off Bluetooth BEFORE uploading:

1. Click **Bluetooth icon** in macOS menu bar
2. Select **"Turn Bluetooth Off"**
3. Wait 2 seconds

Alternatively, use Terminal:
```bash
sudo killall bluetoothd
```

### Step 2: Upload the Sketch

1. Open Arduino IDE
2. Connect Arduino via USB
3. Select correct board and port
4. Click **Upload** (Ctrl+U / Cmd+U)
5. **Wait for upload to complete** (100%)

### Step 3: Wait for Initialization

**Don't turn Bluetooth back on immediately!**

1. Open **Serial Monitor** (115200 baud)
2. Wait for the messages:
   ```
   ✅ BLE initialized
   ⏳ Waiting 3 seconds before starting BLE...
   ✅ BLE advertising started
   ```
3. Wait an **additional 5 seconds** after seeing "BLE advertising started"

### Step 4: Re-enable Bluetooth

1. Turn Bluetooth back **ON**
2. Wait 3 seconds
3. Now safe to scan for devices in your app

---

## Alternative: Use Serial Upload Only (No BLE)

If crashes persist, you can disable BLE entirely during development:

### Option A: Comment Out BLE Code

In `multi-sensor-stream.ino`, add this at the top of `setup()`:

```cpp
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  // TEMPORARY: Skip BLE for testing
  Serial.println("BLE DISABLED FOR SAFE UPLOAD");
  Serial.println("Streaming data to Serial only...");

  // Initialize sensors...

  // Comment out these lines:
  // if (!BLE.begin()) { ... }
  // BLE.advertise();

  while(1) {
    // Just stream to Serial for testing
    // (add your sensor reading code here)
  }
}
```

### Option B: Use Conditional Compilation

Add this at the top of the file:

```cpp
// Set to 0 to disable BLE (for safe uploads)
#define ENABLE_BLE 0

// In setup():
#if ENABLE_BLE
  if (!BLE.begin()) {
    // BLE init
  }
#else
  Serial.println("BLE disabled - Serial output only");
#endif
```

---

## Clearing macOS BLE Cache

If you continue to have issues, clear the Bluetooth cache:

### Method 1: Reset Bluetooth Module (Safe)

1. Hold **Shift + Option** and click **Bluetooth menu bar icon**
2. Select **"Debug"** → **"Reset the Bluetooth module"**
3. Restart Mac
4. Try uploading again

### Method 2: Delete Bluetooth Plist (Advanced)

⚠️ **Warning**: This removes ALL paired Bluetooth devices

```bash
# Disable Bluetooth
sudo killall bluetoothd

# Remove BLE cache files
sudo rm -rf /Library/Preferences/com.apple.Bluetooth.plist
sudo rm -rf ~/Library/Preferences/com.apple.Bluetooth.plist
sudo rm -rf ~/Library/Preferences/ByHost/com.apple.Bluetooth.*

# Restart Bluetooth
sudo launchctl start com.apple.bluetoothd
```

After this, you'll need to re-pair all Bluetooth devices (keyboard, mouse, etc.)

---

## Modified Sketch with Extra Safety

I've updated the sketch to include:

### 1. 3-Second Startup Delay

Before BLE advertising starts, the sketch waits 3 seconds:

```cpp
Serial.println("⏳ Waiting 3 seconds before starting BLE...");
delay(3000);
BLE.advertise();
```

This gives macOS time to finish processing the USB connection before BLE advertising begins.

### 2. Serial Monitor Guidance

The sketch prints clear messages so you know when it's safe to enable Bluetooth:

```
✅ BLE initialized
⏳ Waiting 3 seconds before starting BLE...
   (This prevents potential BLE stack conflicts)
✅ BLE advertising started
```

---

## Debugging: Check for Kernel Panics

If your Mac actually crashes (kernel panic), check the crash logs:

1. Open **Console.app** (in /Applications/Utilities/)
2. Go to **Crash Reports**
3. Look for `bluetoothd` or `kernel` crashes
4. Check timestamps matching your upload attempts

Common indicators in crash logs:
- `bluetoothd` process crash
- `IOBluetoothFamily` kernel extension panic
- References to `UART` or `Serial` communication

---

## Known Arduino IDE Issues

### Issue 1: Auto-Reset During Upload

Arduino IDE resets the board immediately after upload, which starts BLE before you're ready.

**Workaround**: Add longer delay in `setup()` before `BLE.advertise()`

### Issue 2: Multiple Upload Attempts

Uploading multiple times in quick succession can confuse the BLE stack.

**Workaround**: Wait 10 seconds between uploads, or power cycle Arduino

### Issue 3: Port Scanning Conflicts

Arduino IDE scans serial ports continuously, which can conflict with BLE.

**Workaround**: Close Arduino IDE after upload, use standalone Serial Monitor

---

## Testing Without Risks

### Use Another Computer/Device for BLE Testing

If you have access to:
- **Another Mac**: Use it for BLE connections (not uploads)
- **iPhone/iPad**: Use a BLE scanner app (nRF Connect, LightBlue)
- **Linux/Windows PC**: Generally more stable for Arduino BLE development
- **Raspberry Pi**: Can act as BLE central device

### Upload on One Mac, Test on Another

**Safest workflow**:
1. Mac #1: Upload Arduino code with Bluetooth OFF
2. Disconnect Arduino from Mac #1
3. Power Arduino with USB power bank (or Mac with BT still off)
4. Mac #2: Connect via BLE for testing
5. For code changes: Repeat on Mac #1

---

## Quick Reference Checklist

Before every upload:

- [ ] Turn off Bluetooth
- [ ] Close any BLE apps (Electron app, nRF Connect, etc.)
- [ ] Upload sketch
- [ ] Wait for Serial message "BLE advertising started"
- [ ] Wait additional 5 seconds
- [ ] Turn Bluetooth back on
- [ ] Scan for devices

---

## If Mac Crashes Anyway

### Immediate Recovery

1. **Force restart**: Hold Power button for 10 seconds
2. **Boot into Safe Mode**: Hold Shift during startup
3. **Disable Bluetooth**: System Preferences → Bluetooth → OFF
4. **Restart normally**

### Prevent Future Crashes

1. Update macOS to latest version
2. Update Arduino IDE to latest version
3. Update ArduinoBLE library to latest version
4. Consider using USB Serial instead of BLE during development
5. Only enable BLE for final testing

---

## Alternative: Use Web Bluetooth API

If crashes persist, consider testing with **Chrome's Web Bluetooth** instead of Electron's noble library:

1. Create a simple HTML page with Web Bluetooth
2. Open in Chrome
3. Connect to Arduino
4. No system-level BLE conflicts

Example:
```html
<!DOCTYPE html>
<html>
<body>
  <button onclick="connectBLE()">Connect</button>
  <script>
    async function connectBLE() {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'NanoBLE-MultiSensor' }],
        optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
      });
      // Connect and stream...
    }
  </script>
</body>
</html>
```

This bypasses the native BLE stack and uses Chrome's implementation.

---

## Still Having Issues?

If none of these solutions work:

1. **Check Apple Forums**: Search "Arduino BLE macOS crash"
2. **File Arduino Bug Report**: https://github.com/arduino/ArduinoBLE/issues
3. **Use Linux VM**: VirtualBox with Ubuntu for Arduino development
4. **Consider Windows Bootcamp**: Windows handles Arduino BLE better

---

## Summary

**The crash is likely due to**:
- macOS BLE stack conflict during Arduino reset
- Cached BLE data from previous uploads
- Timing issue between USB and BLE initialization

**The solution**:
- Turn off Bluetooth before upload
- Add delays before BLE advertising
- Clear BLE cache if needed

The updated sketch now has a **3-second safety delay** to help prevent this issue.

Good luck! 🍀
