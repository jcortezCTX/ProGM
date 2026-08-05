import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { deleteTask, updateTask } from "../api/tasks";
import type { PublicUser, Task, TaskList, TaskPriority, TaskStatus, UpdateTaskInput } from "../api/types";

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "to_do", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "complete", label: "Complete" },
];

const PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

export function TaskDetailPanel({
  task,
  lists,
  users,
  onClose,
  onChanged,
  onDeleted,
}: {
  task: Task;
  lists: TaskList[];
  users: PublicUser[];
  onClose: () => void;
  onChanged: (task: Task) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [project, setProject] = useState(task.project ?? "");
  const [category, setCategory] = useState(task.category ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setProject(task.project ?? "");
    setCategory(task.category ?? "");
  }, [task.id, task.title, task.description, task.project, task.category]);

  async function save(input: UpdateTaskInput) {
    setSaving(true);
    try {
      onChanged(await updateTask(task.id, input));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await deleteTask(task.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete task");
    }
  }

  function toggleAssignee(userId: string) {
    const current = task.assignees.map((a) => a.user_id);
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    save({ assignee_ids: next });
  }

  const assignedIds = new Set(task.assignees.map((a) => a.user_id));

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <input
            className="detail-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) save({ title: title.trim() });
              else setTitle(task.title);
            }}
            aria-label="Task title"
          />
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="property-rows">
          <div className="property-row">
            <span className="property-row-label">List</span>
            <select value={task.list_id} onChange={(e) => save({ list_id: e.target.value })}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="property-row">
            <span className="property-row-label">Status</span>
            <select value={task.status} onChange={(e) => save({ status: e.target.value as TaskStatus })}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="property-row">
            <span className="property-row-label">Assignees</span>
            <div className="assignee-picker">
              {task.assignees.map((a) => (
                <span key={a.user_id} className="detail-tag-chip">
                  {a.display_name}
                  <button
                    type="button"
                    className="detail-tag-remove"
                    onClick={() => toggleAssignee(a.user_id)}
                    aria-label={`Unassign ${a.display_name}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <select value="" onChange={(e) => e.target.value && toggleAssignee(e.target.value)}>
                <option value="">+ Assign</option>
                {users
                  .filter((u) => !assignedIds.has(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="property-row">
            <span className="property-row-label">Start date</span>
            <input
              type="date"
              value={task.start_date ?? ""}
              onChange={(e) => save({ start_date: e.target.value || null })}
            />
          </div>

          <div className="property-row">
            <span className="property-row-label">Due date</span>
            <input
              type="date"
              value={task.due_date ?? ""}
              onChange={(e) => save({ due_date: e.target.value || null })}
            />
          </div>

          <div className="property-row">
            <span className="property-row-label">Priority</span>
            <select
              value={task.priority ?? ""}
              onChange={(e) => save({ priority: (e.target.value || null) as TaskPriority | null })}
            >
              <option value="">None</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="property-row">
            <span className="property-row-label">Project</span>
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              onBlur={() => project !== (task.project ?? "") && save({ project: project.trim() || null })}
            />
          </div>

          <div className="property-row">
            <span className="property-row-label">Category</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => category !== (task.category ?? "") && save({ category: category.trim() || null })}
            />
          </div>
        </div>

        <div className="detail-field">
          <span className="detail-field-heading">Description</span>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (task.description ?? "") && save({ description: description.trim() || null })}
          />
        </div>

        <div className="panel-footer">
          <button type="button" className="button-secondary" onClick={handleDelete} disabled={saving}>
            Delete task
          </button>
        </div>
      </div>
    </div>
  );
}
