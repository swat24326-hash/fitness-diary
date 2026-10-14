import { useCallback, useEffect, useMemo, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../lib/localDataEvents.js'
import { listHomeworkLibraryRows } from '../lib/homework/library/homeworkLibraryService.js'
import { mergeHomeworkLibrary } from '../lib/homework/library/homeworkLibraryOverridesCore.js'

/** Правки библиотеки ДЗ из кэша + итоговая библиотека (встроенная + правки). Обновляется после Sync и сохранений. */
export function useHomeworkLibrary() {
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    setRows(await listHomeworkLibraryRows())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void reload()
    const onChange = () => void reload()
    window.addEventListener(LOCAL_DATA_CHANGED, onChange)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, onChange)
  }, [reload])

  const library = useMemo(() => mergeHomeworkLibrary(rows), [rows])
  return { rows, library, loaded, reload }
}
