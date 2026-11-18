import { describe, expect, it } from 'vitest';
import { RetirementTransfer } from '../../models/retirement.model';
import { Asset } from '../../models/worth-it.model';
import { retirementSnapshot } from './retirement';

describe('Retirement (IKE / IKZE) domain math & annual limit snapshot', () => {
  const ikeAsset: Asset = {
    id: 'ike-1',
    name: 'XTB IKE',
    type: 'retirement',
    currency: 'PLN',
    balance: 32000,
    retirement: {
      accountKind: 'ike',
      annualLimit: 28260,
      ytdContributionsBaseline: 10000,
      ytdBaselineYear: 2026,
    },
    isGoalEligible: false,
    updatedAt: '2026-01-15T10:00:00.000Z',
  };

  it('combines current-year baseline YTD and recorded transfers to compute remaining limit and usage percent', () => {
    const transfers: RetirementTransfer[] = [
      {
        id: 'tr-2025',
        fromAssetId: 'bank-1',
        fromAssetName: 'Checking',
        toAssetId: 'ike-1',
        toAssetName: 'XTB IKE',
        amount: 5000,
        sourceAmount: 5000,
        currency: 'PLN',
        date: '2025-11-10',
        createdAt: '2025-11-10T10:00:00.000Z',
      },
      {
        id: 'tr-2026-1',
        fromAssetId: 'bank-1',
        fromAssetName: 'Checking',
        toAssetId: 'ike-1',
        toAssetName: 'XTB IKE',
        amount: 4130,
        sourceAmount: 4130,
        currency: 'PLN',
        date: '2026-03-10',
        createdAt: '2026-03-10T10:00:00.000Z',
      },
    ];

    const snap = retirementSnapshot(ikeAsset, transfers, '2026-04-15');
    expect(snap).toEqual({
      assetId: 'ike-1',
      year: 2026,
      accountKind: 'ike',
      annualLimit: 28260,
      baselineYtd: 10000,
      transferredYtd: 4130,
      contributedYtd: 14130,
      remainingLimit: 14130,
      limitUsagePercent: 50,
      isLimitReached: false,
    });
  });

  it('resets baselineYtd in subsequent calendar years and infers IKZE preset when not explicitly set', () => {
    const ikzeAsset: Asset = {
      id: 'ikze-1',
      name: 'mBank IKZE',
      type: 'retirement',
      currency: 'PLN',
      balance: 15000,
      isGoalEligible: false,
      updatedAt: '2026-01-01T10:00:00.000Z',
    };

    const snap2027 = retirementSnapshot(ikeAsset, [], '2027-02-01');
    expect(snap2027.year).toBe(2027);
    expect(snap2027.baselineYtd).toBe(0);
    expect(snap2027.contributedYtd).toBe(0);
    expect(snap2027.remainingLimit).toBe(28260);

    const ikzeSnap = retirementSnapshot(ikzeAsset, [], '2026-05-01');
    expect(ikzeSnap.accountKind).toBe('ikze_standard');
    expect(ikzeSnap.annualLimit).toBe(11304);
  });
});
