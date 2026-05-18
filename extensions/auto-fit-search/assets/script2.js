(function () {
    document.addEventListener("autoFitSearch:initialized", function (event) {
        initializeWidget(event.detail || {});
    });

    document.addEventListener("autoFitSearch:renderWidgets", function (event) {
        renderInjectedWidgets(event.detail || {});
    });

    Object.values(window.autoFitWidgetConfigs || {}).forEach(renderInjectedWidgets);
    Object.values(window.autoFitSearchWidgets || {}).forEach(initializeWidget);

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }

        callback();
    }

    function renderInjectedWidgets(config) {
        if (config.widgetType !== "injectable") {
            return;
        }

        onReady(function () {
            findInjectionTargets(config.selector).forEach(function (target, index) {
                var injectionId = (config.blockId || "autofit-injected") + "_" + index;

                if (target.querySelector('[data-autofit-injection-id="' + injectionId + '"]')) {
                    return;
                }

                var widget = buildInjectedWidget(config, injectionId);

                if (config.injectionPosition === "prepend") {
                    target.prepend(widget);
                } else {
                    target.appendChild(widget);
                }

                initializeWidget(Object.assign({}, config, { blockId: injectionId }));
            });
        });
    }

    function findInjectionTargets(selector) {
        var rawSelector = String(selector || "").trim();

        if (!rawSelector) {
            return [];
        }

        var directMatches = queryAll(rawSelector);

        if (directMatches.length > 0 || looksLikeSelector(rawSelector)) {
            return directMatches;
        }

        return queryAll("#" + escapeSelector(rawSelector) + ", ." + escapeSelector(rawSelector));
    }

    function queryAll(selector) {
        try {
            return Array.from(document.querySelectorAll(selector));
        } catch (error) {
            return [];
        }
    }

    function looksLikeSelector(value) {
        return /^[#.[*:>+~]/.test(value) || value.includes(" ");
    }

    function escapeSelector(value) {
        return window.CSS && window.CSS.escape
            ? window.CSS.escape(value)
            : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    function getOrderedVisibleFields(fields) {
        return (fields || [])
            .filter(function (field) {
                return field.visibility === "VISIBLE";
            })
            .sort(function (left, right) {
                return Number(left.position || 0) - Number(right.position || 0);
            });
    }

    function appendPlaceholder(select, field) {
        var option = document.createElement("option");

        option.value = "";
        option.disabled = true;
        option.selected = true;
        option.textContent = field.placeholder || "Select " + field.label;
        select.appendChild(option);
    }

    function buildInjectedWidget(config, blockId) {
        var prefix = "autofit-w";
        var fields = getOrderedVisibleFields(config.fields || []);
        var wrapper = document.createElement("div");

        wrapper.id = "autofit-search-widget_" + blockId;
        wrapper.dataset.sectionType = "auto-fit-search";
        wrapper.dataset.blockId = blockId;
        wrapper.dataset.enableHistory = String(config.enableHistory === true);
        wrapper.dataset.autofitInjectionId = blockId;
        wrapper.className = "auto-fit-search-widget is-injected " + (config.textAlignment || "center");

        if (config.enableContainer) {
            wrapper.style.setProperty("--" + prefix + "-container-max-width", (config.containerMaxWidth || 1200) + "px");
            wrapper.style.setProperty("--" + prefix + "-container-padding", "0 " + (config.containerPadding || 20) + "px");
        }

        var container = document.createElement("div");
        container.className = prefix + "-container";
        wrapper.appendChild(container);

        if (config.heading || config.description) {
            var header = document.createElement("div");
            header.className = prefix + "-header";
            container.appendChild(header);

            if (config.heading) {
                var heading = document.createElement("h1");
                heading.className = prefix + "-heading";
                heading.textContent = config.heading;
                header.appendChild(heading);
            }

            if (config.description) {
                var description = document.createElement("div");
                description.className = prefix + "-description rte";
                description.innerHTML = config.description;
                header.appendChild(description);
            }
        }

        var formWrapper = document.createElement("div");
        formWrapper.className = prefix + "-form__wrapper";
        container.appendChild(formWrapper);

        var form = document.createElement("form");
        form.id = blockId + "-form";
        form.className = prefix + "-form";
        form.style.setProperty("--grid-cols", String(fields.length));
        formWrapper.appendChild(form);

        var fieldWrapper = document.createElement("div");
        fieldWrapper.className = prefix + "-fields";
        form.appendChild(fieldWrapper);

        fields.forEach(function (field, index) {
            var fieldElement = document.createElement("div");
            fieldElement.className = prefix + "-field";
            fieldElement.dataset.index = String(index);
            fieldElement.dataset.fieldName = field.label || field.key || "";
            fieldWrapper.appendChild(fieldElement);

            var select = document.createElement("select");
            select.name = field.key;
            select.id = field.id + "_" + blockId;
            select.className = prefix + "-select";
            select.required = true;
            select.disabled = true;
            fieldElement.appendChild(select);

            appendPlaceholder(select, field);
        });

        var buttonField = document.createElement("div");
        buttonField.className = prefix + "-field";
        buttonField.dataset.fieldName = "buttons";
        fieldWrapper.appendChild(buttonField);

        var searchButton = document.createElement("button");
        searchButton.type = "button";
        searchButton.className = prefix + "-search";
        searchButton.id = prefix + "-search_" + blockId;
        searchButton.textContent = config.searchButtonLabel || "Search";
        buttonField.appendChild(searchButton);

        var clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.className = prefix + "-clear";
        clearButton.id = prefix + "-clear_" + blockId;
        clearButton.textContent = config.clearButtonLabel || "Clear filters";
        buttonField.appendChild(clearButton);

        return wrapper;
    }

    function initializeWidget(config) {
        var fields = Array.isArray(config.fields) ? config.fields : window.fields || [];
        var rows = Array.isArray(config.rows) ? config.rows : window.rows || [];
        var widget = findWidget(config.blockId);

        if (!widget || widget.dataset.autofitInitialized === "true") {
            return;
        }

        widget.dataset.autofitInitialized = "true";

        var orderedFields = getOrderedVisibleFields(fields);
        var state = {};
        var selects = {};
        var searchButton = widget.querySelector(".autofit-w-search");
        var clearButton = widget.querySelector(".autofit-w-clear");
        var enableHistory = config.enableHistory === true
            || config.enableHistory === "true"
            || widget.dataset.enableHistory === "true";
        var storageKeys = getStorageKeys(config.blockId, orderedFields);
        var sourceId = [config.blockId || "default", Date.now(), Math.random().toString(36).slice(2)].join(":");

        orderedFields.forEach(function (field) {
            state[field.key] = null;
            selects[field.key] = findSelect(widget, field);
        });

        restoreHistory();

        orderedFields.forEach(function (field) {
            var select = selects[field.key];

            if (!select) {
                return;
            }

            select.addEventListener("change", function (event) {
                updateField(field, parseSelectedValue(field, event.target.value));
            });
        });

        if (searchButton) {
            searchButton.addEventListener("click", runSearch);
        }

        if (clearButton) {
            clearButton.addEventListener("click", clearSearch);
        }

        renderOptions();
        persistHistory();

        document.addEventListener("autoFitSearch:historyChanged", function (event) {
            var detail = event.detail || {};

            if (detail.sourceId === sourceId || !detail.snapshot) {
                return;
            }

            if (!detail.resetAll && detail.scope !== storageKeys.shared) {
                return;
            }

            applySnapshot(detail.snapshot, { clearMissing: true });
            renderOptions();
        });

        function findWidget(blockId) {
            var widgets = Array.from(document.querySelectorAll('[data-section-type="auto-fit-search"]'));

            return blockId
                ? widgets.find(function (candidate) {
                    return candidate.dataset.blockId === blockId;
                }) || null
                : widgets[0] || null;
        }

        function findSelect(root, field) {
            return Array.from(root.querySelectorAll("select")).find(function (select) {
                return select.name === field.key;
            }) || null;
        }

        function hasValue(field) {
            return state[field.key] !== null && state[field.key] !== "" && state[field.key] !== undefined;
        }

        function getRowValueMap(row) {
            return new Map((row.values || []).map(function (value) {
                return [value.key, value.value];
            }));
        }

        function getRowRangeValueMap(row) {
            var rangeValueMap = new Map((row.rangeValues || []).map(function (rangeValue) {
                return [
                    rangeValue.key,
                    {
                        minValue: Number(rangeValue.minValue),
                        maxValue: Number(rangeValue.maxValue)
                    }
                ];
            }));

            if (rangeValueMap.size === 0 && row.startYear !== null && row.startYear !== undefined && row.endYear !== null && row.endYear !== undefined) {
                var legacyRangeField = orderedFields.find(function (field) {
                    return field.type === "RANGE" && (field.key === "year" || String(field.label || "").toLowerCase() === "year");
                }) || orderedFields.find(function (field) {
                    return field.type === "RANGE";
                });

                if (legacyRangeField) {
                    rangeValueMap.set(legacyRangeField.key, {
                        minValue: Number(row.startYear),
                        maxValue: Number(row.endYear)
                    });
                }
            }

            return rangeValueMap;
        }

        function normalize(value) {
            return String(value || "").trim().toLowerCase();
        }

        function slugify(value) {
            return String(value || "")
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .replace(/_+/g, "_");
        }

        function isIntegerValue(value) {
            return value !== null && value !== "" && Number.isInteger(Number(value));
        }

        function rowMatchesField(row, field, selectedValue) {
            if (selectedValue === null || selectedValue === "" || selectedValue === undefined) {
                return true;
            }

            if (field.type === "RANGE") {
                var rangeValue = getRowRangeValueMap(row).get(field.key);
                var numericValue = Number(selectedValue);

                return Number.isInteger(numericValue)
                    && rangeValue
                    && rangeValue.minValue <= numericValue
                    && rangeValue.maxValue >= numericValue;
            }

            return normalize(getRowValueMap(row).get(field.key)) === normalize(selectedValue);
        }

        function sortOptions(values, sortOrder) {
            var sortedValues = [].concat(values);

            switch (sortOrder) {
                case "Z_A":
                    return sortedValues.sort(function (left, right) {
                        return String(right).localeCompare(String(left));
                    });
                case "ASC":
                    return sortedValues.sort(function (left, right) {
                        return Number(left) - Number(right);
                    });
                case "DESC":
                    return sortedValues.sort(function (left, right) {
                        return Number(right) - Number(left);
                    });
                default:
                    return sortedValues.sort(function (left, right) {
                        return String(left).localeCompare(String(right));
                    });
            }
        }

        function getOptions(field) {
            var fieldIndex = orderedFields.findIndex(function (candidate) {
                return candidate.key === field.key;
            });
            var priorFields = orderedFields.slice(0, fieldIndex).filter(hasValue);
            var candidateRows = rows.filter(function (row) {
                return priorFields.every(function (priorField) {
                    return rowMatchesField(row, priorField, state[priorField.key]);
                });
            });

            if (field.type === "RANGE") {
                return getRangeOptions(candidateRows, field);
            }

            return sortOptions(Array.from(new Set(candidateRows.map(function (row) {
                return getRowValueMap(row).get(field.key);
            }).filter(Boolean))), field.sortOrder);
        }

        function getRangeOptions(candidateRows, field) {
            var lowerBound = isIntegerValue(field.rangeStart) ? Number(field.rangeStart) : -Infinity;
            var upperBound = isIntegerValue(field.rangeEnd) ? Number(field.rangeEnd) : Infinity;
            var options = new Set();
            var maxOptions = 2500;

            candidateRows.forEach(function (row) {
                var rangeValue = getRowRangeValueMap(row).get(field.key);

                if (!rangeValue) {
                    return;
                }

                var minValue = Math.max(Number(rangeValue.minValue), lowerBound);
                var maxValue = Math.min(Number(rangeValue.maxValue), upperBound);

                for (var value = minValue; value <= maxValue && options.size < maxOptions; value += 1) {
                    options.add(value);
                }
            });

            return sortOptions(Array.from(options), "DESC");
        }

        function appendPlaceholder(select, field) {
            var option = document.createElement("option");

            option.value = "";
            option.disabled = true;
            option.selected = true;
            option.textContent = field.placeholder || "Select " + field.label;
            select.appendChild(option);
        }

        function populateSelect(select, options, field) {
            if (!select) {
                return;
            }

            select.innerHTML = "";
            appendPlaceholder(select, field);

            options.forEach(function (optionValue) {
                var option = document.createElement("option");

                option.value = optionValue;
                option.textContent = optionValue;
                select.appendChild(option);
            });
        }

        function renderOptions() {
            orderedFields.forEach(function (field, index) {
                var select = selects[field.key];

                if (!select) {
                    return;
                }

                var options = getOptions(field);
                var currentValue = state[field.key];

                populateSelect(select, options, field);

                var matchedOption = options.find(function (optionValue) {
                    return String(optionValue) === String(currentValue)
                        || (field.type !== "RANGE" && slugify(optionValue) === slugify(currentValue));
                });

                if (matchedOption !== undefined) {
                    state[field.key] = matchedOption;
                    select.value = matchedOption;
                } else if (currentValue !== null && currentValue !== "") {
                    state[field.key] = null;
                    resetAfter(index);
                }

                select.disabled = index > 0 && !hasValue(orderedFields[index - 1]);
            });

            if (searchButton) {
                searchButton.disabled = orderedFields.length === 0 || !orderedFields.every(hasValue);
            }
        }

        function updateField(field, value) {
            state[field.key] = value;
            resetAfter(orderedFields.findIndex(function (candidate) {
                return candidate.key === field.key;
            }));
            renderOptions();
            persistHistory();
        }

        function resetAfter(index) {
            for (var nextIndex = index + 1; nextIndex < orderedFields.length; nextIndex += 1) {
                state[orderedFields[nextIndex].key] = null;
            }
        }

        function parseSelectedValue(field, value) {
            if (value === "") {
                return null;
            }

            return field.type === "RANGE" && isIntegerValue(value)
                ? Number(value)
                : value;
        }

        function getSelectedSnapshot() {
            return orderedFields.reduce(function (snapshot, field) {
                if (hasValue(field)) {
                    snapshot[field.key] = state[field.key];
                }

                return snapshot;
            }, {});
        }

        function buildProductUrl() {
            var tags = orderedFields.filter(hasValue).map(function (field) {
                var key = field.key || slugify(field.label) || field.id;
                var value = slugify(state[field.key]);

                return key && value ? "autofit_" + key + "_" + value : null;
            }).filter(Boolean);

            return "/collections/all/" + tags.join("+");
        }

        function redirectToCollection(row) {
            var attachment = (row.attachments || []).find(function (candidate) {
                return candidate.handle;
            });

            if (!attachment || !attachment.handle) {
                return false;
            }

            window.location.href = "/collections/" + attachment.handle;
            return true;
        }

        function runSearch() {
            persistHistory();

            var matchedCollectionRow = rows.filter(function (row) {
                return orderedFields.every(function (field) {
                    return rowMatchesField(row, field, state[field.key]);
                });
            }).find(function (row) {
                return row.attachmentMode === "COLLECTION";
            });

            if (matchedCollectionRow && redirectToCollection(matchedCollectionRow)) {
                return;
            }

            window.location.href = buildProductUrl();
        }

        function clearSearch() {
            orderedFields.forEach(function (field) {
                state[field.key] = null;
            });
            renderOptions();
            clearHistory();
        }

        function getStorageKeys(blockId, activeFields) {
            var fieldScope = activeFields.map(function (field) {
                return field.key;
            }).filter(Boolean).join("|") || "fields";
            var host = window.location.hostname || "storefront";

            return {
                shared: ["autofit-search", host, "shared", fieldScope].join(":"),
                widget: ["autofit-search", host, "widget", blockId || "default", fieldScope].join(":")
            };
        }

        function readTagSnapshot() {
            var pathParts = window.location.pathname.split("/").filter(Boolean);

            if (pathParts[0] !== "collections" || pathParts.length < 3) {
                return null;
            }

            var tags = decodeURIComponent(pathParts.slice(2).join("/")).split("+").filter(Boolean);
            var snapshot = {};
            var found = false;

            orderedFields.forEach(function (field) {
                var tagPrefix = "autofit_" + field.key + "_";
                var matchedTag = tags.find(function (tag) {
                    return tag.indexOf(tagPrefix) === 0;
                });

                if (!matchedTag) {
                    return;
                }

                snapshot[field.key] = parseSelectedValue(field, matchedTag.slice(tagPrefix.length));
                found = true;
            });

            return found ? snapshot : null;
        }

        function readStoredSnapshot() {
            return [storageKeys.shared, storageKeys.widget].reduce(function (snapshot, key) {
                if (snapshot) {
                    return snapshot;
                }

                try {
                    var storedValue = window.sessionStorage.getItem(key);
                    var parsedValue = storedValue ? JSON.parse(storedValue) : null;

                    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
                } catch (error) {
                    return null;
                }
            }, null);
        }

        function restoreHistory() {
            if (!enableHistory) {
                return;
            }

            var snapshot = readTagSnapshot() || readStoredSnapshot();

            if (snapshot) {
                applySnapshot(snapshot, { clearMissing: false });
            }
        }

        function applySnapshot(snapshot, options) {
            orderedFields.forEach(function (field) {
                if (Object.prototype.hasOwnProperty.call(snapshot, field.key)) {
                    state[field.key] = parseSelectedValue(field, snapshot[field.key]);
                    return;
                }

                if (options.clearMissing) {
                    state[field.key] = null;
                }
            });
        }

        function persistHistory() {
            if (!enableHistory) {
                return;
            }

            var snapshot = getSelectedSnapshot();
            var hasSnapshot = Object.keys(snapshot).length > 0;

            try {
                [storageKeys.shared, storageKeys.widget].forEach(function (key) {
                    if (hasSnapshot) {
                        window.sessionStorage.setItem(key, JSON.stringify(snapshot));
                        return;
                    }

                    window.sessionStorage.removeItem(key);
                });
            } catch (error) {
                // Ignore storage failures in restricted browser contexts.
            }

            broadcastHistory(snapshot);
        }

        function clearHistory() {
            if (!enableHistory) {
                return;
            }

            try {
                Object.values(storageKeys).forEach(function (key) {
                    window.sessionStorage.removeItem(key);
                });
            } catch (error) {
                // Ignore storage failures in restricted browser contexts.
            }

            replaceCurrentUrl();
            broadcastHistory({});
        }

        function broadcastHistory(snapshot) {
            document.dispatchEvent(new CustomEvent("autoFitSearch:historyChanged", {
                detail: {
                    sourceId: sourceId,
                    scope: storageKeys.shared,
                    snapshot: snapshot,
                    resetAll: Object.keys(snapshot).length === 0
                }
            }));
        }

        function replaceCurrentUrl() {
            if (!window.history || !window.history.replaceState) {
                return;
            }

            window.history.replaceState(
                window.history.state,
                "",
                window.location.pathname.replace(/^(\/collections\/[^/]+)\/.+/, "$1")
            );
        }
    }
})();
