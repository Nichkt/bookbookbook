import type { UpdateState } from "@/app/updates"

/*
 * What Updates (UpdatesDialog.tsx) says and offers at each step. Pure, so it's tested without a page.
 */

/** What's happening, in a sentence. */
export function statusOf(state: UpdateState): string {
  switch (state.step) {
    case "idle":
    case "checking":
      return "Checking for a new version…"
    case "latest":
      return "You have the newest version."
    case "found":
      return `bookbookbook ${state.version} is out.`
    case "downloading":
      return `Downloading bookbookbook ${state.version}…`
    case "ready":
      return `bookbookbook ${state.version} has downloaded, and is ready to install.`
    case "installing":
      return `Saving your work, then installing bookbookbook ${state.version}. It closes, and opens again in a moment.`
    case "failed":
      if (state.during === "check") {
        return "bookbookbook couldn't check for a new version. Check you're connected to the internet, then try again."
      }
      if (state.during === "download") {
        return (
          `bookbookbook ${state.version} didn't download properly, so nothing has changed. ` +
          "Check you're connected to the internet and try again, or download it from GitHub."
        )
      }
      return `bookbookbook ${state.version} couldn't be installed. Try again, or download it from GitHub.`
  }
}

export interface UpdateAction {
  label: string
  /** What it does: nothing while something's under way. */
  does: "check" | "install" | null
  /** The way forward to a new version, rather than another look. */
  primary: boolean
}

/** What to know before going on, if anything. */
export function hintOf(state: UpdateState): string | null {
  switch (state.step) {
    case "found":
      return (
        "Updating downloads it, then saves your work and closes bookbookbook for a moment while it installs. " +
        "Your books and settings stay as they are."
      )
    case "downloading":
      return "You can close this and carry on: bookbookbook asks before it installs."
    case "ready":
      return (
        "Installing saves your work and closes bookbookbook for a moment. " +
        "Your books and settings stay as they are."
      )
    default:
      return null
  }
}

/** The dialog's one button, so focus stays on it as the steps go by. */
export function actionOf(state: UpdateState): UpdateAction {
  switch (state.step) {
    case "idle":
    case "checking":
      return { label: "Checking…", does: null, primary: false }
    case "latest":
      return { label: "Check again", does: "check", primary: false }
    case "found":
      return { label: "Update now", does: "install", primary: true }
    case "downloading":
      return { label: "Downloading…", does: null, primary: true }
    case "ready":
      return { label: "Install now", does: "install", primary: true }
    case "installing":
      return { label: "Installing…", does: null, primary: true }
    case "failed":
      return { label: "Try again", does: state.during === "check" ? "check" : "install", primary: false }
  }
}
