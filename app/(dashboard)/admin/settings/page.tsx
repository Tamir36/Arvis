"use client";

import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Save, Lock, Users, Pencil, Trash2, X } from "lucide-react";

type UserRole = "ADMIN" | "DRIVER" | "OPERATOR";

interface UserItem {
  id: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

interface EditState {
  username: string;
  role: UserRole;
}

export default function SettingsPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("OPERATOR");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);

  const roleLabel = useMemo(
    () => ({
      ADMIN: "Админ",
      DRIVER: "Жолооч",
      OPERATOR: "Оператор",
    }),
    []
  );

  const loadUsers = async () => {
    setListError("");
    setListLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setListError(data?.error || "Хэрэглэгчийн жагсаалт уншихад алдаа гарлаа");
        return;
      }
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      setListError("Сүлжээний алдаа гарлаа");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const startEdit = (user: UserItem) => {
    setEditingUserId(user.id);
    setEditState({ username: user.name, role: user.role });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditState(null);
    setListError("");
  };

  const handleUpdateUser = async (userId: string) => {
    if (!editState) return;

    const trimmedUsername = editState.username.trim();
    if (trimmedUsername.length < 3) {
      setListError("Нэвтрэх нэр хамгийн багадаа 3 тэмдэгт байна");
      return;
    }

    setListError("");
    setRowLoadingId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, role: editState.role }),
      });

      const data = await response.json();
      if (!response.ok) {
        setListError(data?.error || "Хэрэглэгч шинэчлэхэд алдаа гарлаа");
        return;
      }

      setUsers((prev) => prev.map((item) => (item.id === userId ? data.user : item)));
      cancelEdit();
    } catch {
      setListError("Сүлжээний алдаа гарлаа");
    } finally {
      setRowLoadingId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const confirmed = window.confirm("Энэ хэрэглэгчийг устгах уу?");
    if (!confirmed) return;

    setListError("");
    setRowLoadingId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (!response.ok) {
        setListError(data?.error || "Хэрэглэгч устгахад алдаа гарлаа");
        return;
      }

      setUsers((prev) => prev.filter((item) => item.id !== userId));
      if (editingUserId === userId) {
        cancelEdit();
      }
    } catch {
      setListError("Сүлжээний алдаа гарлаа");
    } finally {
      setRowLoadingId(null);
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    setCreateSuccess("");

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      setCreateError("Нэвтрэх нэр хамгийн багадаа 3 тэмдэгт байна");
      return;
    }
    if (password.length < 4) {
      setCreateError("Нууц үг хамгийн багадаа 4 тэмдэгт байна");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        setCreateError(data?.error || "Хэрэглэгч үүсгэхэд алдаа гарлаа");
        return;
      }

      setCreateSuccess(data?.message || "Хэрэглэгч амжилттай үүслээ");
      setUsername("");
      setPassword("");
      setRole("OPERATOR");
      await loadUsers();
    } catch {
      setCreateError("Сүлжээний алдаа гарлаа");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <Header title="Тохиргоо" />

      <div className="p-5 space-y-5 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Хэрэглэгч үүсгэх
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-user-role" className="block text-sm font-medium text-slate-700">
                Эрхийн төрөл
              </label>
              <select
                id="new-user-role"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="ADMIN">Админ</option>
                <option value="DRIVER">Жолооч</option>
                <option value="OPERATOR">Оператор</option>
              </select>
            </div>

            <Input
              id="new-user-username"
              label="Нэвтрэх нэр"
              placeholder="Жишээ: operator1"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <Input
              id="new-user-password"
              label="Нууц үг"
              type="password"
              placeholder="Нууц үг оруулна уу"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {createError && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="p-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700">
                {createSuccess}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              isLoading={isSubmitting}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Хэрэглэгч хадгалах
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Бүртгэлтэй хэрэглэгчид
            </CardTitle>
          </CardHeader>

          {listError && (
            <div className="mb-3 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              {listError}
            </div>
          )}

          {listLoading ? (
            <div className="p-4 text-sm text-slate-500">Жагсаалт уншиж байна...</div>
          ) : users.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Хэрэглэгч олдсонгүй</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-medium">Нэвтрэх нэр</th>
                    <th className="py-2 pr-3 font-medium">Эрх</th>
                    <th className="py-2 pr-3 font-medium">Үүсгэсэн</th>
                    <th className="py-2 text-right font-medium">Үйлдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isEditing = editingUserId === user.id && editState !== null;
                    const isRowLoading = rowLoadingId === user.id;

                    return (
                      <tr key={user.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">
                          {isEditing ? (
                            <input
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editState.username}
                              onChange={(event) =>
                                setEditState((prev) =>
                                  prev ? { ...prev, username: event.target.value } : prev
                                )
                              }
                            />
                          ) : (
                            <span className="font-medium text-slate-800">{user.name}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {isEditing ? (
                            <select
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editState.role}
                              onChange={(event) =>
                                setEditState((prev) =>
                                  prev ? { ...prev, role: event.target.value as UserRole } : prev
                                )
                              }
                            >
                              <option value="ADMIN">Админ</option>
                              <option value="DRIVER">Жолооч</option>
                              <option value="OPERATOR">Оператор</option>
                            </select>
                          ) : (
                            <span className="text-slate-700">{roleLabel[user.role]}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-slate-500">
                          {new Date(user.createdAt).toLocaleDateString("mn-MN")}
                        </td>
                        <td className="py-2 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleUpdateUser(user.id)}
                                isLoading={isRowLoading}
                                leftIcon={<Save className="w-3.5 h-3.5" />}
                              >
                                Хадгалах
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEdit}
                                disabled={isRowLoading}
                                leftIcon={<X className="w-3.5 h-3.5" />}
                              >
                                Болих
                              </Button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(user)}
                                disabled={isRowLoading || (editingUserId !== null && editingUserId !== user.id)}
                                leftIcon={<Pencil className="w-3.5 h-3.5" />}
                              >
                                Засах
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDeleteUser(user.id)}
                                disabled={isRowLoading || editingUserId === user.id}
                                isLoading={isRowLoading}
                                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                              >
                                Устгах
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
