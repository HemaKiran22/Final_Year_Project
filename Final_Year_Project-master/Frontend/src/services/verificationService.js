import {
  collection,
  getDocs,
  query,
  runTransaction,
  where,
  doc,
  getDoc,
} from 'firebase/firestore';

export function normalizeBlock(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeFlat(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeInviteCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function consumeInviteCode(db, inviteCode, usageMeta = {}) {
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) {
    return { ok: false, reason: 'missing-code', message: 'Invite code is required.' };
  }
  if (!db) {
    return { ok: false, reason: 'missing-db', message: 'Database not initialized. Please refresh and try again.' };
  }

  try {
    const inviteCodesRef = collection(db, 'inviteCodes');
    const q = query(inviteCodesRef, where('codeNormalized', '==', normalized));
    const snap = await getDocs(q);
    if (snap.empty) {
      return { ok: false, reason: 'invalid-code', message: 'Invite code is invalid.' };
    }

    const inviteDoc = snap.docs[0];
    if (!inviteDoc?.id) {
      return { ok: false, reason: 'invite-malformed', message: 'Invite code record is invalid. Please ask admin to recreate it.' };
    }
    const inviteRef = doc(db, 'inviteCodes', inviteDoc.id);

    return await runTransaction(db, async (tx) => {
      const docSnap = await tx.get(inviteRef);
      if (!docSnap.exists()) {
        return { ok: false, reason: 'invalid-code', message: 'Invite code is invalid.' };
      }

      const data = docSnap.data() || {};
      if (data.active === false) {
        return { ok: false, reason: 'inactive-code', message: 'Invite code is inactive.' };
      }

      const expiresAtMs = toMillis(data.expiresAt);
      if (expiresAtMs && expiresAtMs < Date.now()) {
        return { ok: false, reason: 'expired-code', message: 'Invite code has expired.' };
      }

      const usedCount = Number(data.usedCount || 0);
      const maxUses = Number(data.maxUses || 1);
      if (usedCount >= maxUses) {
        return { ok: false, reason: 'code-exhausted', message: 'Invite code usage limit reached.' };
      }

      tx.update(inviteRef, {
        usedCount: usedCount + 1,
        lastUsedAt: new Date(),
        lastUsedBy: usageMeta.userId || null,
        lastUsedPhoneLast4: usageMeta.phoneLast4 || null,
      });

      return { ok: true, invite: { id: inviteDoc.id, ...data, usedCount: usedCount + 1 } };
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'transaction-failed',
      message: error?.message || 'Failed to verify invite code.',
    };
  }
}

export function getRegistryMatchStatus(pendingUser, registryEntries = []) {
  const block = normalizeBlock(pendingUser.block || pendingUser.housingBlock || '');
  const flat = normalizeFlat(pendingUser.flatNumber || '');
  const phone = normalizePhone(pendingUser.phoneNumber || '');

  let partial = null;
  for (const r of registryEntries) {
    const rb = normalizeBlock(r.block || r.housingBlock || '');
    const rf = normalizeFlat(r.flatNumber || '');
    const rp = normalizePhone(r.phoneNumber || r.registeredPhone || '');

    const blockFlatMatch = block && flat && rb === block && rf === flat;
    const phoneMatch = phone && rp && phone === rp;

    if (blockFlatMatch && phoneMatch) {
      return { status: 'strong', registryEntry: r };
    }
    if (blockFlatMatch || phoneMatch) {
      partial = { status: 'partial', registryEntry: r };
    }
  }

  return partial || { status: 'no-match', registryEntry: null };
}

export async function loadResidentRegistry(db) {
  const ref = collection(db, 'residentRegistry');
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCurrentUserRole(db, uid) {
  if (!uid) return { role: null, isAdmin: false };
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { role: null, isAdmin: false };
  const data = snap.data() || {};
  const role = data.role || null;
  return { role, isAdmin: role === 'admin' || data.isAdmin === true, userDoc: data };
}
