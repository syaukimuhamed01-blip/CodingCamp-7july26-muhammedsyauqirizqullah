(() => {
  "use strict";

  /* ---------- Storage keys ---------- */
  const STORAGE_TX = "ledger.transactions";
  const STORAGE_CATEGORIES = "ledger.categories";
  const STORAGE_THEME = "ledger.theme";

  /* ---------- Default categories & colors ---------- */
  const DEFAULT_CATEGORIES = {
    Food: "var(--cat-food)",
    Transport: "var(--cat-transport)",
    Fun: "var(--cat-fun)"
  };
  const CUSTOM_COLOR_CYCLE = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)"];

  /* ---------- DOM references ---------- */
  const form = document.getElementById("transactionForm");
  const itemNameInput = document.getElementById("itemName");
  const itemAmountInput = document.getElementById("itemAmount");
  const itemCategorySelect = document.getElementById("itemCategory");
  const formError = document.getElementById("formError");

  const totalBalanceEl = document.getElementById("totalBalance");
  const entryCountEl = document.getElementById("entryCount");

  const transactionListEl = document.getElementById("transactionList");
  const listEmptyEl = document.getElementById("listEmpty");
  const sortSelect = document.getElementById("sortSelect");

  const chartEmptyEl = document.getElementById("chartEmpty");
  const chartLegendEl = document.getElementById("chartLegend");
  const chartCanvas = document.getElementById("categoryChart");

  const themeToggle = document.getElementById("themeToggle");

  /* ---------- State ---------- */
  let transactions = loadTransactions();
  let categories = loadCategories();
  let chartInstance = null;

  /* ==========================================================================
     Persistence helpers
     ========================================================================== */

  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_TX);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("Could not read transactions from Local Storage", e);
      return [];
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_TX, JSON.stringify(transactions));
  }

  function loadCategories() {
    try {
      const raw = localStorage.getItem(STORAGE_CATEGORIES);
      const stored = raw ? JSON.parse(raw) : {};
      return { ...DEFAULT_CATEGORIES, ...stored };
    } catch (e) {
      console.warn("Could not read categories from Local Storage", e);
      return { ...DEFAULT_CATEGORIES };
    }
  }

  function saveCategories() {
    // Only persist categories beyond the defaults.
    const custom = {};
    Object.keys(categories).forEach((key) => {
      if (!(key in DEFAULT_CATEGORIES)) custom[key] = categories[key];
    });
    localStorage.setItem(STORAGE_CATEGORIES, JSON.stringify(custom));
  }

  /* ==========================================================================
     Category handling (Optional Challenge: custom categories)
     ========================================================================== */

  function colorForCategory(name) {
    if (categories[name]) return categories[name];
    return "var(--ink-faint)";
  }

  function renderCategoryOptions() {
    const currentValue = itemCategorySelect.value;
    itemCategorySelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.textContent = "Choose category";
    itemCategorySelect.appendChild(placeholder);

    Object.keys(categories).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      itemCategorySelect.appendChild(opt);
    });

    const addNew = document.createElement("option");
    addNew.value = "__new__";
    addNew.textContent = "+ Add new category…";
    itemCategorySelect.appendChild(addNew);

    if (currentValue && categories[currentValue]) {
      itemCategorySelect.value = currentValue;
    } else {
      placeholder.selected = true;
    }
  }

  itemCategorySelect.addEventListener("change", () => {
    if (itemCategorySelect.value !== "__new__") return;

    const name = (prompt("Name your new category:") || "").trim();
    if (!name) {
      itemCategorySelect.value = "";
      return;
    }
    if (categories[name]) {
      itemCategorySelect.value = name;
      return;
    }

    const usedCount = Object.keys(categories).length - Object.keys(DEFAULT_CATEGORIES).length;
    categories[name] = CUSTOM_COLOR_CYCLE[usedCount % CUSTOM_COLOR_CYCLE.length];
    saveCategories();
    renderCategoryOptions();
    itemCategorySelect.value = name;
  });

  /* ==========================================================================
     Form submission
     ========================================================================== */

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = itemNameInput.value.trim();
    const amountRaw = itemAmountInput.value;
    const amount = parseFloat(amountRaw);
    const category = itemCategorySelect.value;

    const isValid =
      name.length > 0 &&
      amountRaw !== "" &&
      !Number.isNaN(amount) &&
      amount > 0 &&
      category &&
      category !== "__new__";

    if (!isValid) {
      formError.hidden = false;
      return;
    }
    formError.hidden = true;

    transactions.push({
      id: Date.now() + Math.random().toString(16).slice(2),
      name,
      amount,
      category,
      createdAt: Date.now()
    });

    saveTransactions();
    form.reset();
    itemCategorySelect.value = "";
    render();
    itemNameInput.focus();
  });

  [itemNameInput, itemAmountInput, itemCategorySelect].forEach((el) => {
    el.addEventListener("input", () => {
      if (!formError.hidden) formError.hidden = true;
    });
  });

  /* ==========================================================================
     Delete transaction
     ========================================================================== */

  function deleteTransaction(id) {
    transactions = transactions.filter((tx) => tx.id !== id);
    saveTransactions();
    render();
  }

  /* ==========================================================================
     Sorting (Optional Challenge: sort by amount / category)
     ========================================================================== */

  function getSortedTransactions() {
    const mode = sortSelect.value;
    const list = [...transactions];

    switch (mode) {
      case "amount-desc":
        return list.sort((a, b) => b.amount - a.amount);
      case "amount-asc":
        return list.sort((a, b) => a.amount - b.amount);
      case "category":
        return list.sort((a, b) => a.category.localeCompare(b.category) || b.createdAt - a.createdAt);
      case "newest":
      default:
        return list.sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  sortSelect.addEventListener("change", renderTransactionList);

  /* ==========================================================================
     Rendering: total balance
     ========================================================================== */

  function formatNumber(value) {
    return Math.round(value).toLocaleString("id-ID");
  }

  function renderBalance() {
    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    totalBalanceEl.textContent = formatNumber(total);
    entryCountEl.textContent = `${transactions.length} ${transactions.length === 1 ? "entry" : "entries"} recorded`;
  }

  /* ==========================================================================
     Rendering: transaction list
     ========================================================================== */

  function renderTransactionList() {
    transactionListEl.innerHTML = "";
    const sorted = getSortedTransactions();

    listEmptyEl.hidden = sorted.length > 0;

    sorted.forEach((tx) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = "tx-dot";
      dot.style.background = colorForCategory(tx.category);

      const main = document.createElement("div");
      main.className = "tx-main";

      const nameEl = document.createElement("p");
      nameEl.className = "tx-name";
      nameEl.textContent = tx.name;

      const catEl = document.createElement("p");
      catEl.className = "tx-category";
      catEl.textContent = tx.category;

      main.appendChild(nameEl);
      main.appendChild(catEl);

      const amountEl = document.createElement("span");
      amountEl.className = "tx-amount";
      amountEl.textContent = `Rp${formatNumber(tx.amount)}`;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "tx-delete";
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", `Delete ${tx.name}`);
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", () => deleteTransaction(tx.id));

      li.appendChild(dot);
      li.appendChild(main);
      li.appendChild(amountEl);
      li.appendChild(deleteBtn);
      transactionListEl.appendChild(li);
    });
  }

  /* ==========================================================================
     Rendering: pie chart
     ========================================================================== */

  function getCategoryTotals() {
    const totals = {};
    transactions.forEach((tx) => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    });
    return totals;
  }

  function resolveCssColor(value) {
    // Resolve a "var(--x)" token to its actual computed color for Chart.js.
    if (!value.startsWith("var(")) return value;
    const varName = value.slice(4, -1).trim();
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function renderChart() {
    const totals = getCategoryTotals();
    const labels = Object.keys(totals);
    const data = labels.map((l) => totals[l]);
    const colors = labels.map((l) => resolveCssColor(colorForCategory(l)));

    chartEmptyEl.hidden = labels.length > 0;
    chartCanvas.style.visibility = labels.length > 0 ? "visible" : "hidden";

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = data;
      chartInstance.data.datasets[0].backgroundColor = colors;
      chartInstance.update();
    } else if (labels.length > 0 && window.Chart) {
      chartInstance = new Chart(chartCanvas.getContext("2d"), {
        type: "pie",
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderColor: resolveCssColor("var(--paper)"),
            borderWidth: 2
          }]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: Rp${formatNumber(ctx.parsed)}`
              }
            }
          }
        }
      });
    }

    renderLegend(labels, colors, totals);
  }

  function renderLegend(labels, colors, totals) {
    chartLegendEl.innerHTML = "";
    labels.forEach((label, i) => {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = colors[i];
      const text = document.createElement("span");
      text.textContent = `${label} · Rp${formatNumber(totals[label])}`;
      li.appendChild(swatch);
      li.appendChild(text);
      chartLegendEl.appendChild(li);
    });
  }

  /* ==========================================================================
     Theme toggle (Optional Challenge: dark / light mode)
     ========================================================================== */

  function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_THEME, theme);
    // Border color for chart segments depends on --paper, so refresh it.
    if (chartInstance) {
      chartInstance.data.datasets[0].borderColor = resolveCssColor("var(--paper)");
      chartInstance.update();
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.contains("dark");
    applyTheme(isDark ? "light" : "dark");
  });

  /* ==========================================================================
     Master render
     ========================================================================== */

  function render() {
    renderBalance();
    renderTransactionList();
    renderChart();
  }

  /* ==========================================================================
     Init
     ========================================================================== */

  initTheme();
  renderCategoryOptions();
  render();
})();
