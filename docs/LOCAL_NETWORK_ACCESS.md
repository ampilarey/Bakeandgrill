# Accessing Bake & Grill from Other Devices on Your Network

If **http://192.168.137.212:8000** (or your Mac’s IP:8000) does not load from another device, the **macOS firewall** is usually blocking incoming connections.

## Fix: Allow PHP in the firewall

1. **Open Firewall settings**  
   **System Settings** → **Network** → **Firewall** → **Options…**

2. **Allow PHP**  
   - Click **+** (Add).  
   - Go to **Applications** → **Other…** (or press **Cmd+Shift+G**).  
   - Enter: `/usr/local/bin/php`  
   - Select **php** and click **Open**.  
   - Set **php** to **Allow incoming connections**.  
   - Click **OK**.

3. **Restart the backend** (if it’s already running):
   ```bash
   cd backend && php artisan serve --host=0.0.0.0
   ```

4. **Test from another device**  
   On a phone or another computer on the same Wi‑Fi, open:  
   **http://YOUR_MAC_IP:8000**  
   (e.g. http://192.168.137.212:8000)

## Optional: Allow Node (for online ordering on port 3003)

If you also want to open the **online ordering** app (Vite) on the network (e.g. http://192.168.137.212:3003/order/):

- Add **Node** in the same way: find `node` (often `/usr/local/bin/node` or the path from `which node`) and set it to **Allow incoming connections**.

## Check your Mac’s IP

In Terminal:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```
Use the `inet` address (e.g. 192.168.137.212) in the browser on other devices.
