import { ipcMain } from 'electron'
import { IPC, type FeedbackSubmission, type FeedbackSubmitResult } from '@shared/types/ipc'

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xreneagj'

/** Posts feedback-form submissions to Formspree from the main process — the renderer's CSP
 *  (connect-src 'self') deliberately blocks fetching arbitrary external hosts, so this can't just
 *  be a fetch() call in the form component itself. */
export function registerFeedbackHandlers(): void {
  ipcMain.handle(
    IPC.feedback.submit,
    async (_event, input: FeedbackSubmission): Promise<FeedbackSubmitResult> => {
      try {
        const response = await fetch(FORMSPREE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            category: input.category,
            name: input.name,
            email: input.email,
            message: input.message
          })
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          const detail = body?.errors?.map((e: { message: string }) => e.message).join(', ')
          return { ok: false, error: detail || `Formspree returned ${response.status}` }
        }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
      }
    }
  )
}
