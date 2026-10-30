/**
 * POST /api/client-me { action: 'progress-weight-*' | 'progress-measure-*' }
 * Клиент пишет только свои строки source=client; клубные не трогает.
 */
import { randomUUID } from 'node:crypto'
import { sendJson } from '../adminSupabase.js'
import { clubOpsAsOfIso } from '../adminData/loyaltyAccountQuery.js'
import {
  PROGRESS_SELF_SOURCE,
  measureValuesToRow,
  parseSelfMeasureValues,
  parseSelfProgressDate,
  parseSelfWeightKg,
  progressDayHasClubMeasure,
  progressDayHasClubWeight,
} from '../../../src/lib/client/clientProgressSelfCore.js'
import { loadClientProgressSlice } from './clientMeQuery.js'

const WEIGHT_SELECT = 'id, client_id, date, weight_kg, source'
const MEASURE_SELECT = '*'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isMissingColumn(e) {
  return /source|42703|PGRST204/i.test(String(e?.message ?? e?.code ?? ''))
}

function missingSelfSchema(res) {
  sendJson(res, 503, { error: 'Запись веса ещё не подключена — обновите клуб' })
}

async function respondProgress(db, clientId, res, extra = {}) {
  const slice = await loadClientProgressSlice(db, clientId)
  sendJson(res, 200, { ok: true, ...extra, ...slice })
}

async function loadOwnClientWeight(db, clientId, id) {
  const found = await rows(
    db.from('client_weight_entries').select(WEIGHT_SELECT).eq('id', id).eq('client_id', clientId).limit(1),
  )
  return found[0] ?? null
}

async function loadOwnMeasure(db, clientId, id) {
  const found = await rows(db.from('body_measurements').select(MEASURE_SELECT).eq('id', id).eq('client_id', clientId).limit(1))
  return found[0] ?? null
}

async function upsertWeight(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const dateParsed = parseSelfProgressDate(body?.date, today)
  if (!dateParsed.ok) {
    sendJson(res, 400, { error: dateParsed.error })
    return
  }
  const kgParsed = parseSelfWeightKg(body?.kg)
  if (!kgParsed.ok) {
    sendJson(res, 400, { error: kgParsed.error })
    return
  }
  const id = String(body?.id ?? '').trim()
  try {
    const slice = await loadClientProgressSlice(db, ctx.clientId)
    const editingOwnOnSameDay =
      id &&
      (slice.progress.weights ?? []).some(
        (w) => w.id === id && w.source === PROGRESS_SELF_SOURCE && w.date === dateParsed.date,
      )
    if (!editingOwnOnSameDay && progressDayHasClubWeight(slice.progress.weights, dateParsed.date)) {
      sendJson(res, 409, { error: 'В этот день уже есть вес от клуба — его нельзя заменить' })
      return
    }
    const sameDay = await rows(
      db
        .from('client_weight_entries')
        .select(WEIGHT_SELECT)
        .eq('client_id', ctx.clientId)
        .eq('source', PROGRESS_SELF_SOURCE)
        .eq('date', dateParsed.date)
        .limit(1),
    )
    if (id) {
      const row = await loadOwnClientWeight(db, ctx.clientId, id)
      if (!row) {
        sendJson(res, 404, { error: 'Запись не найдена' })
        return
      }
      if (String(row.source) !== PROGRESS_SELF_SOURCE) {
        sendJson(res, 403, { error: 'Эту точку внёс клуб — менять нельзя' })
        return
      }
      /* Смена даты на день, где уже есть своя ○ → слить в ту запись, старую удалить. */
      if (sameDay[0] && String(sameDay[0].id) !== id) {
        await rows(
          db
            .from('client_weight_entries')
            .update({ weight_kg: kgParsed.kg, training_id: null })
            .eq('id', sameDay[0].id)
            .eq('client_id', ctx.clientId)
            .eq('source', PROGRESS_SELF_SOURCE)
            .select(WEIGHT_SELECT),
        )
        await rows(
          db.from('client_weight_entries').delete().eq('id', id).eq('client_id', ctx.clientId).eq('source', PROGRESS_SELF_SOURCE),
        )
        await respondProgress(db, ctx.clientId, res, { id: sameDay[0].id })
        return
      }
      await rows(
        db
          .from('client_weight_entries')
          .update({ date: dateParsed.date, weight_kg: kgParsed.kg, source: PROGRESS_SELF_SOURCE, training_id: null })
          .eq('id', id)
          .eq('client_id', ctx.clientId)
          .eq('source', PROGRESS_SELF_SOURCE)
          .select(WEIGHT_SELECT),
      )
      await respondProgress(db, ctx.clientId, res, { id })
      return
    }
    if (sameDay[0]) {
      await rows(
        db
          .from('client_weight_entries')
          .update({ weight_kg: kgParsed.kg, training_id: null })
          .eq('id', sameDay[0].id)
          .eq('client_id', ctx.clientId)
          .eq('source', PROGRESS_SELF_SOURCE)
          .select(WEIGHT_SELECT),
      )
      await respondProgress(db, ctx.clientId, res, { id: sameDay[0].id })
      return
    }
    const newId = randomUUID()
    await rows(
      db.from('client_weight_entries').insert({
        id: newId,
        client_id: ctx.clientId,
        date: dateParsed.date,
        weight_kg: kgParsed.kg,
        source: PROGRESS_SELF_SOURCE,
        training_id: null,
        note: null,
      }).select(WEIGHT_SELECT),
    )
    await respondProgress(db, ctx.clientId, res, { id: newId })
  } catch (e) {
    if (isMissingColumn(e)) {
      missingSelfSchema(res)
      return
    }
    throw e
  }
}

async function deleteWeight(db, ctx, body, res) {
  const id = String(body?.id ?? '').trim()
  if (!id) {
    sendJson(res, 400, { error: 'Нет id записи' })
    return
  }
  try {
    const row = await loadOwnClientWeight(db, ctx.clientId, id)
    if (!row) {
      sendJson(res, 404, { error: 'Запись не найдена' })
      return
    }
    if (String(row.source) !== PROGRESS_SELF_SOURCE) {
      sendJson(res, 403, { error: 'Эту точку внёс клуб — удалять нельзя' })
      return
    }
    await rows(
      db.from('client_weight_entries').delete().eq('id', id).eq('client_id', ctx.clientId).eq('source', PROGRESS_SELF_SOURCE),
    )
    await respondProgress(db, ctx.clientId, res)
  } catch (e) {
    if (isMissingColumn(e)) {
      missingSelfSchema(res)
      return
    }
    throw e
  }
}

async function upsertMeasure(db, ctx, body, res) {
  const today = clubOpsAsOfIso()
  const dateParsed = parseSelfProgressDate(body?.date, today)
  if (!dateParsed.ok) {
    sendJson(res, 400, { error: dateParsed.error })
    return
  }
  const valuesParsed = parseSelfMeasureValues(body?.values)
  if (!valuesParsed.ok) {
    sendJson(res, 400, { error: valuesParsed.error })
    return
  }
  const id = String(body?.id ?? '').trim()
  try {
    const slice = await loadClientProgressSlice(db, ctx.clientId)
    const editingOwnOnSameDay =
      id &&
      (slice.progress.measurements ?? []).some(
        (m) => m.id === id && m.source === PROGRESS_SELF_SOURCE && m.date === dateParsed.date,
      )
    if (!editingOwnOnSameDay && progressDayHasClubMeasure(slice.progress.measurements, dateParsed.date)) {
      sendJson(res, 409, { error: 'В этот день уже есть обмеры от клуба — их нельзя заменить' })
      return
    }
    const sameDay = await rows(
      db
        .from('body_measurements')
        .select(MEASURE_SELECT)
        .eq('client_id', ctx.clientId)
        .eq('source', PROGRESS_SELF_SOURCE)
        .eq('date', dateParsed.date)
        .limit(1),
    )
    if (id) {
      const row = await loadOwnMeasure(db, ctx.clientId, id)
      if (!row) {
        sendJson(res, 404, { error: 'Замер не найден' })
        return
      }
      if (String(row.source ?? '') !== PROGRESS_SELF_SOURCE) {
        sendJson(res, 403, { error: 'Этот замер внёс клуб — менять нельзя' })
        return
      }
      const cols = measureValuesToRow(valuesParsed.values)
      if (sameDay[0] && String(sameDay[0].id) !== id) {
        await rows(
          db
            .from('body_measurements')
            .update({ ...cols, source: PROGRESS_SELF_SOURCE })
            .eq('id', sameDay[0].id)
            .eq('client_id', ctx.clientId)
            .eq('source', PROGRESS_SELF_SOURCE)
            .select(MEASURE_SELECT),
        )
        await rows(db.from('body_measurements').delete().eq('id', id).eq('client_id', ctx.clientId).eq('source', PROGRESS_SELF_SOURCE))
        await respondProgress(db, ctx.clientId, res, { id: sameDay[0].id })
        return
      }
      await rows(
        db
          .from('body_measurements')
          .update({ date: dateParsed.date, source: PROGRESS_SELF_SOURCE, ...cols })
          .eq('id', id)
          .eq('client_id', ctx.clientId)
          .eq('source', PROGRESS_SELF_SOURCE)
          .select(MEASURE_SELECT),
      )
      await respondProgress(db, ctx.clientId, res, { id })
      return
    }
    if (sameDay[0]) {
      const cols = measureValuesToRow(valuesParsed.values)
      await rows(
        db
          .from('body_measurements')
          .update({ ...cols, source: PROGRESS_SELF_SOURCE })
          .eq('id', sameDay[0].id)
          .eq('client_id', ctx.clientId)
          .eq('source', PROGRESS_SELF_SOURCE)
          .select(MEASURE_SELECT),
      )
      await respondProgress(db, ctx.clientId, res, { id: sameDay[0].id })
      return
    }
    const cols = measureValuesToRow(valuesParsed.values, { fillMissingNull: true })
    const newId = randomUUID()
    await rows(
      db
        .from('body_measurements')
        .insert({
          id: newId,
          client_id: ctx.clientId,
          date: dateParsed.date,
          source: PROGRESS_SELF_SOURCE,
          ...cols,
        })
        .select(MEASURE_SELECT),
    )
    await respondProgress(db, ctx.clientId, res, { id: newId })
  } catch (e) {
    if (isMissingColumn(e)) {
      missingSelfSchema(res)
      return
    }
    throw e
  }
}

async function deleteMeasure(db, ctx, body, res) {
  const id = String(body?.id ?? '').trim()
  if (!id) {
    sendJson(res, 400, { error: 'Нет id замера' })
    return
  }
  try {
    const row = await loadOwnMeasure(db, ctx.clientId, id)
    if (!row) {
      sendJson(res, 404, { error: 'Замер не найден' })
      return
    }
    if (String(row.source ?? '') !== PROGRESS_SELF_SOURCE) {
      sendJson(res, 403, { error: 'Этот замер внёс клуб — удалять нельзя' })
      return
    }
    await rows(db.from('body_measurements').delete().eq('id', id).eq('client_id', ctx.clientId).eq('source', PROGRESS_SELF_SOURCE))
    await respondProgress(db, ctx.clientId, res)
  } catch (e) {
    if (isMissingColumn(e)) {
      missingSelfSchema(res)
      return
    }
    throw e
  }
}

export function isProgressSelfAction(action) {
  return String(action ?? '').startsWith('progress-')
}

export async function handleClientProgressSelfPost(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  if (action === 'progress-weight-upsert') {
    await upsertWeight(db, ctx, body, res)
    return
  }
  if (action === 'progress-weight-delete') {
    await deleteWeight(db, ctx, body, res)
    return
  }
  if (action === 'progress-measure-upsert') {
    await upsertMeasure(db, ctx, body, res)
    return
  }
  if (action === 'progress-measure-delete') {
    await deleteMeasure(db, ctx, body, res)
    return
  }
  sendJson(res, 400, { error: 'Неизвестное действие' })
}
