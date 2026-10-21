import { AppNotification } from '../types';

export const notificationService = {
  getNotifications(): AppNotification[] {
    const data = localStorage.getItem('quantx_notifications');
    if (!data) return [];
    try {
      return JSON.parse(data) as AppNotification[];
    } catch {
      return [];
    }
  },

  addNotification(title: string, message: string, category: AppNotification['category']) {
    const notifications = this.getNotifications();
    const newNotif: AppNotification = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      title,
      message,
      category,
      read: false,
      created_at: new Date().toISOString(),
    };
    notifications.unshift(newNotif);
    localStorage.setItem('quantx_notifications', JSON.stringify(notifications));
    window.dispatchEvent(new Event('quantx_notification_added'));
  },

  markAllRead() {
    const notifications = this.getNotifications().map(n => ({ ...n, read: true }));
    localStorage.setItem('quantx_notifications', JSON.stringify(notifications));
    window.dispatchEvent(new Event('quantx_notification_added')); // reuse same event to trigger re-render
  },
  
  initialize() {
    if (!localStorage.getItem('quantx_notifications')) {
      const initial: AppNotification[] = [
        {
          id: 'n1',
          title: 'Paper Trading Capital Initialized',
          message: 'Your paper trading account is ready with virtual capital.',
          category: 'ACCOUNT',
          read: false,
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'n2',
          title: 'Market Session Open',
          message: 'NSE Equity market session is active. You can place simulated intraday and delivery orders.',
          category: 'MARKET',
          read: true,
          created_at: new Date(Date.now() - 86400000).toISOString(),
        }
      ];
      localStorage.setItem('quantx_notifications', JSON.stringify(initial));
    }
  }
};

notificationService.initialize();
