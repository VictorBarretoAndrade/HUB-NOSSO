/** Campos de formulário do cadastro do sujeito: valor ausente é sempre `undefined`. */

interface NumberFieldProps {
  id: string;
  label: string;
  max: number;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function NumberField({ id, label, max, onChange, value }: NumberFieldProps) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        max={max}
        min={0}
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(parseOptionalNumber(event.target.value))}
      />
    </>
  );
}

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}

export function SelectField<T extends string>({ id, label, onChange, options, value }: SelectFieldProps<T>) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(options.find((option) => option.value === event.target.value)?.value)}
      >
        <option value="">Não informado</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
