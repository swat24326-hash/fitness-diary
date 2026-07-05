import { shouldPullMembershipTypes } from '../src/lib/membershipTypesPullCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(shouldPullMembershipTypes({ localActiveCount: 0, offline: false }), 'pull when empty')
ok(!shouldPullMembershipTypes({ localActiveCount: 3, offline: false }), 'skip when cached')
ok(shouldPullMembershipTypes({ localActiveCount: 3, force: true, offline: false }), 'force pull')
ok(!shouldPullMembershipTypes({ localActiveCount: 0, offline: true }), 'offline skip')

process.exit(failed > 0 ? 1 : 0)
