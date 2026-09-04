/**
 * The launchpads this server can prove a token creation on.
 *
 * The attested launchpad is part of the CLAIM, not a guess: each one emits a different creation
 * event from different contracts and proves the creator a different way, so the verifier dispatches
 * on this value rather than trying every decoder and accepting whichever one matched. Trying them
 * all would make an attacker's job "find any allowlisted contract on any launchpad that emits a
 * matching-looking event", which is not what the signature claims.
 *
 * `trench` is the DEFAULT for a request that omits the field: every row written before this field
 * existed is a Trench attestation, and every client shipped before it submits Trench. The default
 * is what makes an old client and a new server compatible, and it is deliberately the launchpad
 * with the narrowest, oldest allowlist rather than the newest.
 */
export const LAUNCHPADS = ["trench", "pools_fun", "virtuals"] as const;
export type Launchpad = (typeof LAUNCHPADS)[number];
export const DEFAULT_LAUNCHPAD: Launchpad = "trench";
