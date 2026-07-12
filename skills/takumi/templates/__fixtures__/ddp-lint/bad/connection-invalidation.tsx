// bad/connection-invalidation.tsx — D8-connection 違反: connection を直接書換える cache 更新なのに
// invalidation が file 内に皆無 (data-access-protocol.md #connection-invalidation /
// registry ddp-connection-invalidation, safety: data_loss)

export function useArchiveIssue(qc: QueryClient, listKey: unknown[]) {
  return useMutation({
    mutationFn: archiveIssue,
    onMutate: async (issueId: string) => {
      qc.setQueryData(listKey, (old: IssueConnection) => ({
        edges: old.edges.filter((e) => e.node.id !== issueId), // membership 変化を手書き
        pageInfo: old.pageInfo, // stale なまま (件数/cursor がずれる)
      }))
    },
    // ← invalidateQueries/revalidateTag/onSettled/refetch がこの file のどこにも無い
  })
}
