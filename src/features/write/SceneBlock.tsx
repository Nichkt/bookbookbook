import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, HistoryIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, type RefObject } from "react"
import { DraftInput } from "@/components/DraftField"
import { Button } from "@/components/ui/button"
import { useAfterMenu } from "@/components/useAfterMenu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { editorOf } from "@/editor/activeEditor"
import { SceneEditor } from "@/editor/SceneEditor"
import { useSceneDoc, useSceneWords } from "@/editor/useSceneDoc"
import { moveSceneBy, trashSceneWithUndo } from "@/features/plan/commands"
import { updateScene } from "@/features/plan/mutations"
import type { PlanChapter, PlanSceneRow } from "@/features/plan/planData"
import { UNTITLED_SCENE } from "@/features/plan/status"
import { isComposing } from "@/lib/keys"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { openHistory } from "./history"
import { useNearViewport } from "./pageHooks"
import { estimatedHeight } from "./sequence"
import { sceneLabel, sceneNameIn, useWrite } from "./writeContext"

interface SceneBlockProps {
  chapter: PlanChapter
  scene: Readonly<PlanSceneRow>
  /** Its place in the chapter, from 0. */
  index: number
  /** Draws a scene break above it. */
  divider: boolean
  /** The level of the scene's heading, one below the chapter's. */
  headingLevel: 2 | 3
  /** Mounts the editor only near the viewport, as the manuscript does. */
  lazy?: boolean
}

/** One scene on the page: a break above it after the first, its header if the writer made it, and its text. */
export function SceneBlock({ chapter, scene, index, divider, headingLevel, lazy = false }: SceneBlockProps) {
  const { matcher } = useWrite()
  const section = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const near = useNearViewport(section, lazy)
  const provider = useSceneDoc(near ? scene.id : null)
  const words = useSceneWords(provider) ?? scene.word_count ?? 0
  useRememberHeight(body, scene.id, !!provider)

  return (
    <section ref={section} data-scene-id={scene.id} className="scroll-mt-32">
      {divider && (
        <div aria-hidden="true" className="my-10 text-center text-2xl leading-none text-muted-foreground select-none">
          ⁂
        </div>
      )}
      {!scene.is_implicit && (
        <SceneHeader chapter={chapter} scene={scene} index={index} words={words} headingLevel={headingLevel} />
      )}
      <div ref={body} data-tour="write-editor">
        {provider ? (
          <SceneEditor provider={provider} matcher={matcher} label={sceneLabel(scene, index)} />
        ) : (
          <div
            aria-hidden="true"
            style={{ height: heights.get(scene.id) ?? estimatedHeight(scene.word_count) }}
            className={cn("rounded-md", near && "animate-pulse bg-surface-2/60")}
          />
        )}
      </div>
    </section>
  )
}

interface SceneHeaderProps {
  chapter: PlanChapter
  scene: Readonly<PlanSceneRow>
  index: number
  words: number
  headingLevel: 2 | 3
}

function SceneHeader({ chapter, scene, index, words, headingLevel }: SceneHeaderProps) {
  const { db, plan, focusItem } = useWrite()
  const trigger = useRef<HTMLButtonElement>(null)
  const { after, onCloseAutoFocus } = useAfterMenu()
  const number = index + 1
  const title = scene.title?.trim()
  const Heading = headingLevel === 2 ? "h2" : "h3"
  // The manuscript shows every chapter's scene 1, so names say which chapter.
  const where = `scene ${number} in chapter ${chapter.number}`

  return (
    <header className="mb-3 flex items-center gap-1.5 font-sans">
      {/* For moving through scenes by heading; the title field below is what shows. */}
      <Heading className="sr-only">
        Scene {number}
        {title ? `: ${title}` : ""}
      </Heading>
      <DraftInput
        data-write-scene-title={scene.id}
        aria-label={`Title of ${where}`}
        placeholder={UNTITLED_SCENE}
        value={scene.title ?? ""}
        onSave={(next) => updateScene(db, scene.id, { title: next })}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || isComposing(event.nativeEvent)) return
          event.preventDefault()
          editorOf(scene.id)?.editor.commands.focus("start")
        }}
        className="-ml-2 h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 font-semibold text-ink-2 shadow-none hover:border-input dark:bg-transparent"
      />
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatCount(words)} words</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${where}`}
            className="shrink-0 text-muted-foreground"
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={onCloseAutoFocus}>
          <DropdownMenuItem
            disabled={index === 0}
            onSelect={() => after(() => void moveSceneBy(db, plan, chapter.id, scene.id, -1, focusItem))}
          >
            <ArrowUpIcon />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === chapter.scenes.length - 1}
            onSelect={() => after(() => void moveSceneBy(db, plan, chapter.id, scene.id, 1, focusItem))}
          >
            <ArrowDownIcon />
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => after(() => openHistory(scene.id, sceneNameIn(plan, scene.id), trigger.current))}
          >
            <HistoryIcon />
            History…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => after(() => void trashSceneWithUndo(db, plan, chapter.id, scene.id, focusItem))}
          >
            <Trash2Icon />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

/** The measured height of each scene's text, so a scene without its editor holds the space it took. */
const heights = new Map<string, number>()

function useRememberHeight(ref: RefObject<HTMLElement | null>, sceneId: string, active: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!active || !element) return
    const observer = new ResizeObserver(() => {
      if (element.offsetHeight > 0) heights.set(sceneId, element.offsetHeight)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, sceneId, active])
}
