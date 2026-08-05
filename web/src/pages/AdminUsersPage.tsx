import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { createUser, listUsers, updateUserRole } from "../api/auth";
import type { PublicUser, UserRole } from "../api/types";

const ROLES: UserRole[] = ["admin", "manager", "member"];

export function AdminUsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(input: { email: string; display_name: string; role: UserRole; password: string }) {
    await createUser(input);
    setShowForm(false);
    await refresh();
  }

  async function handleRoleChange(id: string, role: UserRole) {
    const previous = users;
    setUsers((current) => current.map((u) => (u.id === id ? { ...u, role } : u)));
    try {
      await updateUserRole(id, role);
    } catch (err) {
      setUsers(previous);
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Users</h1>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add user"}
        </button>
      </div>

      {showForm && <AddUserForm onSubmit={handleCreate} />}

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Login enabled</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.has_password ? "Yes" : "No (Azure AD only)"}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4}>No users yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddUserForm({
  onSubmit,
}: {
  onSubmit: (input: { email: string; display_name: string; role: UserRole; password: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ email, display_name: displayName, role, password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        Temporary password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Create user"}
      </button>
    </form>
  );
}
