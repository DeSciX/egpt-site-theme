// The intake contract, pinned to literals. Source: the DeSciX proposal intake contract,
// 2026-11-12. ./request owns these values for the theme; this test holds them to the platform's
// contract, so a wrong value at the source goes red here rather than passing through every derived test.
import test from 'node:test';
import assert from 'node:assert';
import { INTAKE, TEXT_LIMITS, EXTRA_MAX_KEYS, REFUSALS, PROPOSAL_KINDS, SIGNED_OUT_MESSAGE } from '../src/request.mjs';

test('the intake contract: command, kb, record type, text limits, extra keys, refusal codes and kinds are the DeSciX proposal intake contract (2026-11-12) as literals', () => {
  assert.deepEqual({ ...INTAKE }, { command: 'app_records_put', kb_id: 'proposals', type: 'proposal' });
  assert.deepEqual({ ...TEXT_LIMITS }, { min: 20, max: 5000 });
  assert.equal(EXTRA_MAX_KEYS, 6);
  assert.deepEqual(Object.keys(REFUSALS).sort(), ['PROPOSAL_ADMIN_ONLY', 'PROPOSAL_FIELD_INVALID', 'PROPOSAL_NEEDS_IDENTITY', 'RATE_LIMITED']);
  assert.deepEqual([...PROPOSAL_KINDS], ['licence', 'seat', 'one-thing', 'talk', 'other']);
});

test('the shell\'s signed-out refusal: DeSciX.call rejects with a plain Error of this message and no code (DeSciX, 2026-11-12) as a literal', () => {
  assert.equal(SIGNED_OUT_MESSAGE, 'User not authenticated.');
});
