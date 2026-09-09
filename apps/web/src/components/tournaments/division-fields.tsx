'use client';

import { SKILL_BANDS } from '@vouchplay/config';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import { Field, Input, Select } from '@/components/ui/field';

/** The division attribute inputs (handover §18), shared by the add + edit forms. */
export function DivisionFields({ initial }: { initial?: Partial<DivisionDTO> }) {
  return (
    <div className="space-y-3">
      <Field
        label="Name override (optional)"
        htmlFor="nameOverride"
        hint="Leave blank to auto-name from attributes."
      >
        <Input
          id="nameOverride"
          name="nameOverride"
          maxLength={120}
          defaultValue={initial?.nameOverride ?? ''}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Format" htmlFor="format" required>
          <Select id="format" name="format" defaultValue={initial?.format ?? 'doubles'}>
            <option value="doubles">Doubles</option>
            <option value="singles">Singles</option>
          </Select>
        </Field>
        <Field label="Category" htmlFor="sexClassification" required>
          <Select
            id="sexClassification"
            name="sexClassification"
            defaultValue={initial?.sexClassification ?? 'mixed'}
          >
            <option value="mixed">Mixed</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="genderless">Open (genderless)</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Skill policy" htmlFor="skillPolicy" required>
          <Select id="skillPolicy" name="skillPolicy" defaultValue={initial?.skillPolicy ?? 'open'}>
            <option value="open">Open</option>
            <option value="band">Band</option>
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <Field label="Min skill" htmlFor="minimumSkill">
          <Select
            id="minimumSkill"
            name="minimumSkill"
            defaultValue={initial?.minimumSkill != null ? String(initial.minimumSkill) : ''}
          >
            <option value="">-</option>
            {SKILL_BANDS.map((b) => (
              <option key={b.key} value={b.ordinal}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Max skill" htmlFor="maximumSkill">
          <Select
            id="maximumSkill"
            name="maximumSkill"
            defaultValue={initial?.maximumSkill != null ? String(initial.maximumSkill) : ''}
          >
            <option value="">-</option>
            {SKILL_BANDS.map((b) => (
              <option key={b.key} value={b.ordinal}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min age" htmlFor="minimumAge">
          <Input
            id="minimumAge"
            name="minimumAge"
            type="number"
            min={0}
            max={120}
            defaultValue={initial?.minimumAge ?? ''}
          />
        </Field>
        <Field label="Max age" htmlFor="maximumAge">
          <Input
            id="maximumAge"
            name="maximumAge"
            type="number"
            min={0}
            max={120}
            defaultValue={initial?.maximumAge ?? ''}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Capacity (teams)" htmlFor="capacityTeams">
          <Input
            id="capacityTeams"
            name="capacityTeams"
            type="number"
            min={0}
            defaultValue={initial?.capacityTeams ?? 0}
          />
        </Field>
        {/* Per player since migration 0026: the organizer types the number the player reads, and a
            doubles team is charged it twice. Before this, one price existed as three different
            numbers (§1V). */}
        <Field
          label="Fee per player"
          htmlFor="feeAmount"
          hint="What ONE player pays. A doubles team is charged this twice."
        >
          <Input
            id="feeAmount"
            name="feeAmount"
            type="number"
            min={0}
            step="0.01"
            // A new division defaults to a real per-player fee, not free, so an organizer does not
            // have to price every division from zero (master_plan §2J). Editing an existing one
            // keeps its saved value.
            defaultValue={initial?.feeAmount ?? 1000}
          />
        </Field>
        <Field
          label="Early bird fee per player"
          htmlFor="earlyBirdFeeAmount"
          hint="Optional. Charged while the tournament early-bird dates are open. Leave blank for no promo."
        >
          <Input
            id="earlyBirdFeeAmount"
            name="earlyBirdFeeAmount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={initial?.earlyBirdFeeAmount ?? ''}
            placeholder="No early bird price"
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input
            id="currency"
            name="currency"
            maxLength={3}
            defaultValue={initial?.currency ?? 'PHP'}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min STS (optional)" htmlFor="minimumSts">
          <Input
            id="minimumSts"
            name="minimumSts"
            type="number"
            min={0}
            max={5}
            step="0.1"
            defaultValue={initial?.minimumSts ?? ''}
          />
        </Field>
      </div>
      <p className="text-foreground-muted text-xs">
        Skill Verified and organizer approval are now set once for the whole tournament under
        Registration rules.
      </p>
      <input type="hidden" name="teamSize" value={2} />
    </div>
  );
}
