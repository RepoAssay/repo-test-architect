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
