/** Linha chave/valor para tabelas de diagnóstico. */
export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="mono" scope="row">
        {label}
      </th>
      <td>{value}</td>
    </tr>
  );
}
