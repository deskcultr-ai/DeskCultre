"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department_id: string | null;
  can_create_tasks: boolean;
  can_review_tasks: boolean;
  can_manage_people: boolean;
  can_manage_organization: boolean;
  can_view_reports: boolean;
  can_manage_meetings: boolean;
  is_active: boolean;
};

type Department = {
  id: string;
  name: string;
  senior_manager_id: string | null;
};

type Actor = {
  company_id: string;
  role: string | null;
  can_manage_people: boolean;
};

const roleOptions = ["member", "reviewer", "executive", "manager", "admin"];
const managerPermissionFields = [
  ["can_manage_people", "People"],
  ["can_manage_organization", "Organization"],
  ["can_view_reports", "Reports"],
  ["can_manage_meetings", "Meetings"],
] as const;

function isAdmin(profile: Actor | null) {
  return ["admin", "owner"].includes(profile?.role ?? "");
}

export default function PeopleSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [actor, setActor] = useState<Actor | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Person>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const allowed = useMemo(
    () => isAdmin(actor) || actor?.can_manage_people === true,
    [actor]
  );
  const admin = isAdmin(actor);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id,role,can_manage_people")
      .eq("id", auth.user.id)
      .single();

    setActor(profile ?? null);
    const canOpen =
      ["admin", "owner"].includes(profile?.role ?? "") ||
      profile?.can_manage_people === true;

    if (profile && canOpen) {
      const [peopleResult, departmentsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,full_name,email,role,department_id,can_create_tasks,can_review_tasks,can_manage_people,can_manage_organization,can_view_reports,can_manage_meetings,is_active"
          )
          .eq("company_id", profile.company_id)
          .order("full_name"),
        supabase
          .from("departments")
          .select("id,name,senior_manager_id")
          .eq("company_id", profile.company_id)
          .order("name"),
      ]);

      const loadedPeople = peopleResult.data ?? [];
      setPeople(loadedPeople);
      setDrafts(
        Object.fromEntries(
          loadedPeople.map((person) => [person.id, { ...person }])
        )
      );
      setDepartments(departmentsResult.data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function updateDraft(id: string, patch: Partial<Person>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  async function save(personId: string) {
    const draft = drafts[personId];
    if (!draft || !admin) return;

    setSaving(personId);
    setError("");
    const role = draft.role ?? "member";
    const isManager = role === "manager";
    const isAdminRole = ["admin", "owner"].includes(role);

    const { error: rpcError } = await supabase.rpc("set_profile_access", {
      target_user_id: draft.id,
      target_role: role,
      target_department_id: draft.department_id || null,
      allow_task_creation: isAdminRole || draft.can_create_tasks,
      allow_review: isAdminRole || draft.can_review_tasks,
      allow_people: isAdminRole || (isManager && draft.can_manage_people),
      allow_organization:
        isAdminRole || (isManager && draft.can_manage_organization),
      allow_reports: isAdminRole || (isManager && draft.can_view_reports),
      allow_meetings: isAdminRole || (isManager && draft.can_manage_meetings),
      active: draft.is_active,
    });

    setSaving(null);
    if (rpcError) {
      setError(rpcError.message);
    } else {
      await load();
    }
  }

  async function setSeniorManager(person: Person) {
    if (!admin || !person.department_id) return;
    setSaving(person.id);
    setError("");
    const { error: rpcError } = await supabase.rpc(
      "set_department_senior_manager",
      {
        target_department_id: person.department_id,
        senior_user_id: person.id,
      }
    );
    setSaving(null);
    if (rpcError) {
      setError(rpcError.message);
    } else {
      await load();
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading people...
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        People management permission required.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-wrap justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-semibold text-cyan-300">DeskCulture</p>
            <h1 className="mt-1 text-3xl font-bold">People & Permissions</h1>
            <p className="mt-2 text-slate-400">
              Admins assign roles, senior managers, and selected manager
              permissions.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="h-fit rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold"
          >
            Dashboard
          </Link>
        </header>

        {!admin && (
          <p className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
            You can view people because an admin granted people access. Only
            admins can change roles, senior manager tags, or permissions.
          </p>
        )}
        {error && <p className="mt-5 text-sm text-red-300">{error}</p>}

        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[1150px] text-left text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Work</th>
                <th className="px-4 py-3">Manager Authorization</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const draft = drafts[person.id] ?? person;
                const department = departments.find(
                  (item) => item.id === draft.department_id
                );
                const senior =
                  department?.senior_manager_id &&
                  department.senior_manager_id === person.id;
                const managerEditable =
                  admin && ["manager", "admin", "owner"].includes(draft.role ?? "");

                return (
                  <tr key={person.id} className="border-t border-white/10">
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium">
                        {person.full_name || person.email}
                      </p>
                      <p className="text-xs text-slate-500">{person.email}</p>
                      {senior && (
                        <span className="mt-2 inline-flex rounded-full bg-violet-400/15 px-2 py-1 text-xs font-semibold text-violet-200">
                          Senior manager
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <select
                        value={draft.role ?? "member"}
                        onChange={(event) =>
                          updateDraft(person.id, { role: event.target.value })
                        }
                        disabled={!admin}
                        className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 capitalize disabled:opacity-60"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <select
                        value={draft.department_id ?? ""}
                        onChange={(event) =>
                          updateDraft(person.id, {
                            department_id: event.target.value || null,
                          })
                        }
                        disabled={!admin}
                        className="w-44 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 disabled:opacity-60"
                      >
                        <option value="">No department</option>
                        {departments.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="space-y-2 px-4 py-4 align-top">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.can_create_tasks}
                          onChange={(event) =>
                            updateDraft(person.id, {
                              can_create_tasks: event.target.checked,
                            })
                          }
                          disabled={!admin}
                        />
                        Create tasks
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.can_review_tasks}
                          onChange={(event) =>
                            updateDraft(person.id, {
                              can_review_tasks: event.target.checked,
                            })
                          }
                          disabled={!admin}
                        />
                        Review work
                      </label>
                    </td>
                    <td className="grid gap-2 px-4 py-4 align-top sm:grid-cols-2">
                      {managerPermissionFields.map(([field, label]) => (
                        <label key={field} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(draft[field])}
                            onChange={(event) =>
                              updateDraft(person.id, {
                                [field]: event.target.checked,
                              })
                            }
                            disabled={!managerEditable}
                          />
                          {label}
                        </label>
                      ))}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={(event) =>
                            updateDraft(person.id, {
                              is_active: event.target.checked,
                            })
                          }
                          disabled={!admin}
                        />
                        Active
                      </label>
                    </td>
                    <td className="space-y-2 px-4 py-4 align-top">
                      <button
                        disabled={!admin || saving === person.id}
                        onClick={() => save(person.id)}
                        className="w-full rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        disabled={
                          !admin ||
                          saving === person.id ||
                          !draft.department_id ||
                          !["manager", "admin", "owner"].includes(
                            draft.role ?? ""
                          )
                        }
                        onClick={() => setSeniorManager(draft)}
                        className="w-full rounded-lg border border-violet-300/40 px-3 py-2 font-semibold text-violet-100 disabled:opacity-50"
                      >
                        Make Senior
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
