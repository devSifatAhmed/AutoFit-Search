function normalizeValue(value) {
    return String(value || "").trim().toLowerCase();
}

function getRowValueMap(row) {
    return new Map(row.values.map((value) => [value.key, value.value]));
}

function rowMatchesYear(row, year) {
    if (!year) {
        return true;
    }

    const numericYear = Number(year);
    return row.startYear <= numericYear && row.endYear >= numericYear;
}

function rowMatchesFilters(row, filters) {
    const valueMap = getRowValueMap(row);

    return Object.entries(filters || {}).every(([fieldKey, value]) => {
        if (!value) {
            return true;
        }

        return normalizeValue(valueMap.get(fieldKey)) === normalizeValue(value);
    });
}

export function getMatchingRows(config, { year, filters = {} }) {
    return (config?.rows || []).filter((row) => rowMatchesYear(row, year) && rowMatchesFilters(row, filters));
}

export function getAvailableOptions(config, { year, filters = {} }) {
    const fields = (config?.fields || []).filter((field) => field.type === "SELECT");
    const availableOptions = {};

    for (const field of fields) {
        const priorFilters = {};

        for (const candidateField of fields) {
            if (candidateField.position >= field.position) {
                break;
            }

            if (filters[candidateField.key]) {
                priorFilters[candidateField.key] = filters[candidateField.key];
            }
        }

        const rows = getMatchingRows(config, {
            year,
            filters: priorFilters,
        });

        const values = Array.from(new Set(
            rows
                .map((row) => getRowValueMap(row).get(field.key))
                .filter(Boolean),
        ));

        availableOptions[field.key] = values.sort((left, right) => left.localeCompare(right));
    }

    return availableOptions;
}

export function getSearchResults(config, { year, filters = {} }) {
    const rows = getMatchingRows(config, { year, filters });

    return rows.map((row) => ({
        rowId: row.id,
        attachmentMode: row.attachmentMode,
        attachments: row.attachments,
    }));
}
