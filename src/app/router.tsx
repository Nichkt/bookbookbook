import { createBrowserRouter } from "react-router"
import { CodexScreen } from "@/features/codex/CodexScreen"
import { HomeScreen } from "@/features/home/HomeScreen"
import { InboxScreen } from "@/features/inbox/InboxScreen"
import { ImeLab } from "@/features/lab/ImeLab"
import { PlanIndex, PlanScreen } from "@/features/plan/PlanScreen"
import { WriteScreen } from "@/features/write/WriteScreen"
import { AppShell } from "./AppShell"
import { NotFoundScreen } from "./PlaceholderScreens"
import { BookIndex, CodexRedirect, InboxRedirect } from "./redirects"
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
          { index: true, element: <HomeScreen /> },
          {
            path: "b/:bookId",
            children: [
              { index: true, element: <BookIndex /> },
              { path: "plan", element: <PlanIndex /> },
              { path: "plan/:view", element: <PlanScreen /> },
              { path: "write/:chapterId?/:sceneId?", element: <WriteScreen /> },
              { path: "world/:entryId?", element: <CodexScreen /> },
              { path: "codex/:entryId?", element: <CodexRedirect /> },
              { path: "inbox", element: <InboxScreen /> },
            ],
          },
          { path: "inbox", element: <InboxRedirect /> },
          { path: "lab/ime", element: <ImeLab /> },
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
    ],
  },
])
