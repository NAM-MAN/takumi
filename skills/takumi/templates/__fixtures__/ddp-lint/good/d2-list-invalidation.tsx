// good/d2-list-invalidation.tsx — D2 clean: list-affecting mutation は同一 file 内で invalidation/更新される
// (data-access-protocol.md DA-0 #3 / registry ddp-d2-list-invalidation, safety: data_loss)

// 1) Server Action: insert mutation が entity tag + list tag の両方を revalidate
export async function createIssue(orgId: string, title: string) {
  "use server"
  const issue = await db.issue.create({ orgId, title })
  revalidateTag(`issue:${issue.id}`)
  revalidateTag(`issues:${orgId}`) // list membership が変わったので list tag も invalidate
  return issue
}

// 2) rename は list membership/順序/件数を変えない → D2 の対象外 (関数名が LIST_VERBS に非該当)
export async function renameIssue(id: string, title: string) {
  "use server"
  await db.issue.update(id, { title })
  revalidateTag(`issue:${id}`)
}

// 3) TanStack Query: mutationFn (書込み) と invalidate (onSettled) が別関数に分かれる一般形。
//    file 全体には invalidateQueries があるので D2 は満たされる (R3 は file 単位で判定)。
async function removeComment(issueId: string, commentId: string) {
  await fetch(`/api/issues/${issueId}/comments/${commentId}`, { method: "DELETE" })
}

export function useRemoveComment(qc: QueryClient, issueId: string) {
  return useMutation({
    mutationFn: (commentId: string) => removeComment(issueId, commentId),
    onSettled: () => qc.invalidateQueries({ queryKey: ["issue", issueId, "comments"] }),
  })
}
