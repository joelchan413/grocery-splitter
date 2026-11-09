export async function register() {
  // Notifications use Node's crypto and timers, and only run in the Node.js server.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNotifications } = await import('@/lib/notifications');
    startNotifications();
  }
}
