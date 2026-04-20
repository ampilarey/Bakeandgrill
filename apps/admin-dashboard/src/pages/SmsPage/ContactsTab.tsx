import { useEffect, useState } from 'react';
import { Users, Plus, Pencil, Trash2, FolderOpen, UserPlus, X } from 'lucide-react';
import {
  fetchSmsContacts, createSmsContact, updateSmsContact, deleteSmsContact,
  fetchSmsContactGroups, createSmsContactGroup, updateSmsContactGroup, deleteSmsContactGroup,
  addGroupMember, removeGroupMember,
  type SmsContact, type SmsContactGroup,
} from '../../api';
import { Badge, Btn, Card, EmptyState, Input, Modal, ModalActions, Spinner, TableCard, TD, TH } from '../../components/Layout';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

type ContactForm = {
  name: string; phone: string; type: 'staff' | 'external';
  is_enabled: boolean; notes: string;
  active_days: string[] | null; active_from: string; active_until: string;
  tags: string;
};

const EMPTY_CONTACT: ContactForm = {
  name: '', phone: '', type: 'external', is_enabled: true, notes: '',
  active_days: null, active_from: '', active_until: '', tags: '',
};

export function ContactsTab() {
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [groups, setGroups] = useState<SmsContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'contacts' | 'groups'>('contacts');

  const [contactModal, setContactModal] = useState(false);
  const [editContact, setEditContact] = useState<SmsContact | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [groupModal, setGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState<SmsContactGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  const [memberModal, setMemberModal] = useState<SmsContactGroup | null>(null);
  const [memberContactId, setMemberContactId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [c, g] = await Promise.all([fetchSmsContacts(), fetchSmsContactGroups()]);
      setContacts(c.contacts);
      setGroups(g.groups);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openContactModal = (contact?: SmsContact) => {
    setEditContact(contact ?? null);
    setContactForm(contact ? {
      name: contact.name, phone: contact.phone, type: contact.type,
      is_enabled: contact.is_enabled, notes: contact.notes ?? '',
      active_days: contact.active_days, active_from: contact.active_from ?? '',
      active_until: contact.active_until ?? '', tags: (contact.tags ?? []).join(', '),
    } : EMPTY_CONTACT);
    setError('');
    setContactModal(true);
  };

  const saveContact = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: contactForm.name, phone: contactForm.phone, type: contactForm.type,
        is_enabled: contactForm.is_enabled, notes: contactForm.notes || undefined,
        active_days: contactForm.active_days,
        active_from: contactForm.active_from || null,
        active_until: contactForm.active_until || null,
        tags: contactForm.tags ? contactForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      if (editContact) {
        await updateSmsContact(editContact.id, payload);
      } else {
        await createSmsContact(payload);
      }
      setContactModal(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (id: number) => {
    if (!confirm('Delete this contact?')) return;
    await deleteSmsContact(id);
    await load();
  };

  const saveGroup = async () => {
    setSaving(true);
    try {
      if (editGroup) {
        await updateSmsContactGroup(editGroup.id, { name: groupName, description: groupDesc });
      } else {
        await createSmsContactGroup({ name: groupName, description: groupDesc });
      }
      setGroupModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addMember = async () => {
    if (!memberModal || !memberContactId) return;
    await addGroupMember(memberModal.id, Number(memberContactId));
    setMemberContactId('');
    await load();
    setMemberModal(groups.find(g => g.id === memberModal.id) ?? null);
  };

  const removeMember = async (groupId: number, contactId: number) => {
    await removeGroupMember(groupId, contactId);
    await load();
  };

  const toggleDay = (day: string) => {
    const current = contactForm.active_days ?? [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    setContactForm(f => ({ ...f, active_days: next.length ? next : null }));
  };

  if (loading) return <Spinner />;

  return (
    <>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #E8E0D8' }}>
        {(['contacts', 'groups'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '8px 18px', fontSize: 13, fontWeight: view === v ? 700 : 500,
            color: view === v ? '#D4813A' : '#9C8E7E', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: view === v ? '2px solid #D4813A' : '2px solid transparent', marginBottom: -1,
          }}>
            {v === 'contacts' ? <><Users size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Contacts</> : <><FolderOpen size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />Groups</>}
          </button>
        ))}
      </div>

      {view === 'contacts' && (
        <>
          <Btn onClick={() => openContactModal()} style={{ marginBottom: 16 }}>
            <Plus size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} />Add Contact
          </Btn>

          {contacts.length === 0 ? (
            <TableCard><EmptyState message="No SMS contacts yet. Add staff or external numbers to route notifications." /></TableCard>
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Name', 'Phone', 'Type', 'Active Days', 'Time Window', 'Tags', 'Status', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id}>
                      <td style={{ ...TD, fontWeight: 600 }}>{c.name}{c.user_name && <span style={{ color: '#9C8E7E', fontSize: 11, marginLeft: 6 }}>({c.user_name})</span>}</td>
                      <td style={{ ...TD, fontFamily: 'monospace' }}>{c.phone}</td>
                      <td style={TD}><Badge label={c.type} color={c.type === 'staff' ? 'blue' : 'gray'} /></td>
                      <td style={{ ...TD, color: '#6B5D4F', fontSize: 11 }}>{c.active_days ? c.active_days.map(d => DAY_LABEL[d]).join(', ') : 'Every day'}</td>
                      <td style={{ ...TD, color: '#6B5D4F', fontSize: 11 }}>{c.active_from && c.active_until ? `${c.active_from}–${c.active_until}` : 'Always'}</td>
                      <td style={{ ...TD, color: '#6B5D4F', fontSize: 11 }}>{(c.tags ?? []).join(', ') || '—'}</td>
                      <td style={TD}><Badge label={c.is_enabled ? 'Active' : 'Disabled'} color={c.is_enabled ? 'green' : 'gray'} /></td>
                      <td style={TD}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Btn variant="ghost" onClick={() => openContactModal(c)}><Pencil size={13} /></Btn>
                          <Btn variant="ghost" onClick={() => deleteContact(c.id)}><Trash2 size={13} /></Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
        </>
      )}

      {view === 'groups' && (
        <>
          <Btn onClick={() => { setEditGroup(null); setGroupName(''); setGroupDesc(''); setGroupModal(true); }} style={{ marginBottom: 16 }}>
            <Plus size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} />New Group
          </Btn>

          {groups.length === 0 ? (
            <TableCard><EmptyState message="No contact groups yet." /></TableCard>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {groups.map(g => (
                <Card key={g.id} style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                      {g.description && <div style={{ color: '#9C8E7E', fontSize: 12, marginTop: 2 }}>{g.description}</div>}
                      <div style={{ color: '#6B5D4F', fontSize: 12, marginTop: 6 }}>
                        {g.contacts_count} member{g.contacts_count !== 1 ? 's' : ''}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {g.contacts.map(c => (
                          <span key={c.id} style={{ background: '#F5F0EA', borderRadius: 99, padding: '3px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {c.name}
                            <button onClick={() => removeMember(g.id, c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9C8E7E', lineHeight: 1 }}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                        <button onClick={() => setMemberModal(g)} style={{ background: '#E8E0D8', border: 'none', borderRadius: 99, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#6B5D4F', fontFamily: 'inherit' }}>
                          <UserPlus size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Add
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn variant="ghost" onClick={() => { setEditGroup(g); setGroupName(g.name); setGroupDesc(g.description ?? ''); setGroupModal(true); }}>
                        <Pencil size={13} />
                      </Btn>
                      <Btn variant="ghost" onClick={async () => { if (confirm('Delete group?')) { await deleteSmsContactGroup(g.id); await load(); } }}>
                        <Trash2 size={13} />
                      </Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Contact Modal */}
      {contactModal && (
        <Modal title={editContact ? 'Edit Contact' : 'Add Contact'} onClose={() => setContactModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Name *</label>
                <Input value={contactForm.name} onChange={v => setContactForm(f => ({ ...f, name: v }))} placeholder="e.g. Manager After Hours" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Phone *</label>
                <Input value={contactForm.phone} onChange={v => setContactForm(f => ({ ...f, phone: v }))} placeholder="+9607xxxxxx" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Type</label>
                <select value={contactForm.type} onChange={e => setContactForm(f => ({ ...f, type: e.target.value as 'staff' | 'external' }))}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="external">External (raw number)</option>
                  <option value="staff">Staff (linked to account)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Tags (comma-separated)</label>
                <Input value={contactForm.tags} onChange={v => setContactForm(f => ({ ...f, tags: v }))} placeholder="e.g. kitchen, delivery" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Active Days (leave blank for every day)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => toggleDay(d)} style={{
                    padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: (contactForm.active_days ?? []).includes(d) ? '#D4813A' : '#F5F0EA',
                    color: (contactForm.active_days ?? []).includes(d) ? '#fff' : '#6B5D4F',
                    border: '1px solid transparent',
                  }}>{DAY_LABEL[d]}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Active From</label>
                <Input type="time" value={contactForm.active_from} onChange={v => setContactForm(f => ({ ...f, active_from: v }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Active Until</label>
                <Input type="time" value={contactForm.active_until} onChange={v => setContactForm(f => ({ ...f, active_until: v }))} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Notes</label>
              <Input value={contactForm.notes} onChange={v => setContactForm(f => ({ ...f, notes: v }))} placeholder="Optional note about this contact" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="is_enabled" checked={contactForm.is_enabled}
                onChange={e => setContactForm(f => ({ ...f, is_enabled: e.target.checked }))} />
              <label htmlFor="is_enabled" style={{ fontSize: 13, cursor: 'pointer' }}>Enabled</label>
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setContactModal(false)}>Cancel</Btn>
            <Btn onClick={saveContact} disabled={saving || !contactForm.name || !contactForm.phone}>
              {saving ? 'Saving…' : editContact ? 'Save Changes' : 'Add Contact'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Group Modal */}
      {groupModal && (
        <Modal title={editGroup ? 'Edit Group' : 'New Group'} onClose={() => setGroupModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Group Name *</label>
              <Input value={groupName} onChange={setGroupName} placeholder="e.g. Kitchen Team" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Description</label>
              <Input value={groupDesc} onChange={setGroupDesc} placeholder="Optional description" />
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setGroupModal(false)}>Cancel</Btn>
            <Btn onClick={saveGroup} disabled={saving || !groupName}>{saving ? 'Saving…' : editGroup ? 'Save' : 'Create Group'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Add Member Modal */}
      {memberModal && (
        <Modal title={`Add Member to "${memberModal.name}"`} onClose={() => setMemberModal(null)}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Select Contact</label>
            <select value={memberContactId} onChange={e => setMemberContactId(e.target.value)}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="">— Choose contact —</option>
              {contacts
                .filter(c => !memberModal.contacts.find(m => m.id === c.id))
                .map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
            </select>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setMemberModal(null)}>Close</Btn>
            <Btn onClick={addMember} disabled={!memberContactId}>Add Member</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}
