import { GROOVE_COUNT_MAX, PANEL_PROFILE_OPTIONS, type Panel3dValue } from "@/admin/panel-3d"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PanelProfile } from "@/types/product"

interface Panel3dFieldProps {
  idPrefix: string
  value: Panel3dValue
  onChange: (value: Panel3dValue) => void
  disabled?: boolean
}

/**
 * How the product looks in the app's 3D preview: its shape and how many
 * grooves. Its colour is taken from the main product photo automatically.
 */
export function Panel3dField({ idPrefix, value, onChange, disabled = false }: Panel3dFieldProps) {
  const isFlat = value.profile === "FLAT"

  function setProfile(profile: PanelProfile) {
    const grooveCount = profile === "FLAT" ? "" : value.grooveCount || (profile === "SPANDREL" ? "2" : profile === "INVERTED_CIRCLE" ? "6" : "5")
    onChange({ ...value, profile, grooveCount })
  }

  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium">3D Preview</legend>
      <p className="text-xs text-muted-foreground">
        How this panel looks in the app's 3D preview after a customer measures a wall. Its colour comes from the main product photo automatically.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-profile`}>Panel shape *</Label>
          <select
            id={`${idPrefix}-profile`}
            value={value.profile}
            onChange={(event) => setProfile(event.target.value as PanelProfile)}
            disabled={disabled}
            className="mt-1.5 h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            {PANEL_PROFILE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{PANEL_PROFILE_OPTIONS.find((option) => option.value === value.profile)?.hint}</p>
        </div>

        {!isFlat && (
          <div>
            <Label htmlFor={`${idPrefix}-grooves`}>{value.profile === "SPANDREL" ? "Number of lines *" : "Number of grooves *"}</Label>
            <Input
              id={`${idPrefix}-grooves`}
              type="number"
              inputMode="numeric"
              min={1}
              max={GROOVE_COUNT_MAX}
              step={1}
              value={value.grooveCount}
              onChange={(event) => onChange({ ...value, grooveCount: event.target.value })}
              disabled={disabled}
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">{value.profile === "SPANDREL" ? "Lines along one panel" : "The 5 in “5in1”"}</p>
          </div>
        )}
      </div>
    </fieldset>
  )
}
