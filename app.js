/* ============================================
   Red Alert — Main Application
   ============================================ */

const App = {
  cycles: [],
  defaults: { cycleLength: 28, periodLength: 5, ovulationOffset: 0 },
  dateMap: new Map(),
  avgs: { avgCycleLength: 28, avgPeriodLength: 5 },
  currentScreen: 'calendar',
  renderedMonths: new Set(),
  scrollContainer: null,
  backupKey: 'red-alert-backup',
  isScrolling: false,
  todayStr: Calc.today(),

  async init() {
    await DB.init();
    await App.loadData();
    const restored = await App.restoreBackupIfMissing();
    if (!restored) {
      App.setupCalendar();
      App.updateStatusBar();
      App.updateStats();
    }
    App.setupNavigation();
    App.setupModal();
    App.setupSettings();
    App.setupEditModal();
    App.registerSW();
  },

  async loadData() {
    App.cycles = await DB.getAllCycles();
    App.defaults = await DB.getDefaults();
    App.avgs = Calc.calcAverages(App.cycles, App.defaults);
    await App.repairCycles();
    App.dateMap = Calc.buildDateMap(App.cycles, App.defaults);
  },

  async repairCycles() {
    let changed = false;
    for (const cycle of App.cycles) {
      if (!cycle.endDate) {
        const pLen = cycle.periodLength || App.avgs.avgPeriodLength;
        const endDate = Calc.addDays(cycle.startDate, pLen - 1);
        await DB.updateCycle(cycle.id, { endDate, periodLength: pLen });
        cycle.endDate = endDate;
        cycle.periodLength = pLen;
        changed = true;
      }
    }
    if (changed) {
      await App.saveBackup();
    }
  },

  async saveBackup() {
    try {
      const data = await DB.exportData();
      localStorage.setItem(App.backupKey, data);
    } catch (err) {
      console.warn('Backup failed', err);
    }
  },

  clearBackup() {
    localStorage.removeItem(App.backupKey);
  },

  async restoreBackupIfMissing() {
    if (App.cycles.length > 0) return false;
    const data = localStorage.getItem(App.backupKey);
    if (!data) return false;
    try {
      await DB.importData(data);
      await App.refresh();
      App.showToast('Данные восстановлены');
      return true;
    } catch (err) {
      console.warn('Restore failed', err);
      return false;
    }
  },

  // ---- Helpers for safe DOM creation ----

  el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  },

  getCycleDayForDate(dateStr) {
    for (let i = App.cycles.length - 1; i >= 0; i--) {
      const cycle = App.cycles[i];
      if (dateStr >= cycle.startDate) {
        const nextStart = i < App.cycles.length - 1 ? App.cycles[i + 1].startDate : null;
        if (nextStart && dateStr >= nextStart) continue;
        const day = Calc.diffDays(cycle.startDate, dateStr) + 1;
        if (day > 0 && day <= App.avgs.avgCycleLength + 14) return day;
        return null;
      }
    }
    return null;
  },

  // ---- Calendar ----

  setupCalendar(targetDate) {
    App.scrollContainer = document.getElementById('calendarScroll');
    App.scrollContainer.textContent = '';
    App.renderedMonths.clear();

    const center = targetDate ? Calc.parseDate(targetDate) : new Date();
    for (let offset = -2; offset <= 2; offset++) {
      const d = new Date(center.getFullYear(), center.getMonth() + offset, 1);
      App.renderMonth(d.getFullYear(), d.getMonth());
    }

    requestAnimationFrame(() => {
      if (targetDate) {
        const td = Calc.parseDate(targetDate);
        const months = App.scrollContainer.querySelectorAll('.calendar-month');
        for (const monthEl of months) {
          if (parseInt(monthEl.dataset.year) === td.getFullYear() && parseInt(monthEl.dataset.month) === td.getMonth()) {
            monthEl.scrollIntoView({ block: 'start' });
            break;
          }
        }
      } else {
        const todayEl = App.scrollContainer.querySelector('.calendar-day--today');
        if (todayEl) {
          const monthEl = todayEl.closest('.calendar-month');
          if (monthEl) {
            monthEl.scrollIntoView({ block: 'start' });
          }
        }
      }
      App.updateMonthTitle();
    });

    App.scrollContainer.addEventListener('scroll', App.onScroll, { passive: true });
    document.getElementById('btnToday').addEventListener('click', App.scrollToToday);
  },

  renderMonth(year, month) {
    const key = year + '-' + month;
    if (App.renderedMonths.has(key)) return;
    App.renderedMonths.add(key);

    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    const monthEl = App.el('div', 'calendar-month');
    monthEl.dataset.year = year;
    monthEl.dataset.month = month;

    const title = App.el('div', 'calendar-month__title', monthNames[month] + ' ' + year);
    monthEl.appendChild(title);

    const weekdays = App.el('div', 'calendar-weekdays');
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => {
      weekdays.appendChild(App.el('span', null, d));
    });
    monthEl.appendChild(weekdays);

    const daysGrid = App.el('div', 'calendar-days');
    const firstDay = new Date(year, month, 1);
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < startWeekday; i++) {
      daysGrid.appendChild(App.el('div', 'calendar-day calendar-day--empty'));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const dayEl = App.el('div', 'calendar-day');
      dayEl.dataset.date = dateStr;
      dayEl.appendChild(App.el('span', 'calendar-day__num', d));

      const cycleDay = App.getCycleDayForDate(dateStr);
      if (cycleDay) {
        dayEl.appendChild(App.el('span', 'calendar-day__sub', cycleDay));
      }

      if (dateStr === App.todayStr) {
        dayEl.classList.add('calendar-day--today');
      }

      const state = App.dateMap.get(dateStr);
      if (state) {
        dayEl.classList.add('calendar-day--' + state.type);
      }

      dayEl.addEventListener('click', () => App.openDayModal(dateStr));
      daysGrid.appendChild(dayEl);
    }

    monthEl.appendChild(daysGrid);

    const existing = Array.from(App.scrollContainer.children);
    let inserted = false;
    for (const child of existing) {
      const cy = parseInt(child.dataset.year);
      const cm = parseInt(child.dataset.month);
      if (year < cy || (year === cy && month < cm)) {
        App.scrollContainer.insertBefore(monthEl, child);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      App.scrollContainer.appendChild(monthEl);
    }
  },

  onScroll() {
    if (App.isScrolling) return;
    App.isScrolling = true;
    requestAnimationFrame(() => {
      App.isScrolling = false;
      App.checkLoadMore();
      App.updateMonthTitle();
      App.updateTodayButton();
    });
  },

  checkLoadMore() {
    const container = App.scrollContainer;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    if (scrollTop < 200) {
      const firstMonth = container.firstElementChild;
      if (firstMonth) {
        const y = parseInt(firstMonth.dataset.year);
        const m = parseInt(firstMonth.dataset.month);
        const prevDate = new Date(y, m - 1, 1);
        const oldHeight = scrollHeight;
        App.renderMonth(prevDate.getFullYear(), prevDate.getMonth());
        container.scrollTop += (container.scrollHeight - oldHeight);
      }
    }

    if (scrollTop + clientHeight > scrollHeight - 200) {
      const lastMonth = container.lastElementChild;
      if (lastMonth) {
        const y = parseInt(lastMonth.dataset.year);
        const m = parseInt(lastMonth.dataset.month);
        const nextDate = new Date(y, m + 1, 1);
        App.renderMonth(nextDate.getFullYear(), nextDate.getMonth());
      }
    }
  },

  updateMonthTitle() {
    const container = App.scrollContainer;
    const months = container.querySelectorAll('.calendar-month');
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    const threshold = App.scrollContainer.getBoundingClientRect().top + 40;
    let found = null;
    for (const m of months) {
      const titleEl = m.querySelector('.calendar-month__title');
      if (titleEl && titleEl.getBoundingClientRect().top <= threshold) {
        found = m;
      }
    }
    if (found) {
      const y = found.dataset.year;
      const mo = parseInt(found.dataset.month);
      document.getElementById('currentMonth').textContent = monthNames[mo] + ' ' + y;
    }
  },

  updateTodayButton() {
    const todayEl = App.scrollContainer.querySelector('.calendar-day--today');
    const btn = document.getElementById('btnToday');
    if (!todayEl) {
      btn.classList.add('visible');
      return;
    }
    const rect = todayEl.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    btn.classList.toggle('visible', !isVisible);
  },

  scrollToToday() {
    const today = new Date();
    App.renderMonth(today.getFullYear(), today.getMonth());
    requestAnimationFrame(() => {
      const todayEl = App.scrollContainer.querySelector('.calendar-day--today');
      if (todayEl) {
        const monthEl = todayEl.closest('.calendar-month');
        if (monthEl) {
          monthEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  },

  // ---- Status Bar ----

  updateStatusBar() {
    const dayBadge = document.getElementById('dayBadge');
    const phaseEl = document.getElementById('currentPhase');
    const datesEl = document.getElementById('keyDates');
    const progressFill = document.getElementById('progressFill');

    if (App.cycles.length === 0) {
      dayBadge.textContent = '—';
      phaseEl.textContent = 'Нет данных';
      datesEl.textContent = '';
      progressFill.style.width = '0%';
      return;
    }

    const lastCycle = App.cycles[App.cycles.length - 1];
    const prediction = Calc.predictCycle(lastCycle.startDate, App.avgs.avgCycleLength, App.avgs.avgPeriodLength, App.defaults.ovulationOffset);
    const cycleDay = Calc.getCycleDay(lastCycle.startDate, App.todayStr);

    if (cycleDay < 1 || cycleDay > App.avgs.avgCycleLength + 14) {
      dayBadge.textContent = '—';
      phaseEl.textContent = '—';
      datesEl.textContent = '';
      progressFill.style.width = '0%';
      return;
    }

    dayBadge.textContent = 'День ' + cycleDay;

    const periodEndDay = lastCycle.endDate
      ? Calc.diffDays(lastCycle.startDate, lastCycle.endDate) + 1
      : App.avgs.avgPeriodLength;
    const fertileStartDay = Calc.getCycleDay(lastCycle.startDate, prediction.fertileStart);
    const fertileEndDay = Calc.getCycleDay(lastCycle.startDate, prediction.fertileEnd);

    const phase = Calc.getPhase(cycleDay, periodEndDay, fertileStartDay, fertileEndDay, App.avgs.avgCycleLength);
    phaseEl.textContent = Calc.getPhaseName(phase);

    // Key dates
    datesEl.textContent = '';
    const periodEnd = lastCycle.endDate || prediction.predictedEndDate;
    if (Calc.getDaysUntil(periodEnd) >= 0) {
      const s = App.el('span', null, 'Конец: ' + Calc.formatShort(periodEnd));
      datesEl.appendChild(s);
    }
    datesEl.appendChild(App.el('span', null, 'Овуляция: ' + Calc.formatShort(prediction.ovulationDate)));
    datesEl.appendChild(App.el('span', null, 'След. цикл: ' + Calc.formatShort(prediction.nextCycleDate)));

    const progress = Math.min(100, Math.round((cycleDay / App.avgs.avgCycleLength) * 100));
    progressFill.style.width = progress + '%';
  },

  // ---- Stats ----

  updateStats() {
    if (App.cycles.length > 0) {
      const lastCycle = App.cycles[App.cycles.length - 1];
      const prediction = Calc.predictCycle(lastCycle.startDate, App.avgs.avgCycleLength, App.avgs.avgPeriodLength, App.defaults.ovulationOffset);
      const cycleDay = Calc.getCycleDay(lastCycle.startDate, App.todayStr);
      const daysUntil = Calc.getDaysUntil(prediction.nextCycleDate);

      document.getElementById('statCycleStart').textContent = Calc.formatShort(lastCycle.startDate);
      document.getElementById('statCycleDay').textContent = cycleDay > 0 ? cycleDay : '—';
      document.getElementById('statDaysUntil').textContent = daysUntil > 0 ? daysUntil + ' д' : 'Скоро';
    } else {
      document.getElementById('statCycleStart').textContent = '—';
      document.getElementById('statCycleDay').textContent = '—';
      document.getElementById('statDaysUntil').textContent = '—';
    }
  },

  // ---- Navigation ----

  setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => App.switchScreen(btn.dataset.screen));
    });
  },

  switchScreen(name) {
    App.currentScreen = name;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === name);
    });
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    const statusBar = document.getElementById('statusBar');
    const statsBar = document.getElementById('statsBar');

    if (name === 'calendar') {
      document.getElementById('screenCalendar').classList.add('active');
      statusBar.style.display = '';
      statsBar.style.display = '';
    } else if (name === 'history') {
      document.getElementById('screenHistory').classList.add('active');
      statusBar.style.display = 'none';
      statsBar.style.display = 'none';
      App.renderHistory();
    } else if (name === 'settings') {
      document.getElementById('screenSettings').classList.add('active');
      statusBar.style.display = 'none';
      statsBar.style.display = 'none';
    }
  },

  // ---- Day Modal ----

  setupModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) App.closeModal();
    });
  },

  openDayModal(dateStr) {
    const overlay = document.getElementById('modalOverlay');
    const modalDate = document.getElementById('modalDate');
    const modalActions = document.getElementById('modalActions');

    modalDate.textContent = Calc.formatFull(dateStr);
    modalActions.textContent = '';

    const state = App.dateMap.get(dateStr);

    // Start period button
    const startBtn = App.el('button', 'modal-action modal-action--start');
    const startIcon = App.el('span', 'modal-action__icon', '🔴');
    startBtn.appendChild(startIcon);
    startBtn.appendChild(document.createTextNode(' Начало месячных'));
    startBtn.addEventListener('click', () => App.actionStartPeriod(dateStr));
    if (App.cycles.some(c => c.startDate === dateStr)) startBtn.disabled = true;
    modalActions.appendChild(startBtn);

    // Remove mark button
    if (state && state.type === 'menstruation') {
      const removeBtn = App.el('button', 'modal-action modal-action--remove');
      const removeIcon = App.el('span', 'modal-action__icon', '✕');
      removeBtn.appendChild(removeIcon);
      removeBtn.appendChild(document.createTextNode(' Убрать отметку'));
      removeBtn.addEventListener('click', () => App.actionRemoveMark(dateStr));
      modalActions.appendChild(removeBtn);
    }

    overlay.classList.add('open');
    if (navigator.vibrate) navigator.vibrate(10);
  },

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
  },

  async actionStartPeriod(dateStr) {
    App.closeModal();
    const lastCycle = App.cycles.length > 0 ? App.cycles[App.cycles.length - 1] : null;
    if (lastCycle && dateStr > lastCycle.startDate) {
      const prevPeriodLen = lastCycle.periodLength || App.avgs.avgPeriodLength;
      const prevEnd = lastCycle.endDate || Calc.addDays(lastCycle.startDate, prevPeriodLen - 1);
      await DB.updateCycle(lastCycle.id, {
        endDate: prevEnd,
        periodLength: Calc.diffDays(lastCycle.startDate, prevEnd) + 1
      });
    }

    const prediction = Calc.predictCycle(dateStr, App.avgs.avgCycleLength, App.avgs.avgPeriodLength, App.defaults.ovulationOffset);
    const endDate = prediction.predictedEndDate;
    await DB.addCycle({
      startDate: dateStr,
      endDate: endDate,
      predictedEndDate: prediction.predictedEndDate,
      cycleLength: null,
      periodLength: App.avgs.avgPeriodLength
    });

    await App.saveBackup();
    await App.refresh(dateStr);
    App.showToast('Цикл начат');
  },

  async actionRemoveMark(dateStr) {
    App.closeModal();
    const cycle = App.cycles.find(c => {
      if (c.startDate === dateStr) return true;
      if (c.endDate === dateStr) return true;
      const end = c.endDate || c.predictedEndDate;
      return dateStr >= c.startDate && dateStr <= end;
    });

    if (!cycle) return;

    if (cycle.startDate === dateStr) {
      await DB.deleteCycle(cycle.id);
      App.showToast('Цикл удалён');
    } else if (cycle.endDate === dateStr) {
      await DB.updateCycle(cycle.id, { endDate: null, periodLength: null });
      App.showToast('Отметка убрана');
    }

    await App.saveBackup();
    await App.refresh(dateStr);
  },

  // ---- History ----

  renderHistory() {
    const list = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');
    list.textContent = '';

    if (App.cycles.length === 0) {
      empty.classList.add('visible');
      return;
    }
    empty.classList.remove('visible');

    const sorted = [...App.cycles].reverse();
    sorted.forEach((cycle, idx) => {
      const card = App.el('div', 'history-card');

      const nextCycle = idx > 0 ? sorted[idx - 1] : null;
      const cycleLength = nextCycle ? Calc.diffDays(cycle.startDate, nextCycle.startDate) : null;
      const periodLength = cycle.endDate ? Calc.diffDays(cycle.startDate, cycle.endDate) + 1 : null;

      const info = document.createElement('div');

      const datesDiv = App.el('div', 'history-card__dates');
      datesDiv.appendChild(document.createTextNode(Calc.formatShort(cycle.startDate)));
      datesDiv.appendChild(App.el('span', 'arrow', ' → '));
      datesDiv.appendChild(document.createTextNode(cycle.endDate ? Calc.formatShort(cycle.endDate) : '...'));
      info.appendChild(datesDiv);

      const metaDiv = App.el('div', 'history-card__meta');
      if (cycleLength) metaDiv.appendChild(App.el('span', null, 'Цикл: ' + cycleLength + ' д'));
      if (periodLength) metaDiv.appendChild(App.el('span', null, 'Месячные: ' + periodLength + ' д'));
      info.appendChild(metaDiv);

      const actions = App.el('div', 'history-card__actions');

      const editBtn = App.el('button', 'history-card__btn', '✎');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.openEditModal(cycle);
      });

      const deleteBtn = App.el('button', 'history-card__btn history-card__btn--delete', '✕');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.confirmDelete(cycle.id);
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(info);
      card.appendChild(actions);
      list.appendChild(card);
    });
  },

  confirmDelete(cycleId) {
    App.showConfirm('Удалить этот цикл?', async () => {
      await DB.deleteCycle(cycleId);
      await App.saveBackup();
      await App.refresh();
      App.renderHistory();
      App.showToast('Цикл удалён');
    });
  },

  // ---- Edit Modal ----

  setupEditModal() {
    const overlay = document.getElementById('editModalOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) App.closeEditModal();
    });
    document.getElementById('editCancel').addEventListener('click', App.closeEditModal);
  },

  openEditModal(cycle) {
    const overlay = document.getElementById('editModalOverlay');
    const fields = document.getElementById('editModalFields');
    fields.textContent = '';

    const startField = App.el('div', 'modal__field');
    startField.appendChild(App.el('label', null, 'Начало'));
    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.id = 'editStartDate';
    startInput.value = cycle.startDate;
    startField.appendChild(startInput);
    fields.appendChild(startField);

    const endField = App.el('div', 'modal__field');
    endField.appendChild(App.el('label', null, 'Конец'));
    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.id = 'editEndDate';
    endInput.value = cycle.endDate || '';
    endField.appendChild(endInput);
    fields.appendChild(endField);

    document.getElementById('editSave').onclick = async () => {
      const startDate = document.getElementById('editStartDate').value;
      const endDate = document.getElementById('editEndDate').value || null;

      if (!startDate) return;
      if (endDate && endDate < startDate) {
        App.showToast('Конец не может быть раньше начала');
        return;
      }

      const prediction = Calc.predictCycle(startDate, App.avgs.avgCycleLength, App.avgs.avgPeriodLength, App.defaults.ovulationOffset);
      const newEnd = endDate || prediction.predictedEndDate;
      for (const c of App.cycles) {
        if (c.id === cycle.id) continue;
        if (c.startDate === startDate) {
          App.showToast('Уже есть цикл с этой датой начала');
          return;
        }
        const cPrediction = Calc.predictCycle(c.startDate, App.avgs.avgCycleLength, App.avgs.avgPeriodLength, App.defaults.ovulationOffset);
        const cEnd = c.endDate || cPrediction.predictedEndDate;
        if (!(newEnd < c.startDate || startDate > cEnd)) {
          App.showToast('Даты пересекаются с другим циклом');
          return;
        }
      }

      const pLen = endDate ? Calc.diffDays(startDate, endDate) + 1 : null;
      await DB.updateCycle(cycle.id, {
        startDate,
        endDate,
        periodLength: pLen,
        predictedEndDate: prediction.predictedEndDate
      });
      App.closeEditModal();
      await App.saveBackup();
      await App.refresh(startDate);
      App.renderHistory();
      App.showToast('Сохранено');
    };

    overlay.classList.add('open');
  },

  closeEditModal() {
    document.getElementById('editModalOverlay').classList.remove('open');
  },

  // ---- Settings ----

  setupSettings() {
    const cycleLengthSlider = document.getElementById('cycleLengthSlider');
    const periodLengthSlider = document.getElementById('periodLengthSlider');
    const cycleLengthValue = document.getElementById('cycleLengthValue');
    const periodLengthValue = document.getElementById('periodLengthValue');

    cycleLengthSlider.value = App.defaults.cycleLength;
    cycleLengthValue.textContent = App.defaults.cycleLength;
    periodLengthSlider.value = App.defaults.periodLength;
    periodLengthValue.textContent = App.defaults.periodLength;

    cycleLengthSlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value);
      cycleLengthValue.textContent = val;
      await DB.setSetting('defaultCycleLength', val);
      App.defaults.cycleLength = val;
      await App.saveBackup();
      await App.refresh();
    });

    periodLengthSlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value);
      periodLengthValue.textContent = val;
      await DB.setSetting('defaultPeriodLength', val);
      App.defaults.periodLength = val;
      await App.saveBackup();
      await App.refresh();
    });

    const ovulationOffsetSlider = document.getElementById('ovulationOffsetSlider');
    const ovulationOffsetValue = document.getElementById('ovulationOffsetValue');
    const ovulationOffsetHint = document.getElementById('ovulationOffsetHint');

    const updateOffsetHint = (val) => {
      if (val < 0) ovulationOffsetHint.textContent = `на ${Math.abs(val)} дн. раньше`;
      else if (val > 0) ovulationOffsetHint.textContent = `на ${val} дн. позже`;
      else ovulationOffsetHint.textContent = 'по расчёту';
    };

    ovulationOffsetSlider.value = App.defaults.ovulationOffset;
    ovulationOffsetValue.textContent = App.defaults.ovulationOffset;
    updateOffsetHint(App.defaults.ovulationOffset);

    ovulationOffsetSlider.addEventListener('input', async (e) => {
      const val = parseInt(e.target.value);
      ovulationOffsetValue.textContent = val;
      updateOffsetHint(val);
      await DB.setSetting('ovulationOffset', val);
      App.defaults.ovulationOffset = val;
      await App.saveBackup();
      await App.refresh();
    });

    document.getElementById('btnExport').addEventListener('click', async () => {
      const data = await DB.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'red-alert-backup-' + Calc.today() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      App.showToast('Данные экспортированы');
    });

    const importFile = document.getElementById('importFile');
    document.getElementById('btnImport').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await DB.importData(text);
        await App.saveBackup();
        await App.refresh();
        App.showToast('Данные импортированы');
      } catch (err) {
        App.showToast('Ошибка: неверный формат файла');
      }
      importFile.value = '';
    });

    document.getElementById('btnEmailStats').addEventListener('click', () => App.sendEmailStats());

    document.getElementById('btnReset').addEventListener('click', () => {
      App.showConfirm('Удалить все данные?', () => {
        App.showConfirm('Точно удалить ВСЕ данные?', async () => {
          await DB.clearAll();
          App.clearBackup();
          App.defaults = { cycleLength: 28, periodLength: 5, ovulationOffset: 0 };
          cycleLengthSlider.value = 28;
          cycleLengthValue.textContent = '28';
          periodLengthSlider.value = 5;
          periodLengthValue.textContent = '5';
          await App.refresh();
          App.showToast('Все данные удалены');
        });
      });
    });
  },

  // ---- Refresh ----

  async refresh(targetDate) {
    await App.loadData();
    App.setupCalendar(targetDate);
    App.updateStatusBar();
    App.updateStats();
  },

  // ---- Email Stats ----

  sendEmailStats() {
    if (App.cycles.length === 0) {
      App.showToast('Нет данных для отправки');
      return;
    }

    const sorted = [...App.cycles].reverse();
    let body = 'Red Alert — Статистика\n\n';
    body += 'Ср. цикл: ' + App.avgs.avgCycleLength + ' дн.\n';
    body += 'Ср. месячные: ' + App.avgs.avgPeriodLength + ' дн.\n\n';

    sorted.forEach((cycle, idx) => {
      const nextCycle = idx > 0 ? sorted[idx - 1] : null;
      const cycleLen = nextCycle ? Calc.diffDays(cycle.startDate, nextCycle.startDate) : null;
      const periodLen = cycle.endDate ? Calc.diffDays(cycle.startDate, cycle.endDate) + 1 : null;

      let line = Calc.formatShortWithYear(cycle.startDate);
      if (periodLen) line += ' | Месячные: ' + periodLen + ' дн.';
      if (cycleLen) line += ' | Цикл: ' + cycleLen + ' дн.';
      body += line + '\n';
    });

    const subject = encodeURIComponent('Red Alert — Статистика');
    const encodedBody = encodeURIComponent(body);
    window.location.href = 'mailto:?subject=' + subject + '&body=' + encodedBody;
  },

  // ---- Toast ----

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  },

  // ---- Confirm Dialog ----

  showConfirm(message, onConfirm) {
    const overlay = App.el('div', 'confirm-overlay open');
    const dialog = App.el('div', 'confirm-dialog');
    dialog.appendChild(App.el('div', 'confirm-dialog__text', message));

    const buttons = App.el('div', 'confirm-dialog__buttons');
    const cancelBtn = App.el('button', 'confirm-dialog__cancel', 'Отмена');
    cancelBtn.addEventListener('click', () => overlay.remove());
    const confirmBtn = App.el('button', 'confirm-dialog__confirm', 'Удалить');
    confirmBtn.addEventListener('click', () => { overlay.remove(); onConfirm(); });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  },

  // ---- Service Worker ----

  registerSW() {
    if ('serviceWorker' in navigator) {
      let isFirstInstall = !navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && !isFirstInstall) {
              App.showUpdateToast();
            }
          });
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!isFirstInstall) App.showUpdateToast();
        isFirstInstall = false;
      });
    }
  },

  showUpdateToast() {
    const toast = document.getElementById('toast');
    toast.textContent = '';
    toast.appendChild(document.createTextNode('Доступно обновление '));
    const btn = App.el('button', 'toast-btn', 'Обновить');
    btn.addEventListener('click', () => location.reload());
    toast.appendChild(btn);
    toast.classList.add('visible');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
