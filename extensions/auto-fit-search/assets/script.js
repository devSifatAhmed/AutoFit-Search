(function () {
  document.addEventListener("autoFitSearch:initialized", function (event) {
    initializeAutoFitSearch(event.detail || {});
  });

  Object.values(window.autoFitSearchWidgets || {}).forEach((config) => {
    initializeAutoFitSearch(config);
  });

  function initializeAutoFitSearch(detail) {
    const allFields = Array.isArray(detail.fields)
      ? detail.fields
      : window.fields || [];
    const rows = Array.isArray(detail.rows) ? detail.rows : window.rows || [];
    const widget = findWidget(detail.blockId);

    if (!widget || widget.dataset.autofitInitialized === "true") {
      return;
    }

    widget.dataset.autofitInitialized = "true";

    const enableHistory =
      detail.enableHistory === true ||
      detail.enableHistory === "true" ||
      widget.dataset.enableHistory === "true";
    const orderedFields = allFields
      .filter((field) => field.visibility === "VISIBLE")
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    const state = {};
    const fieldElements = {};
    const searchBtn = widget.querySelector(".autofit-w-search");
    const clearBtn = widget.querySelector(".autofit-w-clear");
    const historyStorageKeys = buildHistoryStorageKeys(detail.blockId);
    const historyInstanceId = [
      detail.blockId || "default",
      Date.now(),
      Math.random().toString(36).slice(2),
    ].join(":");

    orderedFields.forEach((field) => {
      state[field.key] = null;
      fieldElements[field.key] = findFieldSelect(widget, field);
    });

    restoreHistoryState();

    function findWidget(blockId) {
      const widgets = Array.from(
        document.querySelectorAll('[data-section-type="auto-fit-search"]'),
      );

      if (!blockId) {
        return widgets[0] || null;
      }

      return (
        widgets.find((candidate) => candidate.dataset.blockId === blockId) ||
        null
      );
    }

    function findFieldSelect(root, field) {
      return (
        Array.from(root.querySelectorAll("select")).find(
          (select) => select.name === field.key,
        ) || null
      );
    }

    function slugify(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
    }

    function normalizeValue(value) {
      return String(value || "").trim().toLowerCase();
    }

    function isIntegerLike(value) {
      return value !== null && value !== "" && Number.isInteger(Number(value));
    }

    function hasSelection(field) {
      return state[field.key] !== null && state[field.key] !== "";
    }

    function getRowValue(row, fieldKey) {
      const rowValue = (row.values || []).find(
        (value) => value.key === fieldKey,
      );
      return rowValue?.value;
    }

    function rowMatchesField(row, field, selectedValue) {
      if (selectedValue === null || selectedValue === "") {
        return true;
      }

      if (field.type === "RANGE") {
        const year = Number(selectedValue);
        return (
          Number.isInteger(year) &&
          Number(row.startYear) <= year &&
          Number(row.endYear) >= year
        );
      }

      return (
        normalizeValue(getRowValue(row, field.key)) ===
        normalizeValue(selectedValue)
      );
    }

    function sortValues(values, sortOrder = "A_Z") {
      const sortedValues = [...values];

      switch (sortOrder) {
        case "A_Z":
          return sortedValues.sort((a, b) =>
            String(a).localeCompare(String(b)),
          );
        case "Z_A":
          return sortedValues.sort((a, b) =>
            String(b).localeCompare(String(a)),
          );
        case "ASC":
          return sortedValues.sort((a, b) => Number(a) - Number(b));
        case "DESC":
          return sortedValues.sort((a, b) => Number(b) - Number(a));
        default:
          return sortedValues;
      }
    }

    function getAvailableOptions(targetField) {
      const targetFieldIndex = orderedFields.findIndex(
        (field) => field.key === targetField.key,
      );
      const activeFilters = orderedFields
        .slice(0, targetFieldIndex)
        .filter(hasSelection);
      const matchedRows = rows.filter((row) =>
        activeFilters.every((field) =>
          rowMatchesField(row, field, state[field.key]),
        ),
      );

      if (targetField.type === "RANGE") {
        const rangeStart = isIntegerLike(targetField.rangeStart)
          ? Number(targetField.rangeStart)
          : -Infinity;
        const rangeEnd = isIntegerLike(targetField.rangeEnd)
          ? Number(targetField.rangeEnd)
          : Infinity;
        const rangeSet = new Set();

        matchedRows.forEach((row) => {
          const startYear = Math.max(Number(row.startYear), rangeStart);
          const endYear = Math.min(Number(row.endYear), rangeEnd);

          for (let year = startYear; year <= endYear; year += 1) {
            rangeSet.add(year);
          }
        });

        return sortValues([...rangeSet], "DESC");
      }

      return sortValues(
        [
          ...new Set(
            matchedRows
              .map((row) => getRowValue(row, targetField.key))
              .filter(Boolean),
          ),
        ],
        targetField.sortOrder,
      );
    }

    function populateSelect(select, values, field) {
      if (!select) {
        return;
      }

      select.innerHTML = "";

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.disabled = true;
      defaultOption.selected = true;
      defaultOption.textContent = field.placeholder || `Select ${field.label}`;
      select.appendChild(defaultOption);

      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    }

    function refreshUI() {
      orderedFields.forEach((field, index) => {
        const select = fieldElements[field.key];

        if (!select) {
          return;
        }

        const options = getAvailableOptions(field);
        populateSelect(select, options, field);

        const selectedValue = state[field.key];
        const hasSelectedOption = options.some(
          (option) => String(option) === String(selectedValue),
        );

        if (hasSelectedOption) {
          select.value = selectedValue;
        } else if (selectedValue !== null) {
          state[field.key] = null;
          clearDownstreamSelections(index);
        }

        select.disabled =
          index > 0 && !hasSelection(orderedFields[index - 1]);
      });

      const allFilled =
        orderedFields.length > 0 && orderedFields.every(hasSelection);

      if (searchBtn) {
        searchBtn.disabled = !allFilled;
      }
    }

    function updateSelection(field, value) {
      state[field.key] = value;

      const changedIndex = orderedFields.findIndex(
        (candidate) => candidate.key === field.key,
      );

      clearDownstreamSelections(changedIndex);
      refreshUI();
      persistHistoryState();
    }

    function clearDownstreamSelections(changedIndex) {
      for (
        let index = changedIndex + 1;
        index < orderedFields.length;
        index += 1
      ) {
        state[orderedFields[index].key] = null;
      }
    }

    function buildProductTagUrl() {
      const selectedFilters = orderedFields
        .filter(hasSelection)
        .map((field) => {
          const fieldKey = field.key || slugify(field.label) || field.id;
          const valueKey = slugify(state[field.key]);

          if (!fieldKey || !valueKey) {
            return null;
          }

          return `autofit_${fieldKey}_${valueKey}`;
        })
        .filter(Boolean);

      return buildUrlWithHistoryParams(
        `/collections/all/${selectedFilters.join("+")}`,
      );
    }

    function redirectToCollection(row) {
      const attachment = (row.attachments || []).find(
        (candidate) => candidate.handle,
      );

      if (!attachment?.handle) {
        console.warn("AutoFit Search collection row is missing a handle.", row);
        return false;
      }

      window.location.href = buildUrlWithHistoryParams(
        `/collections/${attachment.handle}`,
      );
      return true;
    }

    function performSearch() {
      persistHistoryState();

      const matchedRows = rows.filter((row) =>
        orderedFields.every((field) =>
          rowMatchesField(row, field, state[field.key]),
        ),
      );
      const collectionRow = matchedRows.find(
        (row) => row.attachmentMode === "COLLECTION",
      );

      if (collectionRow) {
        redirectToCollection(collectionRow);
        return;
      }

      window.location.href = buildProductTagUrl();
    }

    function clearFilters() {
      orderedFields.forEach((field) => {
        state[field.key] = null;
      });
      refreshUI();
      clearHistoryState();
    }

    function buildHistoryStorageKeys(blockId) {
      const fieldSignature =
        orderedFields.map((field) => field.key).filter(Boolean).join("|") ||
        "fields";
      const host = window.location.hostname || "storefront";

      return {
        shared: ["autofit-search", host, "shared", fieldSignature].join(":"),
        widget: [
          "autofit-search",
          host,
          "widget",
          blockId || "default",
          fieldSignature,
        ].join(":"),
        legacy: [
          "autofit-search",
          window.location.pathname,
          blockId || "default",
        ].join(":"),
      };
    }

    function getHistoryParamName(field) {
      return `autofit_${field.key}`;
    }

    function normalizeHistoryValue(field, value) {
      if (value === null || value === "") {
        return null;
      }

      if (field.type === "RANGE") {
        return isIntegerLike(value) ? Number(value) : null;
      }

      return String(value);
    }

    function getSelectedHistoryState() {
      return orderedFields.reduce((snapshot, field) => {
        if (hasSelection(field)) {
          snapshot[field.key] = state[field.key];
        }

        return snapshot;
      }, {});
    }

    function readUrlHistoryState() {
      const params = new URLSearchParams(window.location.search);
      const snapshot = {};
      let hasHistory = false;

      orderedFields.forEach((field) => {
        const paramName = getHistoryParamName(field);

        if (!params.has(paramName)) {
          return;
        }

        snapshot[field.key] = normalizeHistoryValue(
          field,
          params.get(paramName),
        );
        hasHistory = true;
      });

      return hasHistory ? snapshot : null;
    }

    function readStoredHistoryState() {
      const storageKeys = [
        historyStorageKeys.shared,
        historyStorageKeys.widget,
        historyStorageKeys.legacy,
      ];

      for (const storageKey of storageKeys) {
        try {
          const storedValue = window.sessionStorage.getItem(storageKey);
          const parsedValue = storedValue ? JSON.parse(storedValue) : null;

          if (!parsedValue || typeof parsedValue !== "object") {
            continue;
          }

          return parsedValue;
        } catch {
          // Keep trying other storage scopes.
        }
      }

      return null;
    }

    function restoreHistoryState() {
      if (!enableHistory) {
        return;
      }

      const snapshot = readUrlHistoryState() || readStoredHistoryState();

      if (!snapshot) {
        return;
      }

      applyHistorySnapshot(snapshot, { clearMissing: false });
    }

    function persistHistoryState() {
      if (!enableHistory) {
        return;
      }

      const snapshot = getSelectedHistoryState();
      const hasHistory = Object.keys(snapshot).length > 0;

      try {
        [historyStorageKeys.shared, historyStorageKeys.widget].forEach(
          (storageKey) => {
            if (hasHistory) {
              window.sessionStorage.setItem(
                storageKey,
                JSON.stringify(snapshot),
              );
              return;
            }

            window.sessionStorage.removeItem(storageKey);
          },
        );
        window.sessionStorage.removeItem(historyStorageKeys.legacy);
      } catch {
        // Storage can be blocked; URL state still keeps history working.
      }

      dispatchHistoryChange(snapshot);
    }

    function clearHistoryState() {
      if (!enableHistory) {
        return;
      }

      try {
        Object.values(historyStorageKeys).forEach((storageKey) => {
          window.sessionStorage.removeItem(storageKey);
        });
      } catch {
        // Ignore storage failures.
      }

      replaceUrlHistoryState({});
      dispatchHistoryChange({});
    }

    function applyHistorySnapshot(snapshot, { clearMissing }) {
      orderedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(snapshot, field.key)) {
          state[field.key] = normalizeHistoryValue(field, snapshot[field.key]);
          return;
        }

        if (clearMissing) {
          state[field.key] = null;
        }
      });
    }

    function dispatchHistoryChange(snapshot) {
      document.dispatchEvent(
        new CustomEvent("autoFitSearch:historyChanged", {
          detail: {
            sourceId: historyInstanceId,
            scope: historyStorageKeys.shared,
            snapshot,
          },
        }),
      );
    }

    function buildUrlWithHistoryParams(path) {
      const url = new URL(path, window.location.origin);
      writeSnapshotToUrlParams(url, getSelectedHistoryState());

      return `${url.pathname}${url.search}${url.hash}`;
    }

    function replaceUrlHistoryState(snapshot) {
      if (!window.history?.replaceState) {
        return;
      }

      const url = new URL(window.location.href);
      writeSnapshotToUrlParams(url, snapshot);

      window.history.replaceState(window.history.state, "", url.toString());
    }

    function writeSnapshotToUrlParams(url, snapshot) {
      orderedFields.forEach((field) => {
        url.searchParams.delete(getHistoryParamName(field));
      });

      Object.entries(snapshot).forEach(([fieldKey, value]) => {
        if (value !== null && value !== "") {
          url.searchParams.set(`autofit_${fieldKey}`, String(value));
        }
      });
    }

    document.addEventListener("autoFitSearch:historyChanged", (event) => {
      const historyDetail = event.detail || {};

      if (
        historyDetail.sourceId === historyInstanceId ||
        historyDetail.scope !== historyStorageKeys.shared ||
        !historyDetail.snapshot
      ) {
        return;
      }

      applyHistorySnapshot(historyDetail.snapshot, { clearMissing: true });
      refreshUI();
    });

    orderedFields.forEach((field) => {
      const select = fieldElements[field.key];

      if (!select) {
        return;
      }

      select.addEventListener("change", (changeEvent) => {
        const rawValue = changeEvent.target.value;
        const value =
          rawValue === ""
            ? null
            : field.type === "RANGE"
              ? Number(rawValue)
              : rawValue;

        updateSelection(field, value);
      });
    });

    if (searchBtn) {
      searchBtn.addEventListener("click", performSearch);
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", clearFilters);
    }

    refreshUI();

    persistHistoryState();
  }
})();
