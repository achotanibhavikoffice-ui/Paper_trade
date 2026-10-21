import { useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { applyTheme, getTheme, type Theme } from '../theme';

const themes: { id: Theme; title: string; description: string; Icon: typeof Sun }[] = [
  { id: 'light', title: 'Light mode', description: 'A bright workspace for well-lit rooms.', Icon: Sun },
  { id: 'dark', title: 'Dark mode', description: 'A darker workspace for low-light environments.', Icon: Moon },
];

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(getTheme);

  function selectTheme(nextTheme: Theme) {
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <>
      <PageHeader
        title="Settings"
        eyebrow="WORKSPACE PREFERENCES"
        description="Personalize how Quantx looks and behaves on this device."
        breadcrumbs={[{ label: 'Settings' }]}
      />

      <section className="settings-card" aria-labelledby="appearance-heading">
        <div className="settings-card-heading">
          <div>
            <span className="settings-eyebrow">APPEARANCE</span>
            <h2 id="appearance-heading">Theme</h2>
            <p>Choose the look used across your Quantx workspace. Your choice is saved on this device.</p>
          </div>
          <span className="settings-current"><i /> {theme === 'dark' ? 'Dark mode' : 'Light mode'} active</span>
        </div>

        <div className="settings-theme-options" role="group" aria-label="Color theme">
          {themes.map(({ id, title, description, Icon }) => {
            const selected = theme === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                className={`settings-theme-option ${selected ? 'selected' : ''}`}
                onClick={() => selectTheme(id)}
              >
                <span className="settings-theme-icon"><Icon size={20} /></span>
                <span className="settings-theme-copy"><strong>{title}</strong><small>{description}</small></span>
                <span className="settings-theme-check" aria-hidden="true">{selected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
        <p className="settings-note">Theme changes apply immediately and remain selected after you sign out or reload.</p>
      </section>
    </>
  );
}
