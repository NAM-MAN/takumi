// bad/d2-list-invalidation.tsx — D2 違反: list-affecting mutation に invalidation/更新が file 内に皆無
// (data-access-protocol.md DA-0 #3 / registry ddp-d2-list-invalidation, safety: data_loss)

export async function createIssue(orgId: string, title: string) {
  "use server"
  const issue = await db.issue.create({ orgId, title }) // insert = list membership が増える
  return issue
  // ← revalidateTag/revalidatePath/invalidateQueries/setQueryData がこの file のどこにも無い
}
