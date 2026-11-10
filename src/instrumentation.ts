export async function register() {
  // Notifications and the food tracker use Node's crypto, timers and fetch, and only run in the Node.js server.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNotifications } = await import('@/lib/notifications');
    startNotifications();
    const { startFoodTracker } = await import('@/lib/food-tracker-sync');
    startFoodTracker();
  }
}
