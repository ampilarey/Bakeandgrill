import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotifications(token: string | null) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && Boolean(VAPID_PUBLIC_KEY));
  }, []);

  const subscribe = async () => {
    if (!supported || !token) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const key = sub.getKey("p256dh");
      const auth = sub.getKey("auth");

      await fetch(`${API_BASE}/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint:   sub.endpoint,
          p256dh_key: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : "",
          auth_key:   auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
        }),
      });
      setSubscribed(true);
    } catch (e) {
      console.error("Push subscribe failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_BASE}/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error("Push unsubscribe failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return { supported, subscribed, loading, subscribe, unsubscribe };
}
