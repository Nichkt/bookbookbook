import { createBrowserRouter, Navigate } from "react-router"
import { ImeLab } from "@/features/lab/ImeLab"
import { WriteScreen } from "@/features/write/WriteScreen"
import { AppShell } from "./AppShell"
import { OpenBook } from "./OpenBook"
import { CodexScreen, InboxScreen, NotFoundScreen, PlanScreen } from "./PlaceholderScreens"
import { RouteError } from "./RouteError"

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        // A screen that crashes shows the error inside the shell, so the tabs still work.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <OpenBook /> },
          {
            path: "b/:bookId",
            children: [
              { index: true, element: <Navigate to="write" replace /> },
              { path: "plan", element: <PlanScreen /> },
              { path: "write/:chapterId?", element: <WriteScreen /> },
              { path: "codex", element: <CodexScreen /> },
            ],
          },
          { path: "inbox", element: <InboxScreen /> },
          { path: "lab/ime", element: <ImeLab /> },
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
    ],
  },
])
