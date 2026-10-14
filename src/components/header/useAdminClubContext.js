import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminHeaderClub, readLastAdminClub, resolveAdminClubId, visibleAdminClubs, writeLastAdminClub } from '../../lib/clubContext'
import { listClubsLocal, LOCAL_DATA_CHANGED, pullClubsFromSupabase } from '../../lib/dataAccess'
import { DEMO_CLUB_ID } from '../../lib/seedDemo'

/**
 * Клуб главного админа в шапке: список клубов, клуб из адреса на /admin, последний выбранный — в мессенджере.
 * @param {{ enabled: boolean, onAdminRoute: boolean, userId?: string, supabaseReady: boolean, searchParams: URLSearchParams, setSearchParams: Function }} opts
 */
export function useAdminClubContext({ enabled, onAdminRoute, userId, supabaseReady, searchParams, setSearchParams }) {
  const [clubs, setClubs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const visible = (rows) => visibleAdminClubs(rows, { hideDemo: supabaseReady, demoClubId: DEMO_CLUB_ID })
    const load = async () => {
      setLoading(true)
      try {
        let rows = visible(await listClubsLocal())
        if (alive && rows.length) setClubs(rows)
        if (supabaseReady) {
          await pullClubsFromSupabase()
          rows = visible(await listClubsLocal())
        }
        if (alive) setClubs(rows)
      } catch {
        if (alive) setClubs([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    let debounce = null
    const onData = (e) => {
      if (e?.detail?.reason === 'club-deleted') {
        void listClubsLocal().then((rows) => {
          if (alive) setClubs(visible(rows))
        })
        return
      }
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void load()
      }, 300)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    return () => {
      alive = false
      if (debounce) clearTimeout(debounce)
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
    }
  }, [enabled, supabaseReady])

  const urlClub = searchParams.get('club')?.trim() ?? ''

  /** Один зал — сразу в URL; несколько — последний выбранный или явный выбор. */
  useEffect(() => {
    if (!enabled || !onAdminRoute || clubs.length === 0) return
    const validIds = clubs.map((c) => String(c.id))
    const nextClub =
      resolveAdminClubId({
        urlClub,
        lastClub: readLastAdminClub(userId),
        validClubIds: validIds,
        singleClubId: clubs.length === 1 ? validIds[0] : null,
      }) ?? ''
    if (nextClub === urlClub) return
    const next = new URLSearchParams(searchParams)
    if (nextClub) next.set('club', nextClub)
    else next.delete('club')
    setSearchParams(next, { replace: true })
  }, [enabled, onAdminRoute, clubs, urlClub, searchParams, setSearchParams, userId])

  useEffect(() => {
    if (enabled && onAdminRoute && userId && urlClub) writeLastAdminClub(userId, urlClub)
  }, [enabled, onAdminRoute, userId, urlClub])

  const { clubId, switchable } = useMemo(
    () => adminHeaderClub({ onAdminRoute, urlClub, lastClub: enabled ? readLastAdminClub(userId) : null, clubs }),
    [onAdminRoute, urlClub, enabled, userId, clubs],
  )
  const clubName = useMemo(() => clubs.find((c) => String(c.id) === clubId)?.name?.trim() || '', [clubs, clubId])

  const selectClub = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams)
      if (id) next.set('club', String(id))
      else next.delete('club')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  return { clubs, loading, clubId, clubName, switchable, selectClub }
}
