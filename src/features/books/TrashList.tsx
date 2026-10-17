import { usePowerSync, useQuery } from "@powersync/react"
import { Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { attempt } from "@/app/feedback"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  daysLeft,
  emptyTrash,
  purgeItem,
  TRASH_DAYS,
  TRASHED_BOOKS_SQL,
  TRASHED_CHAPTERS_SQL,
  TRASHED_ENTRIES_SQL,
  TRASHED_SCENES_SQL,
  type TrashedBookRow,
  type TrashedChapterRow,
  type TrashedEntryRow,
  type TrashedSceneRow,
  type TrashKind,
} from "@/db/trash"
import { typeSingular, UNNAMED_ENTRY } from "@/features/codex/codexData"
import { restoreEntry } from "@/features/codex/mutations"
import { restoreChapter, restoreScene } from "@/features/plan/mutations"
import { chapterTitle, UNTITLED_SCENE } from "@/features/plan/status"
import { restoreBook } from "./mutations"

interface TrashItem {
  kind: TrashKind
  id: string
  title: string
  detail: string | null
  deletedAt: string
}

function timeLeft(deletedAt: string) {
  const days = daysLeft(deletedAt)
  if (days === 0) return "Deleted at next start"
  return days === 1 ? "1 day left" : `${days} days left`
}

/** The Trash (DESIGN.md §12): this book's chapters and scenes, its universe's codex entries, and every book. */
export function TrashList({ bookId }: { bookId: string | undefined }) {
  const db = usePowerSync()
  const chapters = useQuery<TrashedChapterRow>(TRASHED_CHAPTERS_SQL, [bookId ?? ""])
  const scenes = useQuery<TrashedSceneRow>(TRASHED_SCENES_SQL, [bookId ?? ""])
  const entries = useQuery<TrashedEntryRow>(TRASHED_ENTRIES_SQL, [bookId ?? ""])
  const books = useQuery<TrashedBookRow>(TRASHED_BOOKS_SQL)
  const [confirm, setConfirm] = useState<TrashItem | "empty" | null>(null)

  const sections: { heading: string; items: TrashItem[] }[] = [
    {
      heading: "Chapters",
      items: chapters.data.map((row) => ({
        kind: "chapter",
        id: row.id,
        title: chapterTitle(row.title),
        detail: null,
        deletedAt: row.deleted_at,
      })),
    },
    {
      heading: "Scenes",
      items: scenes.data.map((row) => ({
        kind: "scene",
        id: row.id,
        title: row.title?.trim() || UNTITLED_SCENE,
        detail: row.chapter_deleted
          ? `From “${chapterTitle(row.chapter_title)}”, also in the Trash`
          : `From “${chapterTitle(row.chapter_title)}”`,
        deletedAt: row.deleted_at,
      })),
    },
    {
      heading: "Codex entries",
      items: entries.data.map((row) => ({
        kind: "entry",
        id: row.id,
        title: row.name?.trim() || UNNAMED_ENTRY,
        detail:
          row.type_name === null
            ? null
            : typeSingular({ key: row.type_key, name: row.type_name, builtin: row.type_builtin }),
        deletedAt: row.deleted_at,
      })),
    },
    {
      heading: "Books",
      items: books.data.map((row) => ({
        kind: "book",
        id: row.id,
        title: row.title?.trim() || "Untitled book",
        detail: null,
        deletedAt: row.deleted_at,
      })),
    },
  ].filter((section) => section.items.length > 0) as { heading: string; items: TrashItem[] }[]
  const count = sections.reduce((sum, section) => sum + section.items.length, 0)
  const isLoading = chapters.isLoading || scenes.isLoading || entries.isLoading || books.isLoading

  const restore = async (item: TrashItem) => {
    const work =
      item.kind === "chapter"
        ? restoreChapter(db, item.id)
        : item.kind === "scene"
          ? restoreScene(db, item.id)
          : item.kind === "entry"
            ? restoreEntry(db, item.id)
            : restoreBook(db, item.id)
    if ((await attempt("restore", work.then(() => true))) !== true) return
    toast(`Restored “${item.title}”`)
  }

  const purge = async () => {
    if (confirm === "empty") await attempt("empty trash", emptyTrash(db, bookId ?? ""))
    else if (confirm) await attempt("delete forever", purgeItem(db, confirm.kind, confirm.id))
    setConfirm(null)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Trash</DialogTitle>
        <DialogDescription>
          Things stay here for {TRASH_DAYS} days, then they’re deleted for good.
        </DialogDescription>
      </DialogHeader>
      {isLoading ? null : count === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">The Trash is empty.</p>
      ) : (
        <div className="-mx-4 max-h-[min(60svh,28rem)] space-y-4 overflow-y-auto px-4">
          {sections.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {section.heading}
              </h3>
              <ul className="divide-y">
                {section.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.detail ? `${item.detail} · ` : ""}
                        {timeLeft(item.deletedAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void restore(item)} aria-label={`Restore ${item.title}`}>
                      Restore
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirm(item)}
                      aria-label={`Delete ${item.title} forever`}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {count > 0 && (
        <DialogFooter>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirm("empty")}
          >
            Empty Trash
          </Button>
        </DialogFooter>
      )}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "empty" ? "Empty the Trash?" : `Delete “${confirm?.title ?? ""}” forever?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "empty"
                ? `${count === 1 ? "The item" : `All ${count} items`} will be deleted for good. This can’t be undone.`
                : "It will be deleted for good. This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void purge()}>
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
