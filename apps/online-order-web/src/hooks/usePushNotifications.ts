import { useCallback, useEffect, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

async function fetchVapidKey(): Promise<string> {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (envKey) return envKey;

  try {
    const res = await fetch(`${API_BASE}/push/vapid-key`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { public_key?: string };
    return data.public_key ?? "";
  } catch {
    return "";
  }
}

export function usePushNotifications(isAuthenticated: boolean) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState<string>("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    void fetchVapidKey().then((key) => {
      if (key) {
        setVapidKey(key);
        setSupported(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(existing));
    });
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || !isAuthenticated || !vapidKey) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
      const key  = sub.getKey("p256dh");
      const auth = sub.getKey("auth");

      const res = await fetch(`${API_BASE}/push/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          endpoint:   sub.endpoint,
          p256dh_key: key  ? btoa(String.fromCharCode(...new Uint8Array(key)))  : "",
          auth_key:   auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
        }),
      });

      if (!res.ok) throw new Error("Subscribe request failed");
      setSubscribed(true);
    } catch (e) {
      if (import.meta.env.DEV) console.error("[Push] Subscribe failed:", e);
    } finally {
      setLoading(false);
    }
  }, [supported, isAuthenticated, vapidKey]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_BASE}/push/unsubscribe`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      if (import.meta.env.DEV) console.error("[Push] Unsubscribe failed:", e);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, subscribed, loading, subscribe, unsubscribe };
}
