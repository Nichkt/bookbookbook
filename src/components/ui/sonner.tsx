import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/app/theme"
import { letToastsThroughDialogs } from "@/lib/toasts"

// shadcn's Toaster, reading the app's theme store instead of next-themes. Sepia is a light theme.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme((s) => s.theme)
  useEffect(letToastsThroughDialogs, [])

  return (
    <Sonner
      theme={theme === "dark" ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Sonner sets the button's height but not its min-height: 44px targets on touch screens (DESIGN.md §16).
          actionButton: "pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
