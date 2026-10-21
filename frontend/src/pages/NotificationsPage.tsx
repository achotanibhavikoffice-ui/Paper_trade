import { useState, useEffect } from 'react';
import { Bell, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { TabNavigation } from '../components/common/TabNavigation';
import { EmptyState } from '../components/common/EmptyState';
import type { AppNotification } from '../types';
import { notificationService } from '../services/notificationService';

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeTab, setActiveTab] = useState('ALL');

  useEffect(() => {
    const loadNotifs = () => setNotifications(notificationService.getNotifications());
    loadNotifs();
    window.addEventListener('tradeo_notification_added', loadNotifs);
    return () => window.removeEventListener('tradeo_notification_added', loadNotifs);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const tabs = [
    { id: 'ALL', label: 'All Notifications', badge: notifications.length },
    { id: 'UNREAD', label: 'Unread', badge: unreadCount },
    { id: 'ACCOUNT', label: 'Account' },
    { id: 'MARKET', label: 'Market Alerts' },
  ];

  const filtered = notifications.filter((n) => {
    if (activeTab === 'UNREAD') return !n.read;
    if (activeTab === 'ACCOUNT') return n.category === 'ACCOUNT' || n.category === 'SECURITY';
    if (activeTab === 'MARKET') return n.category === 'MARKET';
    return true;
  });

  function markAllRead() {
    notificationService.markAllRead();
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        eyebrow="SYSTEM & MARKET ALERTS"
        description="Stay informed with updates regarding your paper trading account, market sessions, and security."
        breadcrumbs={[{ label: 'Notifications' }]}
        actions={
          unreadCount > 0 ? (
            <button onClick={markAllRead} className="button button-dark text-xs flex items-center gap-1.5">
              <Check size={15} /> Mark all as read
            </button>
          ) : undefined
        }
      />

      <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description={
            activeTab === 'UNREAD'
              ? 'You are all caught up! There are no unread notifications.'
              : 'No notifications match the selected category.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const timeStr = new Intl.DateTimeFormat('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              day: 'numeric',
              month: 'short',
            }).format(new Date(item.created_at));

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl border transition-colors flex items-start justify-between gap-4 ${
                  !item.read
                    ? 'bg-blue-500/5 border-blue-500/30'
                    : 'bg-white/60 border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    item.category === 'ACCOUNT'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : item.category === 'SECURITY'
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    {item.category === 'ACCOUNT' ? <ShieldCheck size={18} /> : <Sparkles size={18} />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-800">{item.title}</h4>
                      {!item.read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" title="Unread" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.message}</p>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap shrink-0">
                  {timeStr}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
