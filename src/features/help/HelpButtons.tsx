import { BookAIcon, CircleHelpIcon, SignpostIcon } from "lucide-react"
import { useRef } from "react"
import { useLocation } from "react-router"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { openGlossary, startTour } from "./helpStore"
import { tourForPath } from "./tours"

/**
 * The header's How to use this (the page's tour) and Glossary buttons (DESIGN.md §17a). Phones get one Help menu
 * with both.
 */
export function HelpButtons() {
  const { pathname } = useLocation()
  const tour = tourForPath(pathname)
  const trigger = useRef<HTMLButtonElement>(null)
  // Set when an item opens a dialog, so the closing menu doesn't pull focus back to its trigger.
  const openingDialog = useRef(false)

  return (
    <>
      <div className="hidden items-center gap-0.5 sm:flex">
        {tour && (
          <Button
            variant="ghost"
            size="sm"
            data-tour="help-tour"
            title="A tour of this page"
            onClick={(event) => startTour(tour, event.currentTarget)}
          >
            <SignpostIcon />
            <span className="sr-only lg:not-sr-only">How to use this</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-tour="help-glossary"
          title="What the words mean"
          onClick={(event) => openGlossary("", event.currentTarget)}
        >
          <BookAIcon />
          <span className="sr-only lg:not-sr-only">Glossary</span>
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="ghost" size="icon" data-tour="help-tour help-glossary" className="sm:hidden">
            <CircleHelpIcon />
            <span className="sr-only">Help</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onCloseAutoFocus={(event) => {
            if (!openingDialog.current) return
            openingDialog.current = false
            event.preventDefault()
          }}
        >
          {tour && (
            <DropdownMenuItem
              onSelect={() => {
                openingDialog.current = true
                startTour(tour, trigger.current)
              }}
            >
              <SignpostIcon />
              How to use this
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              openingDialog.current = true
              openGlossary("", trigger.current)
            }}
          >
            <BookAIcon />
            Glossary
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
