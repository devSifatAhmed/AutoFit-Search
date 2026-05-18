function normalizeValue(value) {
    return String(value || "").trim().toLowerCase();
}

function getOrderedFields(config) {
    return (config?.fields || [])
        .filter((field) => field.visibility !== "HIDDEN")
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
}

function getRowValueMap(row) {
    return new Map((row.values || []).map((value) => [value.key, value.value]));
}

function getRowRangeValueMap(row, fields) {
    const rangeValueMap = new Map((row.rangeValues || []).map((rangeValue) => [
        rangeValue.key,
        {
            minValue: Number(rangeValue.minValue),
            maxValue: Number(rangeValue.maxValue),
        },
    ]));

    if (rangeValueMap.size === 0 && row.startYear !== null && row.startYear !== undefined && row.endYear !== null && row.endYear !== undefined) {
        const legacyRangeField = fields.find((field) => field.type === "RANGE" && (field.key === "year" || field.label?.toLowerCase() === "year"))
            || fields.find((field) => field.type === "RANGE");

        if (legacyRangeField) {
            rangeValueMap.set(legacyRangeField.key, {
                minValue: Number(row.startYear),
                maxValue: Number(row.endYear),
            });
        }
    }

    return rangeValueMap;
}

function normalizeRanges(config, { year, ranges = {} }) {
    const normalizedRanges = { ...(ranges || {}) };

    if (year !== undefined && year !== null && year !== "") {
        const fields = getOrderedFields(config);
        const yearField = fields.find((field) => field.type === "RANGE" && (field.key === "year" || field.label?.toLowerCase() === "year"))
            || fields.find((field) => field.type === "RANGE");

        if (yearField && normalizedRanges[yearField.key] === undefined) {
            normalizedRanges[yearField.key] = year;
        }
    }

    return normalizedRanges;
}

function rowMatchesRanges(row, fields, ranges) {
    const rangeValueMap = getRowRangeValueMap(row, fields);

    return Object.entries(ranges || {}).every(([fieldKey, value]) => {
        if (value === null || value === undefined || value === "") {
            return true;
        }

        const numericValue = Number(value);
        const rangeValue = rangeValueMap.get(fieldKey);

        return Number.isInteger(numericValue)
            && rangeValue
            && rangeValue.minValue <= numericValue
            && rangeValue.maxValue >= numericValue;
    });
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

function sortOptions(values, sortOrder = "A_Z") {
    const sortedValues = [...values];

    switch (sortOrder) {
        case "Z_A":
            return sortedValues.sort((left, right) => String(right).localeCompare(String(left)));
        case "ASC":
            return sortedValues.sort((left, right) => Number(left) - Number(right));
        case "DESC":
            return sortedValues.sort((left, right) => Number(right) - Number(left));
        default:
            return sortedValues.sort((left, right) => String(left).localeCompare(String(right)));
    }
}

function getRangeOptions(rows, fields, field) {
    const lowerBound = Number.isInteger(Number(field.rangeStart)) ? Number(field.rangeStart) : -Infinity;
    const upperBound = Number.isInteger(Number(field.rangeEnd)) ? Number(field.rangeEnd) : Infinity;
    const options = new Set();

    for (const row of rows) {
        const rangeValue = getRowRangeValueMap(row, fields).get(field.key);

        if (!rangeValue) {
            continue;
        }

        const minValue = Math.max(rangeValue.minValue, lowerBound);
        const maxValue = Math.min(rangeValue.maxValue, upperBound);

        for (let value = minValue; value <= maxValue; value += 1) {
            options.add(value);
        }
    }

    return sortOptions([...options], "DESC");
}

export function getMatchingRows(config, { year, ranges = {}, filters = {} }) {
    const fields = getOrderedFields(config);
    const normalizedRanges = normalizeRanges(config, { year, ranges });

    return (config?.rows || []).filter((row) => (
        rowMatchesRanges(row, fields, normalizedRanges)
        && rowMatchesFilters(row, filters)
    ));
}

export function getAvailableOptions(config, { year, ranges = {}, filters = {} }) {
    const fields = getOrderedFields(config);
    const normalizedRanges = normalizeRanges(config, { year, ranges });
    const availableOptions = {};

    for (const field of fields) {
        const priorFilters = {};
        const priorRanges = {};

        for (const candidateField of fields) {
            if (candidateField.position >= field.position) {
                break;
            }

            if (candidateField.type === "RANGE") {
                if (normalizedRanges[candidateField.key] !== undefined) {
                    priorRanges[candidateField.key] = normalizedRanges[candidateField.key];
                }
                continue;
            }

            if (filters[candidateField.key]) {
                priorFilters[candidateField.key] = filters[candidateField.key];
            }
        }

        const rows = getMatchingRows(config, {
            ranges: priorRanges,
            filters: priorFilters,
        });

        if (field.type === "RANGE") {
            availableOptions[field.key] = getRangeOptions(rows, fields, field);
            continue;
        }

        const values = Array.from(new Set(
            rows
                .map((row) => getRowValueMap(row).get(field.key))
                .filter(Boolean),
        ));

        availableOptions[field.key] = sortOptions(values, field.sortOrder);
    }

    return availableOptions;
}

export function getSearchResults(config, { year, ranges = {}, filters = {} }) {
    const rows = getMatchingRows(config, { year, ranges, filters });

    return rows.map((row) => ({
        rowId: row.id,
        attachmentMode: row.attachmentMode,
        attachments: row.attachments,
    }));
}
