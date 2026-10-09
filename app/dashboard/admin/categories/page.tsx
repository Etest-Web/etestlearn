"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminGuard } from "@/components/role-guard";
import { PageShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, Input, Label } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

function CategoriesBody() {
  const categories = useQuery(api.categories.list);
  const create = useMutation(api.categories.create);
  const rename = useMutation(api.categories.rename);
  const remove = useMutation(api.categories.remove);

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  if (categories === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  async function handleCreate() {
    try {
      await create({ name });
      toast.success("Category added");
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add category");
    }
  }

  async function handleRename() {
    if (!editingId) return;
    try {
      await rename({ categoryId: editingId as never, name: editingName });
      toast.success("Category renamed");
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename category");
    }
  }

  async function handleDelete(categoryId: string) {
    try {
      await remove({ categoryId: categoryId as never });
      toast.success("Category deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete category");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="rounded-2xl p-5">
        <div className="space-y-2">
          <Label htmlFor="new-category">Add a category</Label>
          <div className="flex gap-2">
            <Input
              id="new-category"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Data Analysis"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
            />
            <Button onClick={handleCreate} disabled={!name.trim()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Categories feed the course form and the catalog. Existing free-typed course
            categories keep working; deletion is refused while published courses still use the name.
          </p>
        </div>
      </Card>

      <Card className="gap-0 rounded-2xl p-0">
        <ul className="divide-y divide-rule">
          {categories.map((category) => (
            <li key={category._id} className="flex items-center justify-between gap-3 px-5 py-3">
              {editingId === category._id ? (
                <div className="flex min-w-0 flex-1 gap-2">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={60}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleRename} disabled={!editingName.trim()}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-medium">{category.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Rename ${category.name}`}
                      onClick={() => {
                        setEditingId(category._id);
                        setEditingName(category.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${category.name}`}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(category._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && (
            <li>
              <EmptyState
                icon={Tags}
                tone="brand"
                title="No categories yet"
                description="Categories group the public catalog and are what learners filter by. Add the first one above."
              />
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <AdminGuard>
      <PageShell width="narrow">
        <PageHeader
          title="Categories"
          description="The curated taxonomy for courses — renames and deletions are audited."
        />
        <CategoriesBody />
      </PageShell>
    </AdminGuard>
  );
}