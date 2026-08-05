import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { createTaskList, deleteTaskList, listTaskLists } from "../api/taskLists";
import { createTask, getTask, listTasks, updateTask as apiUpdateTask } from "../api/tasks";
import { listUsers } from "../api/users";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import type { PublicUser, Task, TaskList, TaskStatus } from "../api/types";

const STATUS_GROUPS: { status: TaskStatus; label: string }[] = [
  { status: "to_do", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "in_review", label: "In Review" },
  { status: "complete", label: "Complete" },
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function TasksListPage() {
  const { id: taskIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [lists, setLists] = useState<TaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [loadedLists, loadedUsers] = await Promise.all([listTaskLists(), listUsers()]);
        setLists(loadedLists);
        setUsers(loadedUsers);
        setError(null);
        if (loadedLists.length > 0) setSelectedListId(loadedLists[0].id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load task lists");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function refreshTasks(listId: string) {
    try {
      setTasks(await listTasks(listId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load tasks");
    }
  }

  useEffect(() => {
    if (selectedListId) refreshTasks(selectedListId);
    else setTasks([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  // Deep link support: a direct visit to /tasks/:id (e.g. a page refresh, or
  // a link shared from a notification) may name a task outside whichever
  // list happens to be selected - fetch it directly and switch lists.
  useEffect(() => {
    if (!taskIdParam || tasks.some((t) => t.id === taskIdParam)) return;
    getTask(taskIdParam)
      .then((task) => {
        if (task.list_id !== selectedListId) setSelectedListId(task.list_id);
        else setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
      })
      .catch(() => navigate("/tasks", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdParam, tasks, selectedListId]);

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const list = await createTaskList({ name: newListName.trim() });
      setLists((prev) => [...prev, list]);
      setSelectedListId(list.id);
      setNewListName("");
      setShowNewList(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create list");
    }
  }

  async function handleDeleteList(list: TaskList) {
    if (!window.confirm(`Delete "${list.name}"? This deletes all of its tasks.`)) return;
    try {
      await deleteTaskList(list.id);
      const remaining = lists.filter((l) => l.id !== list.id);
      setLists(remaining);
      if (selectedListId === list.id) setSelectedListId(remaining[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete list");
    }
  }

  async function handleAddTask(status: TaskStatus, title: string) {
    if (!selectedListId || !title.trim()) return;
    try {
      const task = await createTask({ list_id: selectedListId, title: title.trim(), status });
      setTasks((prev) => [...prev, task]);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add task");
    }
  }

  async function handleQuickStatusChange(task: Task, status: TaskStatus) {
    try {
      const updated = await apiUpdateTask(task.id, { status });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  function handleTaskChanged(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleTaskDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    navigate("/tasks");
  }

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;
  const openTask = taskIdParam ? tasks.find((t) => t.id === taskIdParam) ?? null : null;

  return (
    <div className="tasks-layout">
      <aside className="tasks-sidebar">
        <p className="tasks-sidebar-heading">Lists</p>
        {lists.map((list) => (
          <div
            key={list.id}
            className={`tasks-sidebar-item ${list.id === selectedListId ? "active" : ""}`}
            onClick={() => setSelectedListId(list.id)}
          >
            <span>{list.name}</span>
          </div>
        ))}

        {showNewList ? (
          <form className="tasks-sidebar-new" onSubmit={handleCreateList}>
            <input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onBlur={() => {
                if (!newListName.trim()) setShowNewList(false);
              }}
              placeholder="List name"
            />
          </form>
        ) : (
          <button type="button" className="button-secondary tasks-sidebar-new" onClick={() => setShowNewList(true)}>
            + New List
          </button>
        )}
      </aside>

      <div className="tasks-content">
        {error && <p className="error">{error}</p>}

        {loading ? (
          <p>Loading…</p>
        ) : !selectedList ? (
          <p className="muted">Create a list to get started.</p>
        ) : (
          <>
            <div className="page-header">
              <h1>{selectedList.name}</h1>
              <button type="button" className="button-secondary" onClick={() => handleDeleteList(selectedList)}>
                Delete list
              </button>
            </div>

            {STATUS_GROUPS.map((group) => (
              <TaskGroup
                key={group.status}
                label={group.label}
                status={group.status}
                tasks={tasks.filter((t) => t.status === group.status)}
                onAddTask={(title) => handleAddTask(group.status, title)}
                onOpenTask={(id) => navigate(`/tasks/${id}`)}
                onStatusChange={handleQuickStatusChange}
              />
            ))}
          </>
        )}
      </div>

      {openTask && (
        <TaskDetailPanel
          task={openTask}
          lists={lists}
          users={users}
          onClose={() => navigate("/tasks")}
          onChanged={handleTaskChanged}
          onDeleted={() => handleTaskDeleted(openTask.id)}
        />
      )}
    </div>
  );
}

function TaskGroup({
  label,
  status,
  tasks,
  onAddTask,
  onOpenTask,
  onStatusChange,
}: {
  label: string;
  status: TaskStatus;
  tasks: Task[];
  onAddTask: (title: string) => void;
  onOpenTask: (id: string) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
}) {
  const [newTitle, setNewTitle] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && newTitle.trim()) {
      onAddTask(newTitle);
      setNewTitle("");
    }
  }

  return (
    <details className="task-group" open={status !== "complete"}>
      <summary>
        <span className="task-group-chevron" aria-hidden="true">
          &rsaquo;
        </span>
        {label}
        <span className="task-group-count">{tasks.length}</span>
      </summary>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Assignee</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <button type="button" className="task-row-title" onClick={() => onOpenTask(task.id)}>
                  {task.title}
                </button>
              </td>
              <td>
                <div className="task-assignee-avatars">
                  {task.assignees.map((a) => (
                    <span key={a.user_id} className="task-avatar" title={a.display_name}>
                      {initials(a.display_name)}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <select value={task.status} onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}>
                  {STATUS_GROUPS.map((g) => (
                    <option key={g.status} value={g.status}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {task.priority ? (
                  <span className={`badge-neutral badge-priority-${task.priority}`}>{task.priority}</span>
                ) : (
                  "—"
                )}
              </td>
              <td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
          <tr className="task-add-row">
            <td colSpan={5}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="+ Add Task"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}
