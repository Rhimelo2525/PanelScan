/**
 * True when a dialog/sheet "outside" interaction actually landed on a toast.
 * Pass the event to `preventDefault()` then, so closing a toast never
 * closes the form behind it.
 */
export function isToastInteraction(event: { target: EventTarget | null; detail?: { originalEvent?: Event } }): boolean {
  const target = event.detail?.originalEvent?.target ?? event.target
  return target instanceof Element && target.closest("[data-sonner-toaster]") !== null
}
