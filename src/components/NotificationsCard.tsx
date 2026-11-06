import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import {
  currentSubscription,
  disablePush,
  enablePush,
  getPushState,
  listDevices,
  removeDevice,
  sendTestPush,
  type PushDevice,
  type PushState,
} from '../lib/push';
import { relativeInline, ukDate } from '../lib/format';
import { toast } from './Toast';
import { Icon } from './Icon';
import { ListRow, Pill, SectionTitle } from './ui';

const STATE_HELP: Partial<Record<PushState, string>> = {
  unconfigured: "Notifications aren't set up for this copy of the app yet.",
  'needs-install':
    'On iPhone, notifications only work in the installed app. Add Job Tracker to your Home Screen (see Install the app below), open it from the new icon, then come back here.',
  unsupported: import.meta.env.DEV
    ? 'Notifications only work in the built app, not in local development.'
    : "This browser can't receive notifications. On a Mac, use Safari or Chrome.",
  denied:
    'Notifications are blocked for Job Tracker. On iPhone: Settings → Notifications → Jobs → Allow Notifications. On a Mac: allow them in your browser’s website settings, then reload.',
};

export function NotificationsCard() {
  const { settings } = useStore();
  const userId = settings.user_id;
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | null>(null);

  const refresh = useCallback(async () => {
    const s = await getPushState();
    setState(s);
    setThisEndpoint((await currentSubscription().catch(() => null))?.endpoint ?? null);
    if (s !== 'unconfigured') setDevices(await listDevices().catch(() => []));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function turnOn() {
    setBusy('on');
    try {
      const s = await enablePush(userId);
      if (s === 'on') toast('Notifications on. Your summary arrives at 8am.');
      else if (s === 'denied') toast('Notifications were blocked');
      await refresh();
    } catch (e) {
      toast(`Couldn't turn on notifications: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    setBusy('off');
    try {
      await disablePush();
      toast('Notifications off for this device');
      await refresh();
    } catch (e) {
      toast(`Couldn't turn off: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    try {
      toast(await sendTestPush());
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function forget(d: PushDevice) {
    if (!window.confirm(`Stop sending notifications to ${d.device ?? 'this device'}?`)) return;
    try {
      await removeDevice(d.id);
      await refresh();
    } catch (e) {
      toast(`Couldn't remove: ${(e as Error).message}`);
    }
  }

  const help = state ? STATE_HELP[state] : undefined;

  return (
    <section className="card stack">
      <SectionTitle icon="bell" colour="red">
        Notifications
      </SectionTitle>
      <p className="hint">
        A short summary at 8am: interviews, follow-ups due, closing dates, applications waiting for a reply and new job
        ideas. Nothing is sent on quiet days.
      </p>

      {help && (
        <p className="notice">
          <Icon name={state === 'denied' ? 'alert' : 'phone'} size={18} />
          <span>{help}</span>
        </p>
      )}

      {state === 'off' && (
        <button className="btn primary block" onClick={() => void turnOn()} disabled={busy !== null}>
          <Icon name="bell" size={18} /> {busy === 'on' ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}

      {state === 'on' && (
        <>
          <div className="row-between">
            <span className="pills">
              <Pill colour="green" icon="checkCircle">
                On for this device
              </Pill>
            </span>
            <button className="btn link inline" onClick={() => void turnOff()} disabled={busy !== null}>
              {busy === 'off' ? 'Turning off…' : 'Turn off'}
            </button>
          </div>
          <button className="btn tinted c-red block" onClick={() => void test()} disabled={busy !== null}>
            <Icon name="send" size={18} /> {busy === 'test' ? 'Sending…' : "Send today's summary now"}
          </button>
        </>
      )}

      {devices.length > 0 && (
        <div className="list">
          {devices.map((d) => {
            const mine = d.endpoint === thisEndpoint;
            return (
              <ListRow
                key={d.id}
                icon={/Mac|Windows|Computer/.test(d.device ?? '') ? 'laptop' : 'phone'}
                colour={d.last_error ? 'orange' : mine ? 'green' : 'gray'}
                label={mine ? `This ${(d.device ?? 'device').split(' · ')[0]}` : d.device ?? 'Device'}
                onClick={mine ? undefined : () => void forget(d)}
              >
                <span className="muted small">
                  {d.last_error
                    ? 'Last send failed'
                    : d.last_sent_at
                      ? `Sent ${relativeInline(ukDate(d.last_sent_at))}`
                      : 'Not sent yet'}
                </span>
              </ListRow>
            );
          })}
        </div>
      )}
    </section>
  );
}
