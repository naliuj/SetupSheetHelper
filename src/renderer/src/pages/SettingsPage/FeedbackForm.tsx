import { useState } from 'react'
import type { FeedbackCategory } from '@shared/types/ipc'

const CATEGORIES: FeedbackCategory[] = ['Feature Request', 'Bug Report', 'Other']

/** Posts to Formspree via the main process (see feedbackHandlers.ts) — the renderer's CSP blocks
 *  fetching external hosts directly, so this can't just be a fetch() call here. */
export default function FeedbackForm(): JSX.Element {
  const [category, setCategory] = useState<FeedbackCategory>('Feature Request')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canSubmit = name.trim() !== '' && email.trim() !== '' && message.trim() !== '' && status !== 'sending'

  async function handleSubmit(): Promise<void> {
    setStatus('sending')
    setErrorMessage(null)
    const result = await window.api.feedback.submit({
      category,
      name: name.trim(),
      email: email.trim(),
      message: message.trim()
    })
    if (result.ok) {
      setStatus('sent')
      setName('')
      setEmail('')
      setMessage('')
    } else {
      setStatus('error')
      setErrorMessage(result.error ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Type</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
          style={{ width: 240 }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 320 }} placeholder="Your name" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          style={{ width: 320 }}
          placeholder="you@example.com"
        />
        <p className="card-sub" style={{ marginTop: 4 }}>
          So I can reply if needed.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4 }}>Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          style={{ width: '100%', maxWidth: 500, resize: 'vertical' }}
          placeholder="Describe the bug, feature idea, or anything else..."
        />
      </div>

      <button className="btn primary" onClick={handleSubmit} disabled={!canSubmit}>
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>

      {status === 'sent' && <p className="card-sub" style={{ marginTop: 8 }}>Thanks — your message was sent.</p>}
      {status === 'error' && (
        <p className="card-sub" style={{ marginTop: 8, color: 'var(--color-danger)' }}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}
