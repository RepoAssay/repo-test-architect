export function normalizeAuditForSnapshot(audit) {
  return JSON.parse(
    JSON.stringify({
      ...audit,
      profile: {
        ...audit.profile,
        root: "<fixture>"
      }
    })
  );
}

export function normalizeJsonForSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}
