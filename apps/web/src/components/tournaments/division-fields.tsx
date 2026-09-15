'use client';

import { useState } from 'react';
import { SKILL_BANDS } from '@vouchplay/config';
import { formatFee } from '@vouchplay/core';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import { Field, Input, Select } from '@/components/ui/field';

/**
 * Live "1st entry / 2nd+ entry" preview under the fee fields (§2BQ). Only renders once both the
 * fee and the next-entry price are valid numbers and the next-entry price is actually cheaper -
 * a half-typed or non-discounting value shows nothing rather than a misleading preview.
 */
function NextEntryPreview({
  fee,
  nextFee,
  currency,
}: {
  fee: string;
  nextFee: string;
  currency: string;
}) {
  const feeNum = Number(fee);
  const nextNum = Number(nextFee);
  const valid =
    fee.trim() !== '' &&
    nextFee.trim() !== '' &&
    Number.isFinite(feeNum) &&
    Number.isFinite(nextNum) &&
    feeNum >= 0 &&
    nextNum >= 0 &&
    nextNum < feeNum;
  if (!valid) return null;
  const cur = currency.trim() || 'PHP';
  return (
    <div className="flex gap-2">
      <div className="border-border bg-surface-muted rounded-lg border px-3 py-2 text-xs">
        <p className="text-foreground-muted">1st entry</p>
        <p className="text-foreground font-semibold tabular-nums">{formatFee(cur, feeNum)}</p>
      </div>
      <div className="border-success/30 bg-success/10 rounded-lg border px-3 py-2 text-xs">
        <p className="text-success/80">2nd+ entry</p>
        <p className="text-success font-semibold tabular-nums">{formatFee(cur, nextNum)}</p>
      </div>
    </div>
  );
}

/** The division attribute inputs (handover §18), shared by the add + edit forms. */
export function DivisionFields({ initial }: { initial?: Partial<DivisionDTO> }) {
  const [feeAmount, setFeeAmount] = useState(
    initial?.feeAmount != null ? String(initial.feeAmount) : '1000',
  );
  const [nextEntryFeeAmount, setNextEntryFeeAmount] = useState(
    initial?.nextEntryFeeAmount != null ? String(initial.nextEntryFeeAmount) : '',
  );
  const [currency, setCurrency] = useState(initial?.currency ?? 'PHP');
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
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
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
        <Field
          label="Next-entry price (per player)"
          htmlFor="nextEntryFeeAmount"
          hint="For players who already have another entry in this tournament. Leave blank for no discount."
        >
          <Input
            id="nextEntryFeeAmount"
            name="nextEntryFeeAmount"
            type="number"
            min={0}
            step="0.01"
            value={nextEntryFeeAmount}
            onChange={(e) => setNextEntryFeeAmount(e.target.value)}
            placeholder="No next-entry price"
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input
            id="currency"
            name="currency"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </Field>
      </div>
      <NextEntryPreview fee={feeAmount} nextFee={nextEntryFeeAmount} currency={currency} />
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
