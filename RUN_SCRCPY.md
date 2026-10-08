# Mirror the phone with scrcpy

[scrcpy](https://github.com/Genymobile/scrcpy) shows the connected Android phone in a window on the laptop, so you can watch and control the DahonMD app while testing.

## Requirements

- An Android phone with **USB debugging** turned on
- A USB cable
- scrcpy unzipped at:

  ```
  C:\Users\feann\Downloads\scrcpy-win64-v5.0
  ```

## Quick start

1. Connect the phone to the laptop with the USB cable.
2. Unlock the phone.
3. Check that **USB debugging** is still on.
4. Open the scrcpy folder:

   ```
   C:\Users\feann\Downloads\scrcpy-win64-v5.0
   ```

5. Double-click **`scrcpy`** (Type: *Application*).

The phone-mirroring window opens.

## Run from the command line

If double-clicking does nothing, open Command Prompt in the scrcpy folder and run:

```bat
scrcpy.exe
```

## Troubleshooting

### "Device disconnected"

Check that the laptop can see the phone:

```bat
adb.exe devices
```

The phone should be listed with **`device`** beside it:

```
List of devices attached
G6XG45TOSOVWL7TO    device
```

If the phone is missing:

- Unplug and reconnect the USB cable.
- Unlock the phone and tap **Allow** if it asks to allow USB debugging.
- Check that USB debugging is still on.

Then run `scrcpy.exe` again.
