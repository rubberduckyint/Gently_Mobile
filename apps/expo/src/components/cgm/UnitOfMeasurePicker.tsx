import type { SelectionOption } from "~/components/ui/SelectionGroup";
import { SelectionGroup } from "~/components/ui/SelectionGroup";
import type { GlucoseUnit } from "~/utils/glucose-units";

interface Props {
  value: GlucoseUnit;
  onChange: (next: GlucoseUnit) => void;
}

const UNIT_OPTIONS: SelectionOption<GlucoseUnit>[] = [
  { value: "mg_dl", label: "mg/dL" },
  { value: "mmol_l", label: "mmol/L" },
];

export function UnitOfMeasurePicker({ value, onChange }: Props) {
  return (
    <SelectionGroup<GlucoseUnit>
      options={UNIT_OPTIONS}
      value={value}
      onChange={(next) => onChange(next as GlucoseUnit)}
      orientation="horizontal"
    />
  );
}
