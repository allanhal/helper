import { useCallback } from 'react'
import { useI18n } from '../i18n'

/**
 * Hook for standardized confirmation dialogs.
 * Uses native confirm() - could be enhanced with custom modal.
 */
export function useConfirm() {
  const { s } = useI18n()
  const confirm = useCallback((message: string): boolean => {
    return window.confirm(message)
  }, [])

  const confirmDelete = useCallback((item?: string): boolean => {
    const msg = item ? s.msg_confirm_delete_named(item) : s.msg_confirm_delete_item
    return window.confirm(msg)
  }, [s])

  return { confirm, confirmDelete }
}
