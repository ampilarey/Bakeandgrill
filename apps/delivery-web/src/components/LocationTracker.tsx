import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { DriverLocation } from '../types';

const BATCH_INTERVAL_MS = 15_000;  // send every 15s
const COLLECT_INTERVAL_MS = 5_000; // collect every 5s

/**
 * Background component — renders nothing.
 * Watches geolocation, batches updates and sends to the backend every 15s.
 * Active whenever the driver is logged in.
 */
export default function LocationTracker() {
  const buffer  = useRef<DriverLocation[]>([]);
  const watchId = useRef<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    // Collect positions
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermissionDenied(false);
        buffer.current.push({
          latitude:    pos.coords.latitude,
          longitude:   pos.coords.longitude,
          heading:     pos.coords.heading,
          speed:       pos.coords.speed,
          recorded_at: new Date(pos.timestamp).toISOString(),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
        } else {
          console.warn('[LocationTracker] geolocation error:', err.message);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge:         COLLECT_INTERVAL_MS,
        timeout:            10_000,
      },
    );

    // Flush buffer periodically
    const flushId = setInterval(async () => {
      if (buffer.current.length === 0) return;
      const payload = [...buffer.current];
      buffer.current = [];
      try {
        await api.postLocation(payload);
      } catch {
        // Put failed updates back so we don't lose them; cap at 50 to prevent unbounded growth
        const merged = [...payload, ...buffer.current];
        buffer.current = merged.slice(0, 50);
      }
    }, BATCH_INTERVAL_MS);

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      clearInterval(flushId);
    };
  }, []);

  if (permissionDenied) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
        background: '#ef4444', color: '#fff',
        padding: '10px 16px', fontSize: 14, textAlign: 'center',
        fontWeight: 600,
      }}>
        Location permission denied. Please enable location access to track deliveries.
      </div>
    );
  }

  return null;
}
