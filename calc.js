/* ============================================
   Red Alert — Prediction Algorithm
   ============================================ */

const Calc = {
  /**
   * Parse "YYYY-MM-DD" string to Date (local timezone)
   */
  parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  /**
   * Format Date to "YYYY-MM-DD"
   */
  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * Add days to a date string, return new date string
   */
  addDays(dateStr, days) {
    const d = Calc.parseDate(dateStr);
    d.setDate(d.getDate() + days);
    return Calc.formatDate(d);
  },

  /**
   * Difference in days between two date strings (b - a)
   */
  diffDays(a, b) {
    const da = Calc.parseDate(a);
    const db = Calc.parseDate(b);
    return Math.round((db - da) / (1000 * 60 * 60 * 24));
  },

  /**
   * Today as "YYYY-MM-DD"
   */
  today() {
    return Calc.formatDate(new Date());
  },

  /**
   * Calculate averages from completed cycles
   * @param {Array} cycles - All cycles sorted by startDate asc
   * @param {Object} defaults - { cycleLength, periodLength }
   * @returns {{ avgCycleLength: number, avgPeriodLength: number }}
   */
  calcAverages(cycles, defaults) {
    // Completed cycles are those where we know the next cycle's start date
    // i.e., all cycles except the last one
    const completedWithLength = [];
    for (let i = 0; i < cycles.length - 1; i++) {
      const len = Calc.diffDays(cycles[i].startDate, cycles[i + 1].startDate);
      if (len > 0 && len < 60) {
        completedWithLength.push({ cycle: cycles[i], cycleLength: len });
      }
    }

    // Period lengths from cycles with endDate
    const periodLengths = cycles
      .filter(c => c.endDate)
      .map(c => Calc.diffDays(c.startDate, c.endDate) + 1)
      .filter(l => l > 0 && l < 15);

    // Take last 3-6
    const recentCycles = completedWithLength.slice(-6);
    const recentPeriods = periodLengths.slice(-6);

    const avgCycleLength = recentCycles.length >= 3
      ? Math.round(recentCycles.reduce((s, c) => s + c.cycleLength, 0) / recentCycles.length)
      : defaults.cycleLength;

    const avgPeriodLength = recentPeriods.length >= 3
      ? Math.round(recentPeriods.reduce((s, l) => s + l, 0) / recentPeriods.length)
      : defaults.periodLength;

    return { avgCycleLength, avgPeriodLength };
  },

  /**
   * Predict dates for a given cycle
   * @param {string} startDate - Cycle start date "YYYY-MM-DD"
   * @param {number} avgCycleLength
   * @param {number} avgPeriodLength
   * @returns {{ predictedEndDate, ovulationDate, fertileStart, fertileEnd, nextCycleDate }}
   */
  predictCycle(startDate, avgCycleLength, avgPeriodLength) {
    const predictedEndDate = Calc.addDays(startDate, avgPeriodLength - 1);
    const nextCycleDate = Calc.addDays(startDate, avgCycleLength);
    // Day 1 is startDate; ovulation is ~14 days before next cycle
    // Date = startDate + (cycleLength - 14 - 1)
    const ovulationDate = Calc.addDays(startDate, avgCycleLength - 15);
    const fertileStart = Calc.addDays(ovulationDate, -5);
    const fertileEnd = Calc.addDays(ovulationDate, 1);
    return { predictedEndDate, ovulationDate, fertileStart, fertileEnd, nextCycleDate };
  },

  /**
   * Get cycle day number (1-based) for a target date
   */
  getCycleDay(cycleStartDate, targetDate) {
    return Calc.diffDays(cycleStartDate, targetDate) + 1;
  },

  /**
   * Determine the phase for a given day
   * @returns "menstruation" | "follicular" | "ovulation" | "luteal"
   */
  getPhase(cycleDay, periodEndDay, fertileStartDay, fertileEndDay, cycleLength) {
    if (cycleDay <= periodEndDay) return 'menstruation';
    if (cycleDay >= fertileStartDay && cycleDay <= fertileEndDay) return 'ovulation';
    if (cycleDay < fertileStartDay) return 'follicular';
    return 'luteal';
  },

  /**
   * Days from today to a target date
   */
  getDaysUntil(targetDateStr) {
    return Calc.diffDays(Calc.today(), targetDateStr);
  },

  /**
   * Get phase name in Russian
   */
  getPhaseName(phase) {
    const names = {
      menstruation: 'Менструация',
      follicular: 'Фолликулярная фаза',
      ovulation: 'Овуляция',
      luteal: 'Лютеиновая фаза'
    };
    return names[phase] || '—';
  },

  /**
   * Format date for display: "2 фев"
   */
  formatShort(dateStr) {
    const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const d = Calc.parseDate(dateStr);
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  /**
   * Format date for modal: "2 февраля 2026"
   */
  formatFull(dateStr) {
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const d = Calc.parseDate(dateStr);
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  },

  /**
   * Build a map of date -> visual state for calendar rendering
   * Returns Map<string, { type: string, cycleId?: number }>
   * Types: "menstruation", "menstruation-predicted", "ovulation", "fertile"
   */
  buildDateMap(cycles, defaults) {
    const map = new Map();
    const avgs = Calc.calcAverages(cycles, defaults);

    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      const prediction = Calc.predictCycle(cycle.startDate, avgs.avgCycleLength, avgs.avgPeriodLength);

      // Actual menstruation days
      const actualEnd = cycle.endDate || prediction.predictedEndDate;
      const actualEndDate = Calc.parseDate(actualEnd);
      const startDate = Calc.parseDate(cycle.startDate);

      let d = new Date(startDate);
      while (d <= actualEndDate) {
        const ds = Calc.formatDate(d);
        if (cycle.endDate || ds === cycle.startDate) {
          // Confirmed menstruation (has endDate) or start day is always confirmed
          map.set(ds, { type: 'menstruation', cycleId: cycle.id });
        } else {
          // Predicted menstruation days
          map.set(ds, { type: 'menstruation-predicted', cycleId: cycle.id });
        }
        d.setDate(d.getDate() + 1);
      }

      // If endDate is set, mark all days from start to end as confirmed
      if (cycle.endDate) {
        d = new Date(startDate);
        const end = Calc.parseDate(cycle.endDate);
        while (d <= end) {
          map.set(Calc.formatDate(d), { type: 'menstruation', cycleId: cycle.id });
          d.setDate(d.getDate() + 1);
        }
      }

      // Ovulation & fertile window (only for current/future cycles)
      const isLastCycle = i === cycles.length - 1;
      const nextCycleStart = i < cycles.length - 1 ? cycles[i + 1].startDate : null;
      const endBoundary = nextCycleStart || prediction.nextCycleDate;

      // Ovulation day
      if (prediction.ovulationDate >= cycle.startDate && prediction.ovulationDate < endBoundary) {
        if (!map.has(prediction.ovulationDate)) {
          map.set(prediction.ovulationDate, { type: 'ovulation', cycleId: cycle.id });
        }
      }

      // Fertile window
      let fd = Calc.parseDate(prediction.fertileStart);
      const feEnd = Calc.parseDate(prediction.fertileEnd);
      while (fd <= feEnd) {
        const fs = Calc.formatDate(fd);
        if (!map.has(fs) && fs >= cycle.startDate && fs < endBoundary) {
          map.set(fs, { type: 'fertile', cycleId: cycle.id });
        }
        fd.setDate(fd.getDate() + 1);
      }

      // For the last cycle, also predict next period
      if (isLastCycle) {
        const nextStart = prediction.nextCycleDate;
        const nextPrediction = Calc.predictCycle(nextStart, avgs.avgCycleLength, avgs.avgPeriodLength);
        let nd = Calc.parseDate(nextStart);
        const nEnd = Calc.parseDate(nextPrediction.predictedEndDate);
        while (nd <= nEnd) {
          const ns = Calc.formatDate(nd);
          if (!map.has(ns)) {
            map.set(ns, { type: 'menstruation-predicted', cycleId: null });
          }
          nd.setDate(nd.getDate() + 1);
        }

        // Next cycle ovulation & fertile
        if (!map.has(nextPrediction.ovulationDate)) {
          map.set(nextPrediction.ovulationDate, { type: 'ovulation', cycleId: null });
        }
        let nfd = Calc.parseDate(nextPrediction.fertileStart);
        const nfeEnd = Calc.parseDate(nextPrediction.fertileEnd);
        while (nfd <= nfeEnd) {
          const nfs = Calc.formatDate(nfd);
          if (!map.has(nfs)) {
            map.set(nfs, { type: 'fertile', cycleId: null });
          }
          nfd.setDate(nfd.getDate() + 1);
        }
      }
    }

    return map;
  }
};
