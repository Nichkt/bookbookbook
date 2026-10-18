import { AppWindowIcon, AppWindowMacIcon, EllipsisIcon, ShareIcon, SquarePlusIcon, type LucideIcon } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { promptInstall, useInstall, useInstallWay, type InstallWay } from "@/app/install"
import { Button } from "@/components/ui/button"
import { usePref } from "@/db/prefs"
import { focusPast } from "@/lib/focus"
import { cn } from "@/lib/utils"

/** "dismissed" once the writer has said not now, which is for good on this device. */
export const INSTALL_NOTICE_PREF = "install.notice"

const TITLE_ID = "install-notice-title"

const TITLES: Record<InstallWay, string> = {
  offer: "Install bookbookbook",
  "home-screen": "Add bookbookbook to your Home Screen",
  dock: "Add bookbookbook to your Dock",
}

const ICONS: Record<InstallWay, LucideIcon> = {
  offer: AppWindowIcon,
  "home-screen": SquarePlusIcon,
  dock: AppWindowMacIcon,
}

/**
 * The offer to install the app (DESIGN.md §11), on the home screen: the browser's Install in Chrome and Edge, or
 * Safari's steps on an iPhone, iPad or Mac, where an installed app's books aren't cleared after a week away.
 */
export function InstallNotice({ hasBooks, className }: { hasBooks: boolean; className?: string }) {
  const way = useInstallWay()
  const declined = useInstall((state) => state.declined)
  const { value, isLoading, setValue } = usePref(INSTALL_NOTICE_PREF)
  if (!way || declined || isLoading || value === "dismissed") return null
  return <Notice way={way} hasBooks={hasBooks} dismiss={() => void setValue("dismissed")} className={className} />
}

/** A button's name, as the steps give it, ending with its icon: the last word and the icon keep to one line. */
function Shown({ name, icon: Icon }: { name: string; icon: LucideIcon }) {
  const words = name.split(" ")
  const last = words.pop()
  return (
    <>
      {words.length > 0 && `${words.join(" ")} `}
      <span className="whitespace-nowrap">
        {last}{" "}
        <Icon aria-hidden="true" className="mx-0.5 inline size-4 align-[-0.2em] text-ink" />
      </span>
    </>
  )
}

function Steps({ way, hasBooks }: { way: InstallWay; hasBooks: boolean }) {
  if (way === "offer") {
    return (
      <p>
        Open it like any other app, in a window of its own, from your dock, taskbar or home screen. Your books come
        with it.
      </p>
    )
  }
  return (
    <>
      <p>
        This browser can clear a website's data, your books with it, after a week without a visit. An app
        {way === "dock" ? " in your Dock" : " on your Home Screen"} keeps its books.
      </p>
      {way === "dock" ? (
        <p>From Safari's menu bar, choose File, then Add to Dock, and write in the app from then on.</p>
      ) : (
        <p>
          Tap <Shown name="Share" icon={ShareIcon} /> (under <Shown name="More" icon={EllipsisIcon} />, if you don't
          see it), then <Shown name="Add to Home Screen" icon={SquarePlusIcon} />, and write in the app from then on.
        </p>
      )}
      {hasBooks && (
        <p>
          The app keeps its own books, apart from the browser's. To take a book you've started here, open it, choose
          Backups… from its book menu, then Back up now, and restore that backup in the app.
        </p>
      )}
    </>
  )
}

function Notice({
  way,
  hasBooks,
  dismiss,
  className,
}: {
  way: InstallWay
  hasBooks: boolean
  dismiss: () => void
  className?: string
}) {
  const section = useRef<HTMLElement>(null)
  // While the browser's dialog is up.
  const [asking, setAsking] = useState(false)
  const Icon = ICONS[way]

  // As the notice goes, focus moves on to what follows it, rather than drop to the top of the page.
  useLayoutEffect(() => {
    const element = section.current
    return () => {
      if (element?.contains(document.activeElement)) focusPast(element)
    }
  }, [])

  const install = async () => {
    if (asking) return
    setAsking(true)
    await promptInstall()
    setAsking(false)
  }

  return (
    <section
      ref={section}
      aria-labelledby={TITLE_ID}
      className={cn("flex gap-3 rounded-xl border bg-accent-soft p-4 text-sm text-ink-2 sm:p-5", className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="grid min-w-0 flex-1 gap-2">
        <h2 id={TITLE_ID} className="font-heading text-base font-semibold text-ink">
          {TITLES[way]}
        </h2>
        <Steps way={way} hasBooks={hasBooks} />
        <div className="mt-1 flex flex-wrap gap-2">
          {way === "offer" && (
            <Button
              size="sm"
              aria-disabled={asking}
              className="aria-disabled:opacity-50"
              onClick={() => void install()}
            >
              Install
            </Button>
          )}
          <Button
            size="sm"
            variant={way === "offer" ? "ghost" : "outline"}
            aria-disabled={asking}
            className="aria-disabled:opacity-50"
            onClick={() => {
              if (!asking) dismiss()
            }}
          >
            {way === "offer" ? "Not now" : "Got it"}
          </Button>
        </div>
      </div>
    </section>
  )
}
