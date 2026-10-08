/** Linha de tabela que explica por que não há dados e o que fazer a respeito. */
export function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return (
    <tr>
      <td colSpan={columns} className="empty-row">
        {text}
      </td>
    </tr>
  );
}
