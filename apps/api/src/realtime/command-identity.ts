/**
 * Server-derived identity passed to a state mutation.  This is deliberately a
 * discriminated union: callers cannot turn an official into an inspector by
 * adding a role to a Socket.IO payload.
 */
export type InspectorCommandIdentity =
  | {
      kind: 'legacy';
      sessionId: string;
      sessionTokenHash: string;
    }
  | {
      assignmentId: string;
      kind: 'official';
      officialId: string;
      officialSessionId: string;
    };

export function auditActor(identity: InspectorCommandIdentity) {
  return identity.kind === 'legacy'
    ? { sessionId: identity.sessionId }
    : { officialSessionId: identity.officialSessionId };
}
