/**
 * node scripts/verify-desk-client-form-merge.mjs
 * Критичные сценарии формы карточки: dirty hydrate, ack после Save.
 */
import {
  ackSavedDeskField,
  mergeDeskClientFormField,
} from '../src/lib/admin/deskClientFormMergeCore.js'
import { mergeDeskClientBirthForm } from '../src/lib/admin/deskClientBirthFormCore.js'
import { shouldCloudHydrateAfterCriticalSave } from '../src/lib/syncFlushResult.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(
  mergeDeskClientFormField({
    fromClient: '79001234567',
    prev: '',
    switched: true,
    dirty: true,
  }) === '79001234567',
  'switch takes client phone',
)

ok(
  mergeDeskClientFormField({
    fromClient: '79001234567',
    prev: '',
    switched: false,
    dirty: true,
  }) === '',
  'dirty clear phone kept against hydrate',
)

ok(
  mergeDeskClientFormField({
    fromClient: '5838',
    prev: '9999',
    switched: false,
    dirty: true,
  }) === '9999',
  'dirty card edit kept',
)

ok(
  mergeDeskClientFormField({
    fromClient: '5838',
    prev: '9999',
    switched: false,
    dirty: false,
  }) === '5838',
  'clean takes client card',
)

ok(
  mergeDeskClientBirthForm({
    fromClientBirth: '1989-03-12',
    prevBirth: '',
    switched: false,
    birthDirty: true,
  }) === '',
  'birth wrapper still clears dirty',
)

ok(ackSavedDeskField({ saved: undefined, fromClient: 'a' }) === false, 'ack: no saved yet')
ok(ackSavedDeskField({ saved: '7900', fromClient: '5838' }) === false, 'ack: hydrate stale keeps dirty')
ok(ackSavedDeskField({ saved: '7900', fromClient: '7900' }) === true, 'ack: hydrate caught up')
ok(ackSavedDeskField({ saved: '', fromClient: '' }) === true, 'ack: cleared phone synced')

ok(shouldCloudHydrateAfterCriticalSave({ ok: true }, null) === true, 'hydrate after ok flush')
ok(
  shouldCloudHydrateAfterCriticalSave({ ok: true }, 'warn') === false,
  'no hydrate when warn',
)
ok(
  shouldCloudHydrateAfterCriticalSave({ ok: false }, null) === false,
  'no hydrate when flush failed',
)
ok(
  shouldCloudHydrateAfterCriticalSave({ ok: false, reason: 'offline_or_stub' }, 'offline') === false,
  'no hydrate offline',
)

if (failed) process.exit(1)
console.log('verify-desk-client-form-merge: all ok')
