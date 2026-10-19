import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react"
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { "data-state"?: string }

interface DeferredMenuProps {
  /** The menu's button. */
  trigger: ReactElement<TriggerProps>
  /** The menu itself: its DropdownMenuContent. */
  children: ReactNode
  /** For a menu that opens from elsewhere too, as an outline row's does from its keys. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * A dropdown menu for lists that run to hundreds, as a long book's manuscript, outline and matrix do. Each mounted
 * Radix menu listens to every key pressed anywhere, open or not, so hundreds of them make typing slow. Until it's
 * first opened, this draws only its button, which opens the menu just as Radix's would; from then on it's an
 * ordinary dropdown menu.
 */
export function DeferredMenu({ trigger, children, open, onOpenChange }: DeferredMenuProps) {
  const [wanted, setWanted] = useState(false)
  const mounted = wanted || !!open
  const opened = useRef(false)

  useEffect(trackKeys, [])
  useEffect(() => {
    if (!mounted || opened.current) return
    opened.current = true
    // Opened from the keys, a Radix menu puts focus on its first item, but this one wasn't listening yet.
    if (usingKeys) focusFirstItemSoon()
  }, [mounted])

  if (mounted) {
    return (
      <DropdownMenu defaultOpen open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        {children}
      </DropdownMenu>
    )
  }

  const want = () => {
    setWanted(true)
    onOpenChange?.(true)
  }
  const { onPointerDown, onKeyDown } = trigger.props
  const props: TriggerProps = {
    type: "button",
    "aria-haspopup": "menu",
    "aria-expanded": false,
    "data-state": "closed",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event)
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey) return
      // As Radix's button does: the menu takes focus, not the button.
      event.preventDefault()
      want()
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented || !OPEN_KEYS.includes(event.key)) return
      event.preventDefault()
      want()
    },
  }
  return cloneElement(trigger, props)
}

const OPEN_KEYS = ["Enter", " ", "ArrowDown"]

/** Whether the writer's last move was a key rather than the pointer, as Radix's menus tell it. */
let usingKeys = false
let tracking = false

function trackKeys() {
  if (tracking) return
  tracking = true
  const pointed = () => {
    usingKeys = false
  }
  document.addEventListener(
    "keydown",
    () => {
      usingKeys = true
    },
    { capture: true },
  )
  document.addEventListener("pointerdown", pointed, { capture: true })
  document.addEventListener("pointermove", pointed, { capture: true })
}

/** Once the menu has focus, as Radix gives it on opening, moves focus on to its first item. */
function focusFirstItemSoon() {
  let frames = 0
  const look = () => {
    const menu = document.activeElement
    if (menu instanceof HTMLElement && menu.getAttribute("role") === "menu") {
      menu.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])')?.focus()
      return
    }
    if (++frames < 30) requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
}
