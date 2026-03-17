/**
 * Fund Accounting Engine
 *
 * Pure functions for NAV-based share accounting.
 * Maps the accounting logic from /home/datta/base/research_management_tool/port overview.xlsx
 *
 * Workbook mapping:
 *   - Each quarter sheet has a top accounting block (rows 1-22)
 *   - Row 3: AUM, Row 4: NAV/share, Row 5: Outstanding Shares
 *   - Rows 7-9: Bhuvan (Capital, Equity%, Shares)
 *   - Rows 11-13: Dhruv (Capital, Equity%, Shares)
 *   - Rows 15-17: Amit (Capital, Equity%, Shares)
 *   - Row 19: Period/QTD return, Row 20: Cumulative return
 *   - Row 22: Dates
 *   - Contribution columns (e.g. E, H, K, N) appear between period start/end pairs
 */

// ─── Data Model ─────────────────────────────────────────────────────────────
// The raw state stores ONLY user inputs: endAUM values and contributions.
// All other values (NAV, shares, capital, equity, returns) are derived.
//
// state = {
//   investors: ['Bhuvan', 'Dhruv', 'Amit'],
//   inceptionDate: '2024-09-17',
//   inceptionNAV: 100,
//   initialShares: { Bhuvan: 32.71903056, Dhruv: 15.92656944, Amit: 0 },
//   quarters: [
//     {
//       label: 'Q4 2024',
//       events: [
//         { type: 'period', startDate: '...', endDate: '...', endAUM: 5923.04 },
//         { type: 'contribution', date: '...', amounts: { Amit: 2500 } },
//         { type: 'period', startDate: '...', endDate: '...', endAUM: 8207.62 },
//         ...
//       ]
//     }
//   ]
// }

// ─── Seed State (mirrors port overview.xlsx) ─────────────────────────────────

export function createSeedState() {
  return {
    investors: ['Bhuvan', 'Dhruv', 'Amit'],
    inceptionDate: '2024-09-17',
    inceptionNAV: 100,
    // Workbook Q4 2024 sheet: C9=32.71903056, C13=15.92656944 (hardcoded strings)
    // These represent shares at inception, issued at NAV=100
    // Bhuvan: 3271.90/100 = 32.71903056, Dhruv: 1592.66/100 = 15.92656944
    initialShares: { Bhuvan: 32.71903056, Dhruv: 15.92656944, Amit: 0 },
    quarters: [
      {
        // Workbook: "Q4 2024 (Sept to Dec)" sheet
        // Cols C:D = single period, no contributions mid-quarter
        // C3=4864.56 (start AUM), D3=5923.04 (end AUM)
        // C4=100 (NAV start, =C3/C5), D4=121.759 (=D3/C5)
        // C5=48.6456 (total shares), D5=48.6456 (=C5, unchanged)
        label: 'Q4 2024',
        events: [
          { type: 'period', startDate: '2024-09-17', endDate: '2024-12-31', endAUM: 5923.04 }
        ]
      },
      {
        // Workbook: "Q1 2025 (Jan to Mar)" sheet
        // C:D = period 1, E = contribution, F:G = period 2, H = contribution, I:J = period 3
        // C3=5923.04, D3=5790.92, G3=8207.62, J3=10594.99
        // E15=2500 (Amit), H15=2500 (Amit)
        // F17=E15/D4+D17 (new shares for Amit at frozen NAV)
        label: 'Q1 2025',
        events: [
          { type: 'period', startDate: '2025-01-01', endDate: '2025-03-17', endAUM: 5790.92 },
          { type: 'contribution', date: '2025-03-17', amounts: { Amit: 2500 } },
          { type: 'period', startDate: '2025-03-18', endDate: '2025-03-18', endAUM: 8207.62 },
          { type: 'contribution', date: '2025-03-18', amounts: { Amit: 2500 } },
          { type: 'period', startDate: '2025-03-19', endDate: '2025-03-31', endAUM: 10594.99 }
        ]
      },
      {
        // Workbook: "Q2 2025 (Apr to June)" sheet
        // C:D=P1, E=contrib, F:G=P2, H=contrib, I:J=P3, K=contrib, L:M=P4, N=contrib, O:P=P5
        // Contributions: E11=2500(Dhruv), H7=601.49(Bhuvan)+H11=1130.52(Dhruv),
        //   K7=2000(Bhuvan), N11=1100(Dhruv)
        label: 'Q2 2025',
        events: [
          { type: 'period', startDate: '2025-04-01', endDate: '2025-04-09', endAUM: 10838.33 },
          { type: 'contribution', date: '2025-04-09', amounts: { Dhruv: 2500 } },
          { type: 'period', startDate: '2025-04-10', endDate: '2025-05-28', endAUM: 14948.95 },
          { type: 'contribution', date: '2025-05-28', amounts: { Bhuvan: 601.49, Dhruv: 1130.52 } },
          { type: 'period', startDate: '2025-05-29', endDate: '2025-06-17', endAUM: 17142.37 },
          { type: 'contribution', date: '2025-06-17', amounts: { Bhuvan: 2000 } },
          { type: 'period', startDate: '2025-06-18', endDate: '2025-06-24', endAUM: 19348.68 },
          { type: 'contribution', date: '2025-06-24', amounts: { Dhruv: 1100 } },
          { type: 'period', startDate: '2025-06-25', endDate: '2025-06-30', endAUM: 21236.56 }
        ]
      },
      {
        // Workbook: "Q3 2025 (July to Sept)" sheet
        // D:E=P1, F=contrib, G:H=P2
        // F7=500(Bhuvan), F11=500(Dhruv)
        // New shares: G9=F7/E4+E9, G13=F11/E4+E13
        label: 'Q3 2025',
        events: [
          { type: 'period', startDate: '2025-07-01', endDate: '2025-07-31', endAUM: 21167.07 },
          { type: 'contribution', date: '2025-07-31', amounts: { Bhuvan: 500, Dhruv: 500 } },
          { type: 'period', startDate: '2025-08-01', endDate: '2025-09-30', endAUM: 25655.34 }
        ]
      },
      {
        // Workbook: "Q4 2025 (Oct to Dec)" sheet
        // D:E = single period, no contributions
        // D3=25655.34, E3=27219.64
        label: 'Q4 2025',
        events: [
          { type: 'period', startDate: '2025-10-01', endDate: '2025-12-01', endAUM: 27219.64 }
        ]
      }
    ]
  };
}


// ─── Core Computation ────────────────────────────────────────────────────────
// computeFullTimeline: walks through all quarters chronologically, deriving
// every value from endAUM inputs and contribution amounts.
//
// This mirrors the workbook column-by-column computation:
//   - Period start: NAV and shares carried from prior period end (or post-contribution)
//   - Period end: NAV = endAUM / totalShares, investor capital = shares * NAV
//   - Contribution: freeze NAV, issue new shares = amount / frozenNAV

export function computeFullTimeline(state) {
  const { investors, inceptionNAV, initialShares, quarters } = state;

  // Running state across all quarters
  let currentNAV = inceptionNAV; // Workbook Q4'24 C4 = 100
  let shares = { ...initialShares };
  let totalShares = investors.reduce((sum, inv) => sum + (shares[inv] || 0), 0);
  const inceptionOpenNAV = inceptionNAV; // For cumulative return: always 100

  const result = []; // Array of computed quarter objects

  for (let qi = 0; qi < quarters.length; qi++) {
    const quarter = quarters[qi];
    const quarterOpenNAV = currentNAV; // For QTD return calculation
    const computedEvents = [];

    for (let ei = 0; ei < quarter.events.length; ei++) {
      const event = quarter.events[ei];

      if (event.type === 'contribution') {
        // ─── Contribution Event ───────────────────────────────────────
        // Workbook pattern: freeze NAV at prior period end, issue shares
        // Example: Q1'25 E15=2500(Amit), new shares = 2500/D4 = 2500/119.043
        // Example: Q3'25 F7=500(Bhuvan), F11=500(Dhruv), frozen at E4=143.747
        const frozenNAV = currentNAV;
        const newShares = {};
        let totalNewShares = 0;

        for (const inv of investors) {
          const amount = event.amounts[inv] || 0;
          if (amount > 0) {
            const issued = amount / frozenNAV;
            newShares[inv] = issued;
            shares[inv] = (shares[inv] || 0) + issued;
            totalNewShares += issued;
          } else {
            newShares[inv] = 0;
          }
        }

        totalShares += totalNewShares;

        computedEvents.push({
          type: 'contribution',
          date: event.date,
          amounts: { ...event.amounts },
          frozenNAV,
          newShares: { ...newShares },
          totalNewShares,
          sharesAfter: { ...shares },
          totalSharesAfter: totalShares,
          aumAfter: frozenNAV * totalShares
        });

      } else if (event.type === 'period') {
        // ─── Period Start ─────────────────────────────────────────────
        // Workbook: start NAV = prior end NAV (or frozen NAV after contribution)
        // Start AUM = NAV * total shares (e.g. Q1'25 F3 = F4*F5)
        const startNAV = currentNAV;
        const startShares = { ...shares };
        const startTotalShares = totalShares;
        const startAUM = startNAV * startTotalShares;

        // ─── Period End ───────────────────────────────────────────────
        // Workbook: user inputs endAUM, then NAV = endAUM / totalShares
        // e.g. Q4'24 D4 = D3/C5, Q1'25 D4 = D3/C5
        // Shares don't change during a performance period
        const endAUM = event.endAUM;
        const endNAV = startTotalShares > 0 ? endAUM / startTotalShares : startNAV;

        // Shares unchanged during period
        const endShares = { ...startShares };
        const endTotalShares = startTotalShares;

        // Investor capital and equity
        // Workbook: capital = shares * NAV (e.g. Q4'24 C7 = C9*C4)
        // Workbook: equity = shares / total (e.g. Q4'24 C8 = C9/C5)
        const investorStart = {};
        const investorEnd = {};
        for (const inv of investors) {
          const s = startShares[inv] || 0;
          investorStart[inv] = {
            shares: s,
            capital: s * startNAV,
            equity: startTotalShares > 0 ? s / startTotalShares : 0
          };
          investorEnd[inv] = {
            shares: s,
            capital: s * endNAV,
            equity: endTotalShares > 0 ? s / endTotalShares : 0
          };
        }

        // ─── Returns ──────────────────────────────────────────────────
        // Workbook: period return = (endNAV - startNAV) / startNAV
        //   e.g. Q4'24 D19 = (D4-C4)/C4
        // QTD: (currentNAV - quarterOpenNAV) / quarterOpenNAV
        //   e.g. Q1'25 J19 = (J4-C4)/C4
        // Cumulative: (currentNAV - inceptionNAV) / inceptionNAV
        //   e.g. Q1'25 D20 = (D4-Q4'24!$C$4)/Q4'24!$C$4
        const periodReturn = startNAV > 0 ? (endNAV / startNAV - 1) : 0;
        const qtdReturn = quarterOpenNAV > 0 ? (endNAV / quarterOpenNAV - 1) : 0;
        const cumulativeReturn = inceptionOpenNAV > 0 ? (endNAV / inceptionOpenNAV - 1) : 0;

        // Update running state
        currentNAV = endNAV;

        computedEvents.push({
          type: 'period',
          startDate: event.startDate,
          endDate: event.endDate,
          startAUM,
          endAUM,
          startNAV,
          endNAV,
          startTotalShares,
          endTotalShares,
          investorStart,
          investorEnd,
          periodReturn,
          qtdReturn,
          cumulativeReturn
        });
      }
    }

    result.push({
      label: quarter.label,
      quarterOpenNAV,
      computedEvents
    });
  }

  return result;
}


// ─── State Mutation Helpers (return new state, never mutate) ─────────────────

export function updateEndAUM(state, quarterIndex, eventIndex, newEndAUM) {
  const newState = structuredClone(state);
  const event = newState.quarters[quarterIndex].events[eventIndex];
  if (event.type === 'period') {
    event.endAUM = newEndAUM;
  }
  return newState;
}

export function addContribution(state, quarterIndex, afterEventIndex, amounts, date) {
  const newState = structuredClone(state);
  const events = newState.quarters[quarterIndex].events;
  const contribution = { type: 'contribution', date, amounts };
  events.splice(afterEventIndex + 1, 0, contribution);
  return newState;
}

export function removeContribution(state, quarterIndex, eventIndex) {
  const newState = structuredClone(state);
  newState.quarters[quarterIndex].events.splice(eventIndex, 1);
  return newState;
}

export function addPeriod(state, quarterIndex, startDate, endDate, endAUM) {
  const newState = structuredClone(state);
  newState.quarters[quarterIndex].events.push({
    type: 'period', startDate, endDate, endAUM: endAUM || 0
  });
  return newState;
}

export function removePeriod(state, quarterIndex, eventIndex) {
  const newState = structuredClone(state);
  newState.quarters[quarterIndex].events.splice(eventIndex, 1);
  return newState;
}

export function addQuarter(state, label) {
  const newState = structuredClone(state);
  newState.quarters.push({ label, events: [] });
  return newState;
}

export function removeQuarter(state, quarterIndex) {
  const newState = structuredClone(state);
  newState.quarters.splice(quarterIndex, 1);
  return newState;
}

export function updateContribution(state, quarterIndex, eventIndex, investor, amount) {
  const newState = structuredClone(state);
  const event = newState.quarters[quarterIndex].events[eventIndex];
  if (event.type === 'contribution') {
    event.amounts[investor] = amount;
  }
  return newState;
}

export function updatePeriodDates(state, quarterIndex, eventIndex, startDate, endDate) {
  const newState = structuredClone(state);
  const event = newState.quarters[quarterIndex].events[eventIndex];
  if (event.type === 'period') {
    if (startDate !== undefined) event.startDate = startDate;
    if (endDate !== undefined) event.endDate = endDate;
  }
  return newState;
}

export function updateContributionDate(state, quarterIndex, eventIndex, date) {
  const newState = structuredClone(state);
  const event = newState.quarters[quarterIndex].events[eventIndex];
  if (event.type === 'contribution') {
    event.date = date;
  }
  return newState;
}

export function addInvestor(state, name) {
  const newState = structuredClone(state);
  if (!newState.investors.includes(name)) {
    newState.investors.push(name);
    newState.initialShares[name] = 0;
  }
  return newState;
}


// ─── Validation ──────────────────────────────────────────────────────────────
// Checks the computed timeline for consistency issues.
// Matches workbook invariants:
//   - sum(investor shares) == total outstanding shares
//   - NAV * outstanding shares == AUM
//   - sum(investor capital) == AUM
//   - No negative shares
//   - Chronological dates

export function validateTimeline(computedTimeline, state) {
  const errors = [];
  const EPSILON = 0.01; // tolerance for floating point

  let prevDate = null;

  for (const quarter of computedTimeline) {
    for (const event of quarter.computedEvents) {
      if (event.type === 'period') {
        // Date ordering
        if (prevDate && event.startDate < prevDate) {
          errors.push({
            level: 'error',
            message: `Date ordering violated: ${event.startDate} is before previous date ${prevDate}`,
            quarter: quarter.label
          });
        }
        if (event.endDate < event.startDate) {
          errors.push({
            level: 'error',
            message: `End date ${event.endDate} is before start date ${event.startDate}`,
            quarter: quarter.label
          });
        }
        prevDate = event.endDate;

        // Shares sum check
        const sharesSum = Object.values(event.investorEnd).reduce((s, v) => s + v.shares, 0);
        if (Math.abs(sharesSum - event.endTotalShares) > EPSILON) {
          errors.push({
            level: 'error',
            message: `Shares mismatch: investor sum ${sharesSum.toFixed(4)} != total ${event.endTotalShares.toFixed(4)}`,
            quarter: quarter.label
          });
        }

        // NAV * shares == AUM
        const computedAUM = event.endNAV * event.endTotalShares;
        if (Math.abs(computedAUM - event.endAUM) > EPSILON) {
          errors.push({
            level: 'error',
            message: `AUM mismatch: NAV(${event.endNAV.toFixed(4)}) * shares(${event.endTotalShares.toFixed(4)}) = ${computedAUM.toFixed(2)} != ${event.endAUM.toFixed(2)}`,
            quarter: quarter.label
          });
        }

        // Capital sum == AUM
        const capitalSum = Object.values(event.investorEnd).reduce((s, v) => s + v.capital, 0);
        if (Math.abs(capitalSum - event.endAUM) > EPSILON) {
          errors.push({
            level: 'error',
            message: `Capital sum ${capitalSum.toFixed(2)} != AUM ${event.endAUM.toFixed(2)}`,
            quarter: quarter.label
          });
        }

        // Negative shares check
        for (const [inv, data] of Object.entries(event.investorEnd)) {
          if (data.shares < -EPSILON) {
            errors.push({
              level: 'error',
              message: `${inv} has negative shares: ${data.shares.toFixed(4)}`,
              quarter: quarter.label
            });
          }
        }

        // Zero outstanding shares (unless truly at zero)
        if (event.endTotalShares < EPSILON && event.endAUM > EPSILON) {
          errors.push({
            level: 'error',
            message: `Zero outstanding shares but non-zero AUM: ${event.endAUM.toFixed(2)}`,
            quarter: quarter.label
          });
        }

      } else if (event.type === 'contribution') {
        // Check no negative contributions
        for (const [inv, amount] of Object.entries(event.amounts)) {
          if (amount < 0) {
            errors.push({
              level: 'warning',
              message: `Negative contribution for ${inv}: ${amount}`,
              quarter: quarter.label
            });
          }
        }

        if (prevDate && event.date < prevDate) {
          errors.push({
            level: 'error',
            message: `Contribution date ${event.date} is before previous date ${prevDate}`,
            quarter: quarter.label
          });
        }
        prevDate = event.date;
      }
    }
  }

  return errors;
}


// ─── Summary helpers ─────────────────────────────────────────────────────────

export function getLatestMetrics(computedTimeline) {
  for (let qi = computedTimeline.length - 1; qi >= 0; qi--) {
    const events = computedTimeline[qi].computedEvents;
    for (let ei = events.length - 1; ei >= 0; ei--) {
      if (events[ei].type === 'period') {
        const p = events[ei];
        return {
          nav: p.endNAV,
          aum: p.endAUM,
          totalShares: p.endTotalShares,
          cumulativeReturn: p.cumulativeReturn,
          investorEnd: p.investorEnd
        };
      }
    }
  }
  return null;
}
