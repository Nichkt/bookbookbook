import { createBrowserRouter } from "react-router"
import { HomeScreen } from "@/features/home/HomeScreen"
import { AppShell } from "./AppShell"
import { NotFoundScreen } from "./PlaceholderScreens"
import { BookIndex, CodexRedirect, InboxRedirect } from "./redirects"
import { RouteError } from "./RouteError"
import { screens } from "./screens"

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
              { path: "plan", lazy: async () => ({ Component: (await screens.plan()).PlanIndex }) },
              { path: "plan/:view", lazy: async () => ({ Component: (await screens.plan()).PlanScreen }) },
              {
                path: "write/:chapterId?/:sceneId?",
                lazy: async () => ({ Component: (await screens.write()).WriteScreen }),
              },
              { path: "world/:entryId?", lazy: async () => ({ Component: (await screens.world()).CodexScreen }) },
              { path: "codex/:entryId?", element: <CodexRedirect /> },
              { path: "inbox", lazy: async () => ({ Component: (await screens.inbox()).InboxScreen }) },
            ],
          },
          { path: "inbox", element: <InboxRedirect /> },
          { path: "lab/ime", lazy: async () => ({ Component: (await import("@/features/lab/ImeLab")).ImeLab }) },
          { path: "*", element: <NotFoundScreen /> },
        ],
      },
    ],
  },
])
