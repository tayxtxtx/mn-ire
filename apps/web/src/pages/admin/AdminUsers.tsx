import { useCallback, useEffect, useState } from 'react';
import {
  Grid, Column,
  Button, Tag,
  SkeletonText, InlineNotification,
  Modal, TextInput, PasswordInput, Checkbox,
  DataTable, Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
  TableToolbar, TableToolbarContent,
  CodeSnippet,
} from '@carbon/react';
import { Add, TrashCan, UserAdmin, Password } from '@carbon/icons-react';
import { TEST_MODE } from '../../mockData.js';  // DELETE with mockData.ts
import AdminNav from './AdminNav.js';

interface AdminUser {
  id:             string;
  displayName:    string;
  email:          string;
  isAdmin:        boolean;
  certifications: string[];
  createdAt:      string;
}

interface PendingInvite {
  id:          string;
  displayName: string;
  email:       string;
  inviteUrl:   string;
  expiresAt:   string;
}

const headers = [
  { key: 'name',    header: 'Name' },
  { key: 'email',   header: 'Email' },
  { key: 'role',    header: 'Role' },
  { key: 'certs',   header: 'Certifications' },
  { key: 'actions', header: '' },
];

export default function AdminUsers() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Invite modal
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteName,  setInviteName]  = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError,  setInviteError]  = useState<string | null>(null);
  const [createdUrl,   setCreatedUrl]   = useState<string | null>(null);

  // Create user modal
  const [createModal,     setCreateModal]     = useState(false);
  const [createName,      setCreateName]      = useState('');
  const [createEmail,     setCreateEmail]     = useState('');
  const [createPassword,  setCreatePassword]  = useState('');
  const [createIsAdmin,   setCreateIsAdmin]   = useState(false);
  const [createSaving,    setCreateSaving]    = useState(false);
  const [createError,     setCreateError]     = useState<string | null>(null);

  // Reset password modal
  const [resetTarget,   setResetTarget]   = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving,   setResetSaving]   = useState(false);
  const [resetError,    setResetError]    = useState<string | null>(null);

  const load = useCallback(() => {
    if (TEST_MODE) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/invites', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([u, i]) => {
        setUsers(u as AdminUser[]);
        setInvites(i as PendingInvite[]);
      })
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (user: AdminUser) => {
    if (TEST_MODE) return;
    await fetch(`/api/admin/users/${user.id}`, {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ isAdmin: !user.isAdmin }),
    });
    load();
  };

  const revokeInvite = async (id: string) => {
    if (TEST_MODE) return;
    await fetch(`/api/admin/invites/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const sendInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    if (TEST_MODE) {
      setCreatedUrl(`http://localhost:5173/accept-invite?token=mock-token-preview`);
      return;
    }
    setInviteSaving(true);
    setInviteError(null);
    try {
      const res = await fetch('/api/admin/invites', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ displayName: inviteName.trim(), email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setInviteError(err.message ?? 'Could not create invite.');
        return;
      }
      const data = await res.json() as { inviteUrl: string };
      setCreatedUrl(data.inviteUrl);
      load();
    } catch {
      setInviteError('Network error.');
    } finally {
      setInviteSaving(false);
    }
  };

  const closeInviteModal = () => {
    setInviteModal(false);
    setInviteName('');
    setInviteEmail('');
    setInviteError(null);
    setCreatedUrl(null);
  };

  const openCreateModal = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePassword('');
    setCreateIsAdmin(false);
    setCreateError(null);
    setCreateModal(true);
  };

  const createUser = async () => {
    if (!createName.trim() || !createEmail.trim() || !createPassword) {
      setCreateError('All fields are required.');
      return;
    }
    if (TEST_MODE) { setCreateModal(false); return; }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ displayName: createName.trim(), email: createEmail.trim(), password: createPassword, isAdmin: createIsAdmin }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setCreateError(err.message ?? 'Could not create user.');
        return;
      }
      setCreateModal(false);
      load();
    } catch {
      setCreateError('Network error.');
    } finally {
      setCreateSaving(false);
    }
  };

  const openResetModal = (user: AdminUser) => {
    setResetTarget(user);
    setResetPassword('');
    setResetError(null);
  };

  const doResetPassword = async () => {
    if (!resetTarget || !resetPassword) { setResetError('Password is required.'); return; }
    if (TEST_MODE) { setResetTarget(null); return; }
    setResetSaving(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ password: resetPassword }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        setResetError(err.message ?? 'Could not reset password.');
        return;
      }
      setResetTarget(null);
    } catch {
      setResetError('Network error.');
    } finally {
      setResetSaving(false);
    }
  };

  const rows = users.map((u) => ({
    id:    u.id,
    name:  u.displayName,
    email: u.email,
    role: u.isAdmin
      ? <Tag type="purple" size="sm">Admin</Tag>
      : <Tag type="gray" size="sm">Member</Tag>,
    certs: u.certifications.length > 0
      ? <span style={{ fontSize: '0.8rem' }}>{u.certifications.join(', ')}</span>
      : <span style={{ color: 'var(--cds-text-placeholder)', fontSize: '0.8rem' }}>None</span>,
    actions: (
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <Button
          kind="ghost" size="sm" renderIcon={UserAdmin}
          onClick={() => toggleAdmin(u)}
          title={u.isAdmin ? 'Remove admin' : 'Make admin'}
        >
          {u.isAdmin ? 'Remove admin' : 'Make admin'}
        </Button>
        <Button
          kind="ghost" size="sm" renderIcon={Password} iconDescription="Reset password"
          hasIconOnly onClick={() => openResetModal(u)}
        />
      </div>
    ),
  }));

  return (
    <Grid fullWidth>
      <Column lg={16} md={8} sm={4} style={{ paddingTop: '1rem', paddingBottom: '0.5rem' }}>
        <AdminNav active="users" />
      </Column>

      <Column lg={16} md={8} sm={4} style={{ paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            Users
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button size="md" kind="secondary" renderIcon={Add} onClick={openCreateModal}>
              Create User
            </Button>
            <Button size="md" renderIcon={Add} onClick={() => setInviteModal(true)}>
              Invite User
            </Button>
          </div>
        </div>
      </Column>

      {error && (
        <Column lg={16} md={8} sm={4}>
          <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />
        </Column>
      )}

      {/* Pending invites strip */}
      {invites.length > 0 && (
        <Column lg={16} md={8} sm={4} style={{ marginBottom: '1rem' }}>
          <div style={{ padding: '0.75rem 1rem', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle-01)' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Pending invites ({invites.length})
            </p>
            {invites.map((inv) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.875rem' }}><strong>{inv.displayName}</strong> &lt;{inv.email}&gt;</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{inv.inviteUrl}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  expires {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
                <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} iconDescription="Revoke" hasIconOnly onClick={() => revokeInvite(inv.id)} />
              </div>
            ))}
          </div>
        </Column>
      )}

      <Column lg={16} md={8} sm={4}>
        {loading ? (
          <SkeletonText paragraph lineCount={8} />
        ) : (
          <DataTable rows={rows} headers={headers}>
            {({ rows: tableRows, headers: tableHeaders, getTableProps, getRowProps }) => (
              <>
                <TableToolbar>
                  <TableToolbarContent />
                </TableToolbar>
                <Table {...getTableProps()} size="sm">
                  <TableHead>
                    <TableRow>
                      {tableHeaders.map((h) => (
                        <TableHeader key={h.key}>{h.header}</TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row) => {
                      const { key, ...rowProps } = getRowProps({ row });
                      return (
                        <TableRow key={row.id} {...rowProps}>
                          {row.cells.map((cell) => (
                            <TableCell key={cell.id}>{cell.value}</TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </DataTable>
        )}
      </Column>

      {/* Create user modal */}
      <Modal
        open={createModal}
        modalHeading="Create User"
        primaryButtonText={createSaving ? 'Creating…' : 'Create'}
        secondaryButtonText="Cancel"
        onRequestSubmit={createUser}
        onRequestClose={() => setCreateModal(false)}
        onSecondarySubmit={() => setCreateModal(false)}
        primaryButtonDisabled={createSaving}
        size="sm"
      >
        {createError && (
          <InlineNotification kind="error" title="Error" subtitle={createError} hideCloseButton style={{ marginBottom: '1rem' }} />
        )}
        <TextInput
          id="create-name"
          labelText="Full name *"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        <TextInput
          id="create-email"
          labelText="Email address *"
          type="email"
          value={createEmail}
          onChange={(e) => setCreateEmail(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        <PasswordInput
          id="create-password"
          labelText="Password (min 8 characters) *"
          value={createPassword}
          onChange={(e) => setCreatePassword(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        <Checkbox
          id="create-isadmin"
          labelText="Make this user an admin"
          checked={createIsAdmin}
          onChange={(_: unknown, { checked }: { checked: boolean }) => setCreateIsAdmin(checked)}
        />
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={resetTarget !== null}
        modalHeading="Reset Password"
        primaryButtonText={resetSaving ? 'Saving…' : 'Set Password'}
        secondaryButtonText="Cancel"
        onRequestSubmit={doResetPassword}
        onRequestClose={() => setResetTarget(null)}
        onSecondarySubmit={() => setResetTarget(null)}
        primaryButtonDisabled={resetSaving}
        size="sm"
      >
        {resetError && (
          <InlineNotification kind="error" title="Error" subtitle={resetError} hideCloseButton style={{ marginBottom: '1rem' }} />
        )}
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          Setting a new password for <strong>{resetTarget?.displayName}</strong> ({resetTarget?.email}).
        </p>
        <PasswordInput
          id="reset-password"
          labelText="New password (min 8 characters)"
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
        />
      </Modal>

      {/* Invite modal */}
      <Modal
        open={inviteModal}
        modalHeading="Invite a New Member"
        primaryButtonText={createdUrl ? 'Done' : (inviteSaving ? 'Creating…' : 'Create Invite Link')}
        secondaryButtonText={createdUrl ? undefined : 'Cancel'}
        onRequestSubmit={createdUrl ? closeInviteModal : sendInvite}
        onRequestClose={closeInviteModal}
        onSecondarySubmit={closeInviteModal}
        primaryButtonDisabled={inviteSaving}
        size="sm"
      >
        {inviteError && (
          <InlineNotification kind="error" title="Error" subtitle={inviteError} hideCloseButton style={{ marginBottom: '1rem' }} />
        )}

        {createdUrl ? (
          <div>
            <p style={{ marginBottom: '0.75rem', fontWeight: 600 }}>Invite link created!</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.75rem' }}>
              Copy this link and send it to <strong>{inviteEmail}</strong>. It expires in 7 days.
            </p>
            <CodeSnippet type="multi" wrapText>{createdUrl}</CodeSnippet>
          </div>
        ) : (
          <>
            <TextInput
              id="invite-name"
              labelText="Full name *"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />
            <TextInput
              id="invite-email"
              labelText="Email address *"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </>
        )}
      </Modal>
    </Grid>
  );
}
