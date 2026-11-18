/** Pause when the page is hidden; returning to it never resumes playback. */
export function pauseOnHidden(
  page: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
  pause: () => void,
): () => void {
  const onVisibilityChange = () => {
    if (page.hidden) pause()
  }
  page.addEventListener("visibilitychange", onVisibilityChange)
  onVisibilityChange()
  return () => page.removeEventListener("visibilitychange", onVisibilityChange)
}
