// good/connection-invalidation.tsx — D8-connection clean: connection 書換えは同一 file 内で
// invalidation を伴う、または読み取り専用で書込みが無い
// (data-access-protocol.md #connection-invalidation / registry ddp-connection-invalidation, safety: data_loss)

// 1) 書込みはするが、onSettled で明示的に invalidateQueries を宣言 (SoT を別管理)
export function useArchiveIssue(qc: QueryClient, listKey: unknown[]) {
  return useMutation({
    mutationFn: archiveIssue,
    onMutate: async (issueId: string) => {
      qc.setQueryData(listKey, (old: IssueConnection) => ({
        edges: old.edges.filter((e) => e.node.id !== issueId),
        pageInfo: old.pageInfo,
      }))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey }), // connection SoT を再検証
  })
}

// 2) 読み取り専用: connection を構築するが cache write ではない (Server Component の projection) → 対象外
export async function getIssueList(orgId: string): Promise<IssueConnection> {
  const { edges, pageInfo } = await db.issue.paginate({ orgId })
  return { edges, pageInfo }
}
