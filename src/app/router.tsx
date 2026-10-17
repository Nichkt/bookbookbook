import { createBrowserRouter, Navigate } from "react-router"
import { CodexScreen } from "@/features/codex/CodexScreen"
import { ImeLab } from "@/features/lab/ImeLab"
import { PlanIndex, PlanScreen } from "@/features/plan/PlanScreen"
import { WriteScreen } from "@/features/write/WriteScreen"
import { AppShell } from "./AppShell"
import { OpenBook } from "./OpenBook"
import { InboxScreen, NotFoundScreen } from "./PlaceholderScreens"
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
              { path: "plan", element: <PlanIndex /> },
              { path: "plan/:view", element: <PlanScreen /> },
              { path: "write/:chapterId?/:sceneId?", element: <WriteScreen /> },
              { path: "codex/:entryId?", element: <CodexScreen /> },
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
