import { useEffect, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { fetchStaff, getUserPermissions, updateUserPermissions, type PermissionItem } from '../../api';
import { Button, Card, Badge, Toggle, useToast } from '../../components/ui';

export function PermissionsSettings() {
  const { success, error } = useToast();
  const [staff, setStaff] = useState<{ id: number; name: string; role: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStaff()
      .then(({ staff: s }) => setStaff(
        s.filter((u) => u.role !== 'owner').map((u) => ({ id: u.id, name: u.name, role: u.role ?? 'staff' }))
      ))
      .catch(() => error('Failed to load staff'));
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    setLoadingPerms(true);
    getUserPermissions(selectedUserId)
      .then(({ permissions }) => { setPerms(permissions); setOverrides({}); })
      .catch(() => error('Failed to load permissions'))
      .finally(() => setLoadingPerms(false));
  }, [selectedUserId]);

  const grouped = perms.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await updateUserPermissions(selectedUserId, overrides);
      success('Permissions saved');
      const { permissions } = await getUserPermissions(selectedUserId);
      setPerms(permissions);
      setOverrides({});
    } catch { error('Failed to save permissions'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>Select staff member</label>
          <select
            value={selectedUserId ?? ''}
            onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
            style={{ height: 36, borderRadius: 10, border: '1.5px solid #E8E0D8', background: '#fff', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', color: '#1C1408', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">— Choose staff member —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
          </select>
        </div>
      </Card>

      {selectedUserId && (
        <Card>
          {loadingPerms ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
                    {group}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {items.map((p) => {
                      const effective = overrides[p.slug] !== undefined ? overrides[p.slug] : p.granted;
                      const isOverridden = overrides[p.slug] !== undefined;
                      return (
                        <div key={p.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: isOverridden ? '#FFF8F3' : 'transparent' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, color: '#1C1408' }}>{p.name}</span>
                            <Badge variant={p.source === 'override' ? 'brand' : 'neutral'} className="text-[10px]">
                              {isOverridden ? 'modified' : p.source}
                            </Badge>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Toggle size="sm" checked={Boolean(effective)} onChange={(v) => setOverrides((o) => ({ ...o, [p.slug]: v }))} />
                            {isOverridden && (
                              <button onClick={() => setOverrides((o) => { const n = { ...o }; delete n[p.slug]; return n; })}
                                style={{ fontSize: 11, color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                                reset
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #E8E0D8' }}>
                <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => setOverrides({})}>
                  Reset all changes
                </Button>
                <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSave} loading={saving}>
                  Save Permissions
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
