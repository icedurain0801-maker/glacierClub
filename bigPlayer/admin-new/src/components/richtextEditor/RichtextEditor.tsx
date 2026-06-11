import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { Input } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'

export interface RichtextEditRefProps {
  getContent: () => string
  setContent: (val: string) => void
  handleInsertLink: (payload: { title?: string; href: string }) => void
}

export type RichtextValue = string | { text: string; html: string }

interface Props {
  value?: RichtextValue
  onChange?: (val: RichtextValue) => void
  placeholder?: string
}

function stripHtmlTags(input: string) {
  return input.replace(/<[^>]*>/g, '')
}

function buildLinkSnippet(title: string | undefined, href: string) {
  const normalizedHref = String(href || '').trim()
  const normalizedTitle = String(title || '').trim() || normalizedHref
  if (!normalizedHref) return normalizedTitle
  return `${normalizedTitle} (${normalizedHref})`
}

const RichtextEditor = forwardRef<RichtextEditRefProps, Props>(({ value, onChange, placeholder }, ref) => {
  const textareaRef = useRef<TextAreaRef | null>(null)

  const normalizedText = useMemo(() => {
    if (typeof value === 'string') {
      return value
    }
    if (!value) {
      return ''
    }
    if (value.text) {
      return value.text
    }
    return value.html ? stripHtmlTags(value.html) : ''
  }, [value])

  const emitChange = useCallback(
    (nextText: string) => {
      if (typeof value === 'string' || value === undefined) {
        onChange?.(nextText)
        return
      }

      onChange?.({ text: nextText, html: nextText })
    },
    [onChange, value],
  )

  const handleInsertLink = useCallback(
    (payload: { title?: string; href: string }) => {
      const snippet = buildLinkSnippet(payload.title, payload.href)
      if (!snippet) return

      const textareaEl = textareaRef.current?.resizableTextArea?.textArea
      if (!textareaEl) {
        emitChange(`${normalizedText}${normalizedText ? '\n' : ''}${snippet}`)
        return
      }

      const start = textareaEl.selectionStart ?? normalizedText.length
      const end = textareaEl.selectionEnd ?? normalizedText.length
      const nextText = `${normalizedText.slice(0, start)}${snippet}${normalizedText.slice(end)}`
      emitChange(nextText)

      const nextCursor = start + snippet.length
      requestAnimationFrame(() => {
        try {
          textareaEl.focus()
          textareaEl.setSelectionRange(nextCursor, nextCursor)
        } catch {
          // ignore selection failures in non-interactive contexts
        }
      })
    },
    [emitChange, normalizedText],
  )

  useImperativeHandle(
    ref,
    () => ({
      getContent: () => {
        if (typeof value === 'string') return value || ''
        return value?.html || value?.text || ''
      },
      setContent: (val) => {
        if (typeof value === 'string' || value === undefined) {
          onChange?.(val)
          return
        }
        onChange?.({ text: stripHtmlTags(val), html: val })
      },
      handleInsertLink,
    }),
    [handleInsertLink, onChange, value],
  )

  return (
    <Input.TextArea
      ref={textareaRef}
      value={normalizedText}
      onChange={(e) => emitChange(e.target.value)}
      placeholder={placeholder}
      rows={6}
    />
  )
})

export default RichtextEditor
