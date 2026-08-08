import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, KeyRound, Trash2, Shield, User as UserIcon, Lock, RotateCcw, CheckCircle2 } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useConfirm } from "@/lib/useConfirm";
import { ALL_PERMISSION_KEYS, DEFAULT_USER_PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "user", username: "", otp_login: false, newOrderOnly: false });
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  // Permissions dialog
  const [permTarget, setPermTarget] = useState(null);
  const [permSet, setPermSet] = useState(new Set());
  const [permSaving, setPermSaving] = useState(false);
  const [permAudit, setPermAudit] = useState([]);
  const [permAuditLoading, setPermAuditLoading] = useState(false);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submitAdd = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) {
      toast.error(t("adminUsers.errors.allFields")); return;
    }
    if (form.password.length < 6) {
      toast.error(t("adminUsers.errors.passwordShort")); return;
    }
    try {
      const payload = {
        email: form.email,
        name: form.name,
        password: form.password,
        role: form.role,
        username: form.username,
        otp_login: form.otp_login,
      };
      // "Add New Order only" → restrict this user to just the New Order page.
      if (form.role === "user" && form.newOrderOnly) {
        payload.permissions = ["newOrder"];
      }
      await api.post("/users", payload);
      toast.success(t("adminUsers.added", { email: form.username || form.email }));
      setShowAdd(false);
      setForm({ email: "", name: "", password: "", role: "user", username: "", otp_login: false, newOrderOnly: false });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
  };

  const toggleOtp = async (u, next) => {
    try {
      await api.patch(`/users/${u.id}/otp`, { otp_login: next });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, otp_login: next } : x)));
      toast.success(next ? `OTP login enabled for ${u.username || u.email}` : `OTP login disabled for ${u.username || u.email}`);
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
  };

  const del = (u) => {
    if (u.id === me?.id) { toast.error(t("adminUsers.errors.selfDelete")); return; }
    confirm({
      title: t("adminUsers.confirmDeleteTitle"),
      description: t("adminUsers.confirmDelete", { email: u.username || u.email }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      onConfirm: async () => {
        closeConfirm();
        try {
          await api.delete(`/users/${u.id}`);
          toast.success(t("adminUsers.deleted"));
          load();
        } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
      },
    });
  };

  const submitReset = async () => {
    if (!newPwd || newPwd.length < 6) { toast.error(t("adminUsers.errors.passwordShort")); return; }
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { password: newPwd });
      toast.success(t("adminUsers.passwordReset", { email: resetTarget.email }));
      setResetTarget(null); setNewPwd("");
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
  };

  // ---- Granular permissions ----
  const loadPermAudit = async (userId) => {
    setPermAuditLoading(true);
    try {
      const { data } = await api.get(`/users/${userId}/permissions/audit`, { params: { limit: 10 } });
      setPermAudit(data?.rows || []);
    } catch (e) { setPermAudit([]); }
    finally { setPermAuditLoading(false); }
  };
  const openPermDialog = (u) => {
    const seed = Array.isArray(u.permissions)
      ? u.permissions
      : (u.role === "admin" ? ALL_PERMISSION_KEYS : DEFAULT_USER_PERMISSIONS);
    setPermSet(new Set(seed));
    setPermTarget(u);
    loadPermAudit(u.id);
  };
  const togglePerm = (key) =>
    setPermSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const setPermAll = (on) => setPermSet(new Set(on ? ALL_PERMISSION_KEYS : []));
  const resetPermsToDefault = () => setPermSet(new Set(DEFAULT_USER_PERMISSIONS));
  const clearPermsOverride = async () => {
    if (!permTarget) return;
    setPermSaving(true);
    try {
      await api.patch(`/users/${permTarget.id}/permissions`, { permissions: null });
      toast.success("Permissions reset to role defaults");
      // Refresh audit while leaving dialog open so admin can see the entry
      loadPermAudit(permTarget.id);
      setPermSet(new Set(DEFAULT_USER_PERMISSIONS));
      setPermTarget((u) => u ? { ...u, permissions: null } : u);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
    finally { setPermSaving(false); }
  };
  const savePerms = async () => {
    if (!permTarget) return;
    setPermSaving(true);
    try {
      const list = ALL_PERMISSION_KEYS.filter((k) => permSet.has(k));
      const { data: updated } = await api.patch(`/users/${permTarget.id}/permissions`, { permissions: list });
      toast.success(`Access updated for ${permTarget.username || permTarget.email}`);
      loadPermAudit(permTarget.id);
      setPermTarget(updated);
      setPermSet(new Set(updated.permissions || []));
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
    finally { setPermSaving(false); }
  };

  return (
    <div className="space-y-5" data-testid="admin-users-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">{t("adminUsers.overline")}</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">{t("adminUsers.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("adminUsers.subtitle")}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="add-user-btn"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 px-4 font-bold">
          <UserPlus className="w-4 h-4 mr-1.5" /> {t("adminUsers.newUser")}
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm">
        {loading ? <div className="p-10 text-center text-slate-400">{t("common.loading")}</div> :
         users.length === 0 ? <div className="p-10 text-center text-slate-400">{t("adminUsers.empty")}</div> :
         <div className="divide-y divide-slate-100">
           {users.map((u) => (
             <div key={u.id} data-testid={`user-row-${u.id}`}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-slate-50">
               <div className="flex items-center gap-3 min-w-0">
                 <div className={`w-10 h-10 rounded-sm grid place-items-center ${u.role === "admin" ? "bg-orange-50 border border-orange-200 text-[#E65100]" : "bg-slate-100 border border-slate-200 text-slate-600"}`}>
                   {u.role === "admin" ? <Shield className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                 </div>
                 <div className="min-w-0">
                   <div className="font-bold text-slate-900 flex items-center gap-2">
                     <span className="font-mono-num">{u.username || (u.email || "").split("@")[0]}</span>
                     {u.id === me?.id && (
                       <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded-sm">
                         {t("adminUsers.you")}
                       </span>
                     )}
                   </div>
                   <div className="text-xs text-slate-500">{u.name || u.email}</div>
                   <div className="text-[10px] uppercase tracking-wider mt-1 inline-flex flex-wrap gap-1 items-center">
                     <span className="px-1.5 py-0.5 rounded-sm font-bold bg-slate-100 text-slate-700">{u.role}</span>
                     {u.role !== "admin" && Array.isArray(u.permissions) && (
                       <span
                         className="px-1.5 py-0.5 rounded-sm font-bold bg-orange-50 border border-orange-200 text-orange-900 inline-flex items-center gap-1"
                         data-testid={`user-row-${u.id}-custom-access`}
                         title={`${u.permissions.length} tab(s) allowed`}
                       >
                         <Lock className="w-2.5 h-2.5" /> Custom access · {u.permissions.length}
                       </span>
                     )}
                   </div>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <div className="hidden sm:flex items-center gap-2 mr-1 px-2 py-1 rounded-sm border border-slate-200 bg-slate-50"
                      title="Require an email OTP as a second login step">
                   <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600">OTP login</span>
                   <Switch
                     checked={!!u.otp_login}
                     onCheckedChange={(v) => toggleOtp(u, v)}
                     data-testid={`otp-toggle-${u.id}`}
                     className="data-[state=checked]:bg-[#E65100]"
                   />
                 </div>
                 {u.role !== "admin" && (
                   <Button size="sm" variant="outline"
                           data-testid={`manage-access-${u.id}`}
                           onClick={() => openPermDialog(u)}
                           className="rounded-sm border-slate-300">
                     <Lock className="w-3.5 h-3.5 mr-1" /> Access
                   </Button>
                 )}
                 <Button size="sm" variant="outline"
                         data-testid={`reset-password-${u.id}`}
                         onClick={() => { setResetTarget(u); setNewPwd(""); }}
                         className="rounded-sm border-slate-300">
                   <KeyRound className="w-3.5 h-3.5 mr-1" /> {t("adminUsers.resetBtn")}
                 </Button>
                 <Button size="sm" variant="outline"
                         data-testid={`delete-user-${u.id}`}
                         disabled={u.id === me?.id}
                         onClick={() => del(u)}
                         className="rounded-sm border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                   <Trash2 className="w-3.5 h-3.5" />
                 </Button>
               </div>
             </div>
           ))}
         </div>}
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("adminUsers.addTitle")}</DialogTitle>
            <DialogDescription>{t("adminUsers.addSub")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.username")}</Label>
              <Input value={form.username}
                     onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))}
                     data-testid="add-user-username" className="h-11 rounded-sm mt-1 font-mono-num"
                     placeholder={t("adminUsers.usernamePlaceholder")} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("common.name")}</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                     data-testid="add-user-name" className="h-11 rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("common.email")}</Label>
              <Input type="email" value={form.email}
                     onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                     data-testid="add-user-email" className="h-11 rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.password")}</Label>
              <Input type="text" value={form.password}
                     onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                     data-testid="add-user-password" className="h-11 rounded-sm mt-1 font-mono-num"
                     placeholder={t("adminUsers.passwordHint")} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger data-testid="add-user-role" className="h-11 rounded-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("adminUsers.roles.user")}</SelectItem>
                  <SelectItem value="admin">{t("adminUsers.roles.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Email OTP two-step login toggle */}
            <label className="flex items-center justify-between gap-3 border border-slate-200 rounded-sm px-3 py-2.5 cursor-pointer">
              <span>
                <span className="block text-xs font-bold uppercase text-slate-800">Require OTP on login</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">Emails a 6-digit code as a second step at sign-in.</span>
              </span>
              <Switch
                checked={form.otp_login}
                onCheckedChange={(v) => setForm((p) => ({ ...p, otp_login: v }))}
                data-testid="add-user-otp"
                className="data-[state=checked]:bg-[#E65100]"
              />
            </label>
            {/* Restrict a normal user to only creating new orders */}
            {form.role === "user" && (
              <label className="flex items-center justify-between gap-3 border border-slate-200 rounded-sm px-3 py-2.5 cursor-pointer">
                <span>
                  <span className="block text-xs font-bold uppercase text-slate-800">Add New Order only</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">This user can only open the New Order page — nothing else.</span>
                </span>
                <Switch
                  checked={form.newOrderOnly}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, newOrderOnly: v }))}
                  data-testid="add-user-neworder-only"
                  className="data-[state=checked]:bg-[#E65100]"
                />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="rounded-sm">{t("common.cancel")}</Button>
            <Button onClick={submitAdd} data-testid="add-user-save"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("adminUsers.resetTitle")}</DialogTitle>
            <DialogDescription>{t("adminUsers.resetSub", { email: resetTarget?.email })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.newPassword")}</Label>
              <Input type="text" value={newPwd}
                     onChange={(e) => setNewPwd(e.target.value)}
                     data-testid="reset-password-input" className="h-11 rounded-sm mt-1 font-mono-num"
                     placeholder={t("adminUsers.passwordHint")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} className="rounded-sm">{t("common.cancel")}</Button>
            <Button onClick={submitReset} data-testid="reset-password-save"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">
              <KeyRound className="w-4 h-4 mr-1" /> {t("adminUsers.resetBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmState}
        onOpenChange={(o) => { if (!o) closeConfirm(); }}
        {...(confirmState || {})}
      />

      {/* Manage Access Dialog */}
      <Dialog open={!!permTarget} onOpenChange={(o) => { if (!o) setPermTarget(null); }}>
        <DialogContent className="rounded-sm max-w-xl" data-testid="manage-access-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#E65100]" />
              Manage access · {permTarget?.username || permTarget?.email}
            </DialogTitle>
            <DialogDescription>
              Tick a tab to allow this user to see and open it; untick to revoke. Admins always see everything regardless of this list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11px] text-slate-500">
                {permSet.size} of {ALL_PERMISSION_KEYS.length} tabs allowed
                {Array.isArray(permTarget?.permissions)
                  ? <span className="ml-2 inline-flex items-center gap-1 text-orange-900 font-bold uppercase tracking-wider"><Lock className="w-3 h-3" /> custom</span>
                  : <span className="ml-2 inline-flex items-center gap-1 text-slate-500 font-bold uppercase tracking-wider">default</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline"
                        onClick={() => setPermAll(true)}
                        data-testid="perm-select-all"
                        className="rounded-sm h-7">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Select all
                </Button>
                <Button type="button" size="sm" variant="outline"
                        onClick={() => setPermAll(false)}
                        data-testid="perm-clear-all"
                        className="rounded-sm h-7">
                  None
                </Button>
                <Button type="button" size="sm" variant="outline"
                        onClick={resetPermsToDefault}
                        data-testid="perm-defaults"
                        className="rounded-sm h-7">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Operator default
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-slate-200 rounded-sm p-2">
              {ALL_PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-orange-50 cursor-pointer"
                       data-testid={`perm-row-${key}`}>
                  <input type="checkbox"
                         checked={permSet.has(key)}
                         onChange={() => togglePerm(key)}
                         data-testid={`perm-cb-${key}`}
                         className="accent-[#E65100]" />
                  <span className="text-sm font-bold text-slate-800 truncate">{PERMISSION_LABELS[key] || key}</span>
                  <span className="ml-auto text-[10px] font-mono text-slate-400">{key}</span>
                </label>
              ))}
            </div>

            {/* Recent permission changes (audit trail) */}
            <div className="border border-slate-200 rounded-sm" data-testid="perm-audit-section">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Recent access changes</div>
                <div className="text-[10px] text-slate-400">{permAuditLoading ? "Loading…" : `${permAudit.length} entries`}</div>
              </div>
              {!permAuditLoading && permAudit.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 italic text-center">No changes yet — saving below will log the first entry.</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto">
                  {permAudit.map((row) => (
                    <div key={row.id} className="px-3 py-2 text-xs" data-testid={`perm-audit-${row.id}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="font-bold text-slate-800">
                          {row.kind === "clear" ? "Reset to defaults" : "Updated"} <span className="text-slate-400 font-normal">by</span> <span className="font-mono-num text-[#E65100]">{row.actor_username}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono-num">
                          {new Date(row.when).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {(row.added || []).map((k) => (
                          <span key={"a"+k} className="text-[10px] uppercase tracking-wider font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-sm">
                            + {PERMISSION_LABELS[k] || k}
                          </span>
                        ))}
                        {(row.removed || []).map((k) => (
                          <span key={"r"+k} className="text-[10px] uppercase tracking-wider font-bold bg-rose-50 border border-rose-200 text-rose-800 px-1.5 py-0.5 rounded-sm">
                            − {PERMISSION_LABELS[k] || k}
                          </span>
                        ))}
                        {(row.added || []).length === 0 && (row.removed || []).length === 0 && (
                          <span className="text-[10px] uppercase tracking-wider text-slate-400">No effective change</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="!justify-between flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={clearPermsOverride}
                    disabled={!Array.isArray(permTarget?.permissions) || permSaving}
                    data-testid="perm-clear-override"
                    className="rounded-sm">
              <RotateCcw className="w-4 h-4 mr-1" /> Clear custom (use role default)
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPermTarget(null)} className="rounded-sm">Cancel</Button>
              <Button onClick={savePerms} disabled={permSaving}
                      data-testid="perm-save"
                      className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">
                <CheckCircle2 className="w-4 h-4 mr-1" /> {permSaving ? "Saving…" : "Save access"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
