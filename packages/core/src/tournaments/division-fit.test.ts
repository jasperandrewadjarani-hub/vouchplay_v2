import { describe, expect, it } from 'vitest';
import {
  ageAtDate,
  classifyDivision,
  describeDivisionFit,
  evaluateDivisionFit,
} from './division-fit';
import type { DivisionFitInput, DivisionFitResult } from './division-fit';

function input(over: Partial<DivisionFitInput> = {}): DivisionFitInput {
  return {
    playerSex: 'male',
    effectiveSkill: 2,
    sexClassification: 'men',
    skillPolicy: 'band',
    divisionMinimumSkill: 2,
    divisionMaximumSkill: 2,
    enforceSkillFloor: true,
    ...over,
  };
}

describe('evaluateDivisionFit - sex classification', () => {
  it("lets a man into a men's division", () => {
    expect(evaluateDivisionFit(input()).fits).toBe(true);
  });

  it("keeps a woman out of a men's division", () => {
    expect(evaluateDivisionFit(input({ playerSex: 'female' }))).toEqual({
      fits: false,
      reason: 'sex',
      playingUp: false,
      playingDown: false,
    });
  });

  it("keeps a man out of a women's division", () => {
    const r = evaluateDivisionFit(input({ sexClassification: 'women' }));
    expect(r).toEqual({ fits: false, reason: 'sex', playingUp: false, playingDown: false });
  });

  it('lets anyone into a mixed division when no partner is being checked against', () => {
    // partnerSex omitted (undefined): composition is a PAIR rule, so a bare per-player fit check
    // still accepts anyone - deliberate, per §2AM decision 1.
    for (const playerSex of ['male', 'female', 'other', null]) {
      expect(evaluateDivisionFit(input({ sexClassification: 'mixed', playerSex })).fits).toBe(true);
    }
  });

  it('rejects a same-sex mixed pair (the bug this phase fixes)', () => {
    const r = evaluateDivisionFit(
      input({ sexClassification: 'mixed', playerSex: 'male', partnerSex: 'male' }),
    );
    expect(r).toEqual({ fits: false, reason: 'mixed_pair', playingUp: false, playingDown: false });
  });

  it('lets an opposite-sex mixed pair through', () => {
    expect(
      evaluateDivisionFit(
        input({ sexClassification: 'mixed', playerSex: 'female', partnerSex: 'male' }),
      ).fits,
    ).toBe(true);
  });

  it('asks an unknown-gender player to fill in their profile before checking a mixed pair', () => {
    const r = evaluateDivisionFit(
      input({ sexClassification: 'mixed', playerSex: null, partnerSex: 'male' }),
    );
    expect(r).toEqual({
      fits: false,
      reason: 'sex_unknown',
      playingUp: false,
      playingDown: false,
    });
  });

  it('singles ignores partnerSex - there is no partner to pair against', () => {
    expect(
      evaluateDivisionFit(
        input({
          sexClassification: 'mixed',
          playerSex: 'male',
          partnerSex: 'male',
          format: 'singles',
        }),
      ).fits,
    ).toBe(true);
  });

  it('tells a player with no recorded gender to fill it in, not that they are the wrong one', () => {
    expect(evaluateDivisionFit(input({ playerSex: null })).reason).toBe('sex_unknown');
  });

  it('still lets a player with no recorded gender into a mixed division', () => {
    expect(evaluateDivisionFit(input({ playerSex: null, sexClassification: 'mixed' })).fits).toBe(
      true,
    );
  });

  it('reports sex before skill when both are wrong', () => {
    const r = evaluateDivisionFit(input({ playerSex: 'female', effectiveSkill: 5 }));
    expect(r.reason).toBe('sex');
  });
});

describe('evaluateDivisionFit - skill: up is allowed, down is not', () => {
  it('LETS A PLAYER ENTER A HARDER DIVISION - the rule people actually wanted', () => {
    // Low Intermediate (3) entering a High Intermediate (4) division. Choosing a harder game is
    // not something to refuse, and blocking it was the bug this suite exists to prevent returning.
    // Also, by definition, this player's skill is below the division's minimum: playingUp is true.
    const r = evaluateDivisionFit(
      input({ effectiveSkill: 3, divisionMinimumSkill: 4, divisionMaximumSkill: 4 }),
    );
    expect(r).toEqual({ fits: true, reason: null, playingUp: true, playingDown: false });
  });

  it('lets a player enter a division far above their level', () => {
    expect(
      evaluateDivisionFit(
        input({ effectiveSkill: 0, divisionMinimumSkill: 5, divisionMaximumSkill: 5 }),
      ).fits,
    ).toBe(true);
  });

  it('accepts a player exactly at the division level', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: 2 })).fits).toBe(true);
  });

  it('blocks a player who is too strong for the division', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: 4 }))).toEqual({
      fits: false,
      reason: 'skill_too_high',
      playingUp: false,
      playingDown: false,
    });
  });

  it('does not block a strong player when the organizer has the setting off', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: 4, enforceSkillFloor: false })).fits).toBe(
      true,
    );
  });

  it('never blocks a player with no known skill', () => {
    expect(evaluateDivisionFit(input({ effectiveSkill: null })).fits).toBe(true);
  });

  it('never applies a skill rule to an open division', () => {
    expect(evaluateDivisionFit(input({ skillPolicy: 'open', effectiveSkill: 6 })).fits).toBe(true);
  });

  it('uses the division ceiling, so a wide band accepts everyone up to its top', () => {
    const wide = { divisionMinimumSkill: 2, divisionMaximumSkill: 4 };
    for (const effectiveSkill of [0, 1, 2, 3, 4]) {
      expect(evaluateDivisionFit(input({ ...wide, effectiveSkill })).fits).toBe(true);
    }
    expect(evaluateDivisionFit(input({ ...wide, effectiveSkill: 5 })).reason).toBe(
      'skill_too_high',
    );
  });

  it('ignores an absent ceiling rather than treating it as zero', () => {
    expect(evaluateDivisionFit(input({ divisionMaximumSkill: null, effectiveSkill: 6 })).fits).toBe(
      true,
    );
  });

  it('still reports sex before skill when both are wrong', () => {
    expect(evaluateDivisionFit(input({ playerSex: 'female', effectiveSkill: 5 })).reason).toBe(
      'sex',
    );
  });
});

describe('evaluateDivisionFit - playingUp (§2AP A/B)', () => {
  it('flags playingUp true when the player is below a banded division minimum', () => {
    const r = evaluateDivisionFit(
      input({ effectiveSkill: 1, divisionMinimumSkill: 3, divisionMaximumSkill: 3 }),
    );
    expect(r.fits).toBe(true);
    expect(r.playingUp).toBe(true);
  });

  it('never flags playingUp on an open-skill division, however low the skill', () => {
    const r = evaluateDivisionFit(
      input({
        skillPolicy: 'open',
        effectiveSkill: 0,
        divisionMinimumSkill: 5,
        divisionMaximumSkill: 5,
      }),
    );
    expect(r.playingUp).toBe(false);
  });

  it('never flags playingUp for a player with no known skill', () => {
    const r = evaluateDivisionFit(
      input({ effectiveSkill: null, divisionMinimumSkill: 5, divisionMaximumSkill: 5 }),
    );
    expect(r.playingUp).toBe(false);
  });

  it('does not flag playingUp when there is no minimum to be below', () => {
    const r = evaluateDivisionFit(input({ effectiveSkill: 0, divisionMinimumSkill: null }));
    expect(r.playingUp).toBe(false);
  });
});

describe('evaluateDivisionFit - age at the door (§2AP B)', () => {
  it('fits when the player is inside the division age range', () => {
    const r = evaluateDivisionFit(
      input({ ageAtStart: 46, divisionMinimumAge: 45, divisionMaximumAge: null }),
    );
    expect(r.fits).toBe(true);
  });

  it('refuses a player below the division minimum age', () => {
    const r = evaluateDivisionFit(
      input({ ageAtStart: 44, divisionMinimumAge: 45, divisionMaximumAge: null }),
    );
    expect(r).toEqual({ fits: false, reason: 'age', playingUp: false, playingDown: false });
  });

  it('refuses a player above the division maximum age', () => {
    const r = evaluateDivisionFit(
      input({ ageAtStart: 20, divisionMinimumAge: null, divisionMaximumAge: 17 }),
    );
    expect(r).toEqual({ fits: false, reason: 'age', playingUp: false, playingDown: false });
  });

  it('refuses an unknown birthday on an age-limited division with age_unknown', () => {
    const r = evaluateDivisionFit(
      input({ ageAtStart: null, divisionMinimumAge: 45, divisionMaximumAge: null }),
    );
    expect(r).toEqual({
      fits: false,
      reason: 'age_unknown',
      playingUp: false,
      playingDown: false,
    });
  });

  it('an unknown birthday fits fine on a division with no age limit', () => {
    const r = evaluateDivisionFit(input({ ageAtStart: null }));
    expect(r.fits).toBe(true);
  });

  it('age is only checked when the division actually has a range', () => {
    // divisionMinimumAge/divisionMaximumAge both absent: legacy callers (and unlimited divisions)
    // are completely untouched by the age rule, unknown birthday included.
    const r = evaluateDivisionFit(input({ ageAtStart: undefined }));
    expect(r.fits).toBe(true);
  });

  it('age is checked after sex - a sex failure still wins the headline', () => {
    const r = evaluateDivisionFit(
      input({
        playerSex: 'female',
        ageAtStart: 10,
        divisionMinimumAge: 45,
      }),
    );
    expect(r.reason).toBe('sex');
  });

  it('age is checked before skill - an age failure wins over a skill failure', () => {
    const r = evaluateDivisionFit(
      input({
        effectiveSkill: 5, // above the division's max of 2 - would fail skill_too_high
        ageAtStart: 10,
        divisionMinimumAge: 45,
      }),
    );
    expect(r.reason).toBe('age');
  });
});

describe('ageAtDate (§2AP B)', () => {
  it('computes whole years old as of the given date', () => {
    expect(ageAtDate('2000-01-01', '2026-01-01')).toBe(26);
  });

  it('counts the birthday itself as the new age', () => {
    expect(ageAtDate('2000-06-15', '2026-06-15')).toBe(26);
  });

  it('has not turned the new age the day before the birthday', () => {
    expect(ageAtDate('2000-06-16', '2026-06-15')).toBe(25);
  });

  it('returns null for an unparsable date of birth', () => {
    expect(ageAtDate('not-a-date', '2026-01-01')).toBeNull();
  });

  it('returns null for an unparsable "at" date', () => {
    expect(ageAtDate('2000-01-01', 'not-a-date')).toBeNull();
  });

  it('returns null when either date is missing', () => {
    expect(ageAtDate(null, '2026-01-01')).toBeNull();
    expect(ageAtDate('2000-01-01', null)).toBeNull();
    expect(ageAtDate(undefined, undefined)).toBeNull();
  });
});

describe('classifyDivision - precedence (§2AP A)', () => {
  const fits: DivisionFitResult = {
    fits: true,
    reason: null,
    playingUp: false,
    playingDown: false,
  };
  const doesNotFit: DivisionFitResult = {
    fits: false,
    reason: 'skill_too_high',
    playingUp: false,
    playingDown: false,
  };

  it('registered wins over everything, even an otherwise-ineligible fit', () => {
    expect(classifyDivision({ fit: doesNotFit, registered: true, full: true }).kind).toBe(
      'registered',
    );
  });

  it('ineligible wins over other_down/other_up/full when not registered', () => {
    expect(classifyDivision({ fit: doesNotFit, registered: false, full: true }).kind).toBe(
      'ineligible',
    );
  });

  it('other_down wins over other_up and full', () => {
    const playingDown: DivisionFitResult = { ...fits, playingUp: true, playingDown: true };
    expect(classifyDivision({ fit: playingDown, registered: false, full: true }).kind).toBe(
      'other_down',
    );
  });

  it('other_up wins over full', () => {
    const playingUp: DivisionFitResult = { ...fits, playingUp: true };
    expect(classifyDivision({ fit: playingUp, registered: false, full: true }).kind).toBe(
      'other_up',
    );
  });

  it('full wins over recommended', () => {
    expect(classifyDivision({ fit: fits, registered: false, full: true }).kind).toBe('full');
  });

  it('recommended is the default when nothing else applies', () => {
    expect(classifyDivision({ fit: fits, registered: false, full: false }).kind).toBe(
      'recommended',
    );
  });
});

describe('describeDivisionFit', () => {
  const base = {
    divisionName: "Women's Doubles Beginner",
    bandLabel: 'Beginner',
    playerLevel: 'Novice',
  };

  it('tells the reader which category a division is for', () => {
    const msg = describeDivisionFit('sex', { ...base, subject: 'you' });
    expect(msg).toContain('for women');
  });

  it('names the partner rather than saying "that player" when a name is known', () => {
    const msg = describeDivisionFit('sex', {
      ...base,
      subject: 'partner',
      partnerName: 'Maria',
    });
    expect(msg.startsWith('Maria')).toBe(true);
  });

  it('falls back to a neutral noun when the partner has no name', () => {
    const msg = describeDivisionFit('sex', { ...base, subject: 'partner', partnerName: '  ' });
    expect(msg.startsWith('That player')).toBe(true);
  });

  it('describes a mixed_pair refusal plainly, with no names on either side', () => {
    const msg = describeDivisionFit('mixed_pair', {
      ...base,
      subject: 'partner',
      partnerName: 'Maria',
    });
    expect(msg).toBe('Mixed doubles needs one male and one female player.');
  });

  it('states the division band and the player level for a skill refusal', () => {
    const msg = describeDivisionFit('skill_too_high', { ...base, subject: 'you' });
    expect(msg).toContain('Beginner');
    expect(msg).toContain('Novice');
  });

  it('omits the level clause when the player has none recorded', () => {
    const msg = describeDivisionFit('skill_too_high', {
      ...base,
      subject: 'you',
      playerLevel: null,
    });
    expect(msg).not.toContain('level is');
  });

  it('points a player with no gender at their profile, which is the thing they can fix', () => {
    const msg = describeDivisionFit('sex_unknown', { ...base, subject: 'you' });
    expect(msg.toLowerCase()).toContain('profile');
  });

  it('always points somewhere: every message suggests what to do instead', () => {
    const reasons = ['sex', 'sex_unknown', 'skill_too_high'] as const;
    for (const reason of reasons) {
      for (const subject of ['you', 'partner'] as const) {
        const msg = describeDivisionFit(reason, { ...base, subject, partnerName: 'Ana' });
        expect(msg.toLowerCase()).toMatch(
          /try|pick|look for|enter (one|any)|choose|add your|add it to/,
        );
      }
    }
  });

  it('never uses jargon a player would not say out loud', () => {
    const reasons = ['sex', 'sex_unknown', 'skill_too_high'] as const;
    for (const reason of reasons) {
      const msg = describeDivisionFit(reason, { ...base, subject: 'you' }).toLowerCase();
      for (const word of ['eligib', 'criteria', 'invalid', 'constraint', 'policy']) {
        expect(msg).not.toContain(word);
      }
    }
  });

  describe('age copy (§2AP B)', () => {
    it('age_unknown for the reader points at their own profile', () => {
      const msg = describeDivisionFit('age_unknown', { ...base, subject: 'you' });
      expect(msg.toLowerCase()).toContain('birthday');
      expect(msg.toLowerCase()).toContain('profile');
      expect(msg).toContain(base.divisionName);
    });

    it('age_unknown for a partner names them and asks them to add it', () => {
      const msg = describeDivisionFit('age_unknown', {
        ...base,
        subject: 'partner',
        partnerName: 'Maria',
      });
      expect(msg.startsWith('Maria')).toBe(true);
      expect(msg.toLowerCase()).toContain('birthday');
    });

    it('age_unknown for a nameless partner falls back to a neutral noun', () => {
      const msg = describeDivisionFit('age_unknown', { ...base, subject: 'partner' });
      expect(msg.startsWith('That player')).toBe(true);
    });

    it('age for the reader names the age group, not a birthday fix', () => {
      const msg = describeDivisionFit('age', { ...base, subject: 'you' });
      expect(msg.toLowerCase()).toContain('age group');
      expect(msg.toLowerCase()).not.toContain('birthday');
    });

    it('age for a partner names them and suggests a division without an age limit', () => {
      const msg = describeDivisionFit('age', {
        ...base,
        subject: 'partner',
        partnerName: 'Maria',
      });
      expect(msg.startsWith('Maria')).toBe(true);
      expect(msg.toLowerCase()).toContain('age group');
      expect(msg.toLowerCase()).toContain('without an age limit');
    });
  });
});
