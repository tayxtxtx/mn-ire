import { useCallback, useEffect, useState } from 'react';
import {
  Grid, Column,
  Button, Tag, InlineNotification,
  SkeletonText, TextInput, PasswordInput,
  Tabs, TabList, Tab, TabPanels, TabPanel,
  Tooltip,
} from '@carbon/react';
import { Save, Warning } from '@carbon/icons-react';
import AdminNav from './AdminNav.js';

// ── Types ──────────────────────────────────────────────────────────────────

type SettingGroup = 'booking' | 'slack' | 'gcal' | 'auth';

interface SettingRow {
  key:             string;
  label:           string;
  group:           SettingGroup;
  isSecret:        boolean;
  requiresRestart: boolean;
  hint?:           string;
  value:           string;   // '••••••••' for set secrets; raw for non-secrets
  hasValue:        boolean;
  source:          'db' | 'env' | 'none';
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MASK = '••••••••';
const GROUP_LABELS: Record<SettingGroup, string> = {
  booking: 'Booking Rules',
  slack:   'Slack Bot',
  gcal:    'Google Calendar',
  auth:    'Auth Provider',
};
const GROUP_ORDER: SettingGroup[] = ['booking', 'slack', 'gcal', 'auth'];

function sourceTag(source: 'db' | 'env' | 'none') {
  if (source === 'db')  return <Tag type="blue"  size="sm">DB</Tag>;
  if (source === 'env') return <Tag type="gray"  size="sm">env</Tag>;
  return <Tag type="warm-gray" size="sm">unset</Tag>;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const [rows,    setRows]    = useState<SettingRow[]>([]);
  const [edits,   setEdits]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/settings', { credentials: 'include' });
      const data = (await res.json()) as SettingRow[];
      setRows(data);
      setEdits({});
    } catch {
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleChange = (key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  };

  const handleSave = async () => {
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
    if (updates.length === 0) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setError(err.message ?? 'Failed to save settings.');
        return;
      }

      const result = (await res.json()) as { message: string; requiresRestart: boolean };
      setSuccess(result.message);
      setNeedsRestart(result.requiresRestart);
      await load();
    } catch {
      setError('Network error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  const valueFor = (row: SettingRow): string => {
    if (row.key in edits) return edits[row.key]!;
    return row.value;
  };

  const dirtyCount = Object.keys(edits).length;

  // Group rows
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    rows:  rows.filter((r) => r.group === g),
  }));

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4} style={{ paddingTop: '1rem', paddingBottom: '0.5rem' }}>
        <AdminNav active="settings" />
      </Column>

      <Column lg={16} md={8} sm={4} style={{ paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            Settings
          </h1>
          <Button
            size="md"
            renderIcon={Save}
            onClick={() => { void handleSave(); }}
            disabled={saving || dirtyCount === 0}
          >
            {saving ? 'Saving…' : `Save Changes${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </Button>
        </div>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: '1rem' }}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      {success && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: '1rem' }}>
          <InlineNotification
            kind="success"
            title="Saved"
            subtitle={
              needsRestart
                ? `${success} Some changes require a server restart to take effect.`
                : success
            }
            hideCloseButton
          />
        </Column>
      )}

      <Column lg={16} md={8} sm={4}>
        {loading ? (
          <SkeletonText paragraph lineCount={12} />
        ) : (
          <Tabs>
            <TabList aria-label="Settings groups">
              {grouped.map(({ group }) => (
                <Tab key={group}>{GROUP_LABELS[group]}</Tab>
              ))}
            </TabList>
            <TabPanels>
              {grouped.map(({ group, rows: groupRows }) => (
                <TabPanel key={group}>
                  <div style={{ paddingTop: '1.5rem', maxWidth: '640px' }}>
                    {groupRows.map((row) => (
                      <SettingField
                        key={row.key}
                        row={row}
                        value={valueFor(row)}
                        onChange={(v) => handleChange(row.key, v)}
                      />
                    ))}
                  </div>
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        )}
      </Column>
    </Grid>
  );
}

// ── SettingField sub-component ─────────────────────────────────────────────

interface SettingFieldProps {
  row:      SettingRow;
  value:    string;
  onChange: (v: string) => void;
}

function SettingField({ row, value, onChange }: SettingFieldProps) {
  const isMasked   = row.isSecret && value === MASK;
  const isDirty    = row.key in ({} as Record<string, string>); // tracked by parent

  const labelNode = (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {row.label}
      {row.requiresRestart && (
        <Tooltip
          label="Requires server restart to take effect"
          align="right"
        >
          <button type="button" style={{ background: 'none', border: 'none', padding: 0, cursor: 'default', display: 'flex' }}>
            <Warning size={16} style={{ color: 'var(--cds-support-warning, #F1C21B)' }} />
          </button>
        </Tooltip>
      )}
      {sourceTag(row.source)}
    </span>
  );

  const helperText = row.hint ?? undefined;

  const handleFocus = () => {
    // When a user focuses a masked field, clear it so they can type a new value
    if (isMasked) {
      onChange('');
    }
  };

  const wrapperStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
  };

  if (row.isSecret) {
    return (
      <div style={wrapperStyle}>
        <PasswordInput
          id={`setting-${row.key}`}
          labelText={labelNode as unknown as string}
          helperText={helperText}
          value={value}
          onFocus={handleFocus}
          onChange={(e) => onChange(e.target.value)}
          placeholder={row.hasValue ? '(keep existing — focus to replace)' : 'Not set'}
        />
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <TextInput
        id={`setting-${row.key}`}
        labelText={labelNode as unknown as string}
        helperText={helperText}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(!row.hasValue ? { placeholder: 'Not set' } : {})}
      />
    </div>
  );
}
