document.addEventListener("autoFitSearch:initialized", function (e) {
  // ======================================================
  // AUTO FIT SEARCH ENGINE (FULLY DYNAMIC)
  // Production-Ready Cascading YMM Filter System
  // ======================================================

  // ------------------------------------------------------
  // FIELDS & ROWS
  // ------------------------------------------------------

  const fields = window.fields || [];
  const rows = window.rows || [];

  // ------------------------------------------------------
  // ORDERED FIELDS (by position)
  // ------------------------------------------------------

  const orderedFields = [...fields].sort((a, b) => a.position - b.position);

  // ------------------------------------------------------
  // STATE (dynamic initialization from fields)
  // ------------------------------------------------------

  const state = {};
  fields.forEach((f) => (state[f.key] = null));

  // ------------------------------------------------------
  // ELEMENTS (dynamic from fields)
  // ------------------------------------------------------

  const fieldElements = {};
  fields.forEach((f) => {
    fieldElements[f.key] = document.querySelector(`select[name="${f.key}"]`);
  });

  const searchBtn = document.querySelector("#autofit-w-search");
  const clearBtn = document.querySelector("#autofit-w-clear");

  // ======================================================
  // SORTER
  // ======================================================

  function sortValues(values, sortOrder = "A_Z") {
    switch (sortOrder) {
      case "A_Z":
        return values.sort((a, b) => String(a).localeCompare(String(b)));
      case "Z_A":
        return values.sort((a, b) => String(b).localeCompare(String(a)));
      case "ASC":
        return values.sort((a, b) => a - b);
      case "DESC":
        return values.sort((a, b) => b - a);
      default:
        return values;
    }
  }

  // ======================================================
  // GET OPTIONS (dynamic)
  // ======================================================

  function getAvailableOptions(targetKey) {
    const targetFieldIndex = orderedFields.findIndex(
      (f) => f.key === targetKey,
    );

    // previous selected filters only
    const activeFilters = orderedFields
      .slice(0, targetFieldIndex)
      .filter((f) => state[f.key]);

    // filter matching rows
    const matchedRows = rows.filter((row) =>
      activeFilters.every((f) =>
        row.values.some((v) => v.key === f.key && v.value === state[f.key]),
      ),
    );

    const fieldType = orderedFields.find((f) => f.key === targetKey)?.type;

    // RANGE FIELD
    if (fieldType === "RANGE") {
      const rangeSet = new Set();
      matchedRows.forEach((row) => {
        for (let y = row.startYear; y <= row.endYear; y++) {
          rangeSet.add(y);
        }
      });
      return sortValues([...rangeSet], "DESC");
    }

    // NORMAL SELECT FIELD
    const values = [
      ...new Set(
        matchedRows.flatMap((row) =>
          row.values.filter((v) => v.key === targetKey).map((v) => v.value),
        ),
      ),
    ];

    const field = orderedFields.find((f) => f.key === targetKey);
    return sortValues(values, field?.sortOrder);
  }

  // ======================================================
  // POPULATE SELECT
  // ======================================================

  function populateSelect(select, values, placeholder) {
    if (!select) return;

    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = placeholder;
    select.appendChild(defaultOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  // ======================================================
  // REFRESH UI (fully dynamic)
  // ======================================================

  function refreshUI() {
    orderedFields.forEach((f, index) => {
      const el = fieldElements[f.key];
      if (!el) return;

      const options = getAvailableOptions(f.key);
      populateSelect(el, options, `Select ${f.label}`);

      // disable if previous field not selected
      el.disabled = index > 0 && !state[orderedFields[index - 1].key];

      if (state[f.key]) el.value = state[f.key];
    });

    // Enable search button only if all required fields have values
    const allFilled = orderedFields.every((f) => state[f.key]);
    if (searchBtn) searchBtn.disabled = !allFilled;
  }

  // ======================================================
  // UPDATE SELECTION (fully dynamic)
  // ======================================================

  function updateSelection(key, value) {
    state[key] = value || null;

    const changedIndex = orderedFields.findIndex((f) => f.key === key);
    // Clear all downstream selections
    for (let i = changedIndex + 1; i < orderedFields.length; i++) {
      state[orderedFields[i].key] = null;
    }

    refreshUI();
    console.log("STATE:", state);
  }

  // ======================================================
  // SEARCH (dynamic keys, builds URL from state)
  // ======================================================

  async function performSearch() {
    // 1️⃣ Filter matching rows dynamically
    const matchedRows = rows.filter((row) =>
      orderedFields.every((f) => {
        const val = state[f.key];
        if (!val) return true; // skip unselected
        return row.values.some((v) => v.key === f.key && v.value === val);
      }),
    );

    // 2️⃣ Check if any collection row exists
    const collectionRow = matchedRows.find(
      (row) => row.attachmentMode === "COLLECTION",
    );

    if (collectionRow && collectionRow.attachments.length > 0) {
      const collectionGid = collectionRow.attachments[0].id;

      try {
        // 3️⃣ Query Shopify Storefront API for the collection handle
        const query = `
                query getCollectionHandle($id: ID!) {
                    collection(id: $id) {
                        handle
                    }
                }
            `;
        const variables = { id: collectionGid };

        const response = await fetch("/api/2023-07/graphql.json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ query, variables }),
        });

        const data = await response.json();
        const handle = data?.data?.collection?.handle;

        if (handle) {
          // ✅ Redirect to the collection handle
          window.location.href = `/collections/${handle}`;
          return; // exit so autofit URL is not built
        } else {
          console.warn(
            "Collection handle not found. Falling back to autofit URL.",
          );
        }
      } catch (error) {
        console.error("Error fetching collection handle:", error);
      }
    }

    // 4️⃣ Else (or fallback): build autofit URL for products
    const selectedFilters = [];
    for (const key in state) {
      const value = state[key];
      if (value !== null && value !== "") {
        selectedFilters.push(
          `autofit_${encodeURIComponent(key)}_${encodeURIComponent(value)}`,
        );
      }
    }

    const url = `/collections/all/${selectedFilters.join("+")}`;
    window.location.href = url.toLowerCase();
  }

  // ======================================================
  // CLEAR FILTERS
  // ======================================================

  function clearFilters() {
    for (const key in state) state[key] = null;
    refreshUI();
  }

  // ======================================================
  // EVENTS (dynamic attachment for all fields)
  // ======================================================

  orderedFields.forEach((f) => {
    const el = fieldElements[f.key];
    if (!el) return;

    el.addEventListener("change", (e) => {
      const val = f.type === "RANGE" ? Number(e.target.value) : e.target.value;
      updateSelection(f.key, val);
    });
  });

  if (searchBtn) searchBtn.addEventListener("click", performSearch);
  if (clearBtn) clearBtn.addEventListener("click", clearFilters);

  // ======================================================
  // INIT
  // ======================================================

  refreshUI();
});
