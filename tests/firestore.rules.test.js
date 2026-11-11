/* ─────────────────────────────────────────────────────────────
   Security-rule tests for docs/firestore.rules.

   These run against the Firestore emulator, which enforces the real
   rules file — not a mock of it. Each `assertFails` here is a case
   where the app would be wrong if the rules were relaxed, so the
   test is the thing keeping the README's claim honest:
   "authorization lives in security rules, not the client."

   Run with:  npm run test:rules
   ───────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, deleteDoc,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(resolve(here, '../docs/firestore.rules'), 'utf8');

/* Must match the hardcoded address in isFounder(). If someone changes
   the founder account in the rules without changing it here, the
   founder tests fail loudly rather than silently testing nothing. */
const FOUNDER_EMAIL = 'amandammonroe101@gmail.com';

let testEnv;

/* Every authenticated context gets an email claim. isFounder() reads
   request.auth.token.email, and a missing claim makes that expression
   error rather than evaluate false — which still denies, but for the
   wrong reason, and would mask a real regression. */
const as = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();
const alice = () => as('alice', 'alice@example.com');
const bob = () => as('bob', 'bob@example.com');
const founder = () => as('founder', FOUNDER_EMAIL);
const anon = () => testEnv.unauthenticatedContext().firestore();

/** Seed data past the rules, so a test about reading isn't also a
 *  test about writing. */
const seed = (fn) => testEnv.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-ministry-hub',
    firestore: { rules: RULES },
  });
});

afterAll(() => testEnv?.cleanup());
beforeEach(() => testEnv.clearFirestore());

describe('/users/{uid} — profiles are member-readable, owner-writable', () => {
  beforeEach(() => seed(db => setDoc(doc(db, 'users/bob'), {
    uid: 'bob', displayName: 'Bob', identifyingKey: 'ABCD-EFGH',
  })));

  test('a signed-in member can read another profile', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/bob')));
  });

  test('a signed-out visitor cannot read any profile', async () => {
    await assertFails(getDoc(doc(anon(), 'users/bob')));
  });

  test('the owner can write their own profile', async () => {
    await assertSucceeds(updateDoc(doc(bob(), 'users/bob'), { displayName: 'Bobby' }));
  });

  test('a member cannot write someone else\'s profile', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/bob'), { displayName: 'Hacked' }));
  });
});

/* The invariant behind contactFields() in client/src/lib/userProfile.js.
   Because the whole profile doc is member-readable, hiding a field can
   only mean *not storing it*. A client that skips the delete must be
   rejected here, or "hidden" means nothing. */
describe('/users/{uid} — a hidden contact field must be absent, not just unrendered', () => {
  beforeEach(() => seed(db => setDoc(doc(db, 'users/bob'), { uid: 'bob', displayName: 'Bob' })));

  test('rejects a write hiding the email while the email is still present', async () => {
    await assertFails(updateDoc(doc(bob(), 'users/bob'), {
      emailVisible: false,
      email: 'bob@example.com',
    }));
  });

  test('rejects a write hiding the phone while the phone is still present', async () => {
    await assertFails(updateDoc(doc(bob(), 'users/bob'), {
      phoneVisible: false,
      phone: '555-0100',
    }));
  });

  test('rejects hiding the email when an older stored email is left behind', async () => {
    await seed(db => setDoc(doc(db, 'users/bob'), { email: 'bob@example.com' }, { merge: true }));
    // Only the flag is sent — but the merged document still carries the
    // email, and request.resource.data is the post-write state.
    await assertFails(updateDoc(doc(bob(), 'users/bob'), { emailVisible: false }));
  });

  test('allows hiding the email when it is deleted in the same write', async () => {
    await seed(db => setDoc(doc(db, 'users/bob'), { email: 'bob@example.com' }, { merge: true }));
    const { deleteField } = await import('firebase/firestore');
    await assertSucceeds(updateDoc(doc(bob(), 'users/bob'), {
      emailVisible: false,
      email: deleteField(),
    }));
  });

  test('allows a visible email to be stored', async () => {
    await assertSucceeds(updateDoc(doc(bob(), 'users/bob'), {
      emailVisible: true,
      email: 'bob@example.com',
    }));
  });

  test('treats a profile with no visibility flags as visible', async () => {
    await assertSucceeds(updateDoc(doc(bob(), 'users/bob'), { email: 'bob@example.com' }));
  });
});

/* The support inbox must not become an unsolicited channel to the
   owner. The founder can always reply; the sender cannot post back
   until the founder accepts. */
describe('/founderRequests — two-way access is the founder\'s to grant', () => {
  const REQ = 'founderRequests/req1';

  beforeEach(() => seed(db => setDoc(doc(db, REQ), {
    senderUid: 'alice', senderName: 'Alice', type: 'bug', status: 'new',
  })));

  test('anyone signed in can file a request as themselves', async () => {
    await assertSucceeds(addDoc(collection(alice(), 'founderRequests'), {
      senderUid: 'alice', type: 'feature', status: 'new',
    }));
  });

  test('a request cannot be filed on someone else\'s behalf', async () => {
    await assertFails(addDoc(collection(alice(), 'founderRequests'), {
      senderUid: 'bob', type: 'feature', status: 'new',
    }));
  });

  test('a new request cannot start already triaged', async () => {
    await assertFails(addDoc(collection(alice(), 'founderRequests'), {
      senderUid: 'alice', type: 'feature', status: 'done',
    }));
  });

  test('an unrelated member cannot read the request', async () => {
    await assertFails(getDoc(doc(bob(), REQ)));
  });

  test('the sender can ask for two-way access', async () => {
    await assertSucceeds(updateDoc(doc(alice(), REQ), {
      twoWayStatus: 'requested', twoWayNote: 'happy to explain',
    }));
  });

  test('the sender cannot grant themselves two-way access', async () => {
    await assertFails(updateDoc(doc(alice(), REQ), { twoWayStatus: 'accepted' }));
  });

  test('the sender cannot triage their own request', async () => {
    await assertFails(updateDoc(doc(alice(), REQ), { status: 'done' }));
  });

  test('the founder can accept two-way access', async () => {
    await assertSucceeds(updateDoc(doc(founder(), REQ), { twoWayStatus: 'accepted' }));
  });

  describe('the per-request thread', () => {
    const MSGS = `${REQ}/messages`;

    test('the founder can post without any permission', async () => {
      await assertSucceeds(addDoc(collection(founder(), MSGS), {
        senderUid: 'founder', senderRole: 'founder', text: 'Looking into it.',
      }));
    });

    test('the sender cannot post before access is granted', async () => {
      await assertFails(addDoc(collection(alice(), MSGS), {
        senderUid: 'alice', senderRole: 'user', text: 'Hello?',
      }));
    });

    test('the sender cannot post by claiming to be the founder', async () => {
      await assertFails(addDoc(collection(alice(), MSGS), {
        senderUid: 'alice', senderRole: 'founder', text: 'Hello?',
      }));
    });

    test('the sender can post once the founder has accepted', async () => {
      await seed(db => setDoc(doc(db, REQ), { twoWayStatus: 'accepted' }, { merge: true }));
      await assertSucceeds(addDoc(collection(alice(), MSGS), {
        senderUid: 'alice', senderRole: 'user', text: 'Thanks!',
      }));
    });

    test('an unrelated member cannot post even after access is granted', async () => {
      await seed(db => setDoc(doc(db, REQ), { twoWayStatus: 'accepted' }, { merge: true }));
      await assertFails(addDoc(collection(bob(), MSGS), {
        senderUid: 'bob', senderRole: 'user', text: 'Me too',
      }));
    });
  });
});

/* The founder gets read-only visibility for the dashboard. "Read-only"
   is the part worth testing — a write here would be a privilege
   escalation over every user's private data. */
describe('/users/{uid}/kv — private store, founder reads but never writes', () => {
  beforeEach(() => seed(db => setDoc(doc(db, 'users/bob/kv/journal'), { entries: 3 })));

  test('the owner can read and write their own kv', async () => {
    await assertSucceeds(getDoc(doc(bob(), 'users/bob/kv/journal')));
    await assertSucceeds(setDoc(doc(bob(), 'users/bob/kv/journal'), { entries: 4 }));
  });

  test('another member can do neither', async () => {
    await assertFails(getDoc(doc(alice(), 'users/bob/kv/journal')));
    await assertFails(setDoc(doc(alice(), 'users/bob/kv/journal'), { entries: 0 }));
  });

  test('the founder can read for the dashboard', async () => {
    await assertSucceeds(getDoc(doc(founder(), 'users/bob/kv/journal')));
  });

  test('the founder cannot write to a user\'s private data', async () => {
    await assertFails(setDoc(doc(founder(), 'users/bob/kv/journal'), { entries: 999 }));
    await assertFails(deleteDoc(doc(founder(), 'users/bob/kv/journal')));
  });
});
