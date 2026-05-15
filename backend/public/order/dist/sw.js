// Bake & Grill — Service Worker for Push Notifications

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title ?? "Bake & Grill";
  const body  = data.body  ?? "You have a new notification.";
  const url   = data.url   ?? "/order/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  "/logo.svg",
      badge: "/logo.svg",
      data:  { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/order/";
  event.waitUntil(clients.openWindow(url));
});
