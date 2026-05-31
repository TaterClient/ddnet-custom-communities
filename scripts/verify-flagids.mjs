#!/bin/env node

import fs from "fs/promises";

const DDNET_INDEX_URL = "https://raw.githubusercontent.com/ddnet/ddnet/refs/heads/master/data/countryflags/index.txt";
const ISO_3166_CSV_URL = "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.csv";

// DDNet and legacy aliases that appear in community data.
const CODE_ALIASES = {
	EUR: "EU",
	GER: "DE"
};

function parseCSVLine(line) {
	const out = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === "," && !inQuotes) {
			out.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	out.push(current);
	return out;
}

function parseDDNetIndex(indexText) {
	const lines = indexText
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0 && !line.startsWith("#####") && !line.startsWith("#"));

	const codeToFlagId = new Map();
	let pendingCode;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith("==")) {
			if (!pendingCode)
				continue;

			let value = line.slice(2).trim();
			if (value.length === 0 && i + 1 < lines.length)
				value = lines[++i];

			const parsed = Number.parseInt(value, 10);
			if (Number.isFinite(parsed))
				codeToFlagId.set(pendingCode, parsed);

			pendingCode = undefined;
			continue;
		}

		pendingCode = line.toUpperCase();
	}

	return codeToFlagId;
}

function parseIsoCodeMaps(csvText) {
	const lines = csvText.split(/\r?\n/).filter(Boolean);
	if (lines.length === 0)
		return { alpha2ToAlpha3: new Map(), alpha3ToAlpha2: new Map() };

	const header = parseCSVLine(lines[0]);
	const alpha2Index = header.indexOf("alpha-2");
	const alpha3Index = header.indexOf("alpha-3");

	if (alpha2Index === -1 || alpha3Index === -1)
		throw new Error("Could not find alpha-2/alpha-3 columns in ISO CSV.");

	const alpha2ToAlpha3 = new Map();
	const alpha3ToAlpha2 = new Map();
	for (let i = 1; i < lines.length; i++) {
		const row = parseCSVLine(lines[i]);
		const alpha2 = (row[alpha2Index] ?? "").toUpperCase().trim();
		const alpha3 = (row[alpha3Index] ?? "").toUpperCase().trim();
		if (alpha2.length === 2 && alpha3.length === 3) {
			alpha2ToAlpha3.set(alpha2, alpha3);
			alpha3ToAlpha2.set(alpha3, alpha2);
		}
	}

	return { alpha2ToAlpha3, alpha3ToAlpha2 };
}

function resolveDDNetCode(inputCode, alpha3ToAlpha2, DDNetCodeToFlagId) {
	const code = String(inputCode ?? "").toUpperCase().trim();
	if (code.length === 0)
		return undefined;

	const aliased = CODE_ALIASES[code] ?? code;
	if (DDNetCodeToFlagId.has(aliased))
		return aliased;

	if (/^[A-Z]{3}$/.test(aliased))
		return alpha3ToAlpha2.get(aliased);

	return undefined;
}

function buildFlagIdToDDNetCodes(DDNetCodeToFlagId) {
	const flagIdToDDNetCodes = new Map();
	for (const [DDNetCode, flagId] of DDNetCodeToFlagId.entries()) {
		if (!flagIdToDDNetCodes.has(flagId))
			flagIdToDDNetCodes.set(flagId, []);
		flagIdToDDNetCodes.get(flagId).push(DDNetCode);
	}

	for (const DDNetCodes of flagIdToDDNetCodes.values())
		DDNetCodes.sort();

	return flagIdToDDNetCodes;
}

function DDNetCodeToCommunityCode(DDNetCode, alpha2ToAlpha3) {
	if (!DDNetCode)
		return undefined;
	if (DDNetCode === "EU")
		return "EUR";
	if (/^[A-Z]{2}$/.test(DDNetCode))
		return alpha2ToAlpha3.get(DDNetCode) ?? DDNetCode;
	return DDNetCode;
}

function recommendCodeForFlagId(flagId, flagIdToDDNetCodes, alpha2ToAlpha3) {
	const DDNetCodes = flagIdToDDNetCodes.get(flagId);
	if (!DDNetCodes || DDNetCodes.length === 0)
		return undefined;

	for (const DDNetCode of DDNetCodes) {
		const communityCode = DDNetCodeToCommunityCode(DDNetCode, alpha2ToAlpha3);
		if (communityCode)
			return communityCode;
	}

	return DDNetCodes[0];
}

const [DDNetIndex, isoCSV] = await Promise.all([
	fetch(DDNET_INDEX_URL).then(async response => {
		if (!response.ok)
			throw new Error(`Could not fetch DDNet country index: HTTP ${response.status}`);
		return response.text();
	}),
	fetch(ISO_3166_CSV_URL).then(async response => {
		if (!response.ok)
			throw new Error(`Could not fetch ISO CSV: HTTP ${response.status}`);
		return response.text();
	})
]);

const DDNetCodeToFlagId = parseDDNetIndex(DDNetIndex);
const { alpha2ToAlpha3, alpha3ToAlpha2 } = parseIsoCodeMaps(isoCSV);
const flagIdToDDNetCodes = buildFlagIdToDDNetCodes(DDNetCodeToFlagId);

const data = JSON.parse(await fs.readFile("custom-communities-ddnet-info.json", "utf8"));
let hasErrors = false;

for (const community of data.communities) {
	const servers = community.icon?.servers ?? [];
	for (const server of servers) {
		const code = String(server.name ?? "").toUpperCase();
		const flagId = Number(server.flagId);
		const knownFlagId = flagIdToDDNetCodes.has(flagId);
		const DDNetCode = resolveDDNetCode(code, alpha3ToAlpha2, DDNetCodeToFlagId);
		const expectedFlagId = DDNetCode ? DDNetCodeToFlagId.get(DDNetCode) : undefined;

		if (expectedFlagId === undefined) {
			if (knownFlagId) {
				const recommendedCode = recommendCodeForFlagId(flagId, flagIdToDDNetCodes, alpha2ToAlpha3) ?? "<unknown>";
				console.error(
					`Unknown server country/region code: ${community.id}/${server.name}. Use code ${recommendedCode} for flagId ${flagId}`
				);
			} else {
				console.error(`Unknown server country/region code: ${community.id}/${server.name}`);
			}
			hasErrors = true;
			continue;
		}

		if (flagId !== expectedFlagId) {
			if (!knownFlagId) {
				console.error(
					`Invalid flag mapping for ${community.id}/${server.name}: got ${flagId}, expected ${expectedFlagId} (DDNet code ${DDNetCode}). Use flagId ${expectedFlagId}`
				);
			} else {
				const recommendedCode = recommendCodeForFlagId(flagId, flagIdToDDNetCodes, alpha2ToAlpha3) ?? "<unknown>";
				console.error(
					`Invalid flag mapping for ${community.id}/${server.name}: got ${flagId}, expected ${expectedFlagId} (DDNet code ${DDNetCode}). Use flagId ${flagId} for code ${recommendedCode}`
				);
			}
			hasErrors = true;
		}
	}
}

if (hasErrors) {
	process.exit(1);
}

console.log("FlagId validation passed.");
