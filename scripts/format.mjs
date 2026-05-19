#!/bin/env node

import path from "path";
import { fileURLToPath, URL } from "url";
import crypto from "crypto";
import fs from "fs/promises";
import { spawn } from "child_process";

function CDToRoot() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	process.chdir(__dirname);
	process.chdir("..");
}

function exec(what) {
	return new Promise(resolve => {
		const child = spawn(what, { stdio: "inherit", shell: true });
		child.on("close", resolve);
	});
}

async function getPNGMeta(path) {
	const buffer = await fs.readFile(path);

	// Check PNG signature
	if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])))
		return undefined;

	const hash = crypto.createHash("sha256");
	hash.update(buffer);

	return {
		width: buffer.readUInt32BE(16),
		height: buffer.readUInt32BE(20),
		SHA256: hash.digest("hex")
	};
}

async function getMagicBytes(path) {
	const buffer = await fs.readFile(path);
	let out = "";
	for (let i = 0; i < 16; ++i) {
		if (
			(buffer[i] >= "A".charCodeAt(0) && buffer[i] <= "Z".charCodeAt(0)) ||
			(buffer[i] >= "a".charCodeAt(0) && buffer[i] <= "z".charCodeAt(0)) ||
			(buffer[i] >= "0".charCodeAt(0) && buffer[i] <= "9".charCodeAt(0)) ||
			(buffer[i] === "-".charCodeAt(0) || buffer[i] === "_".charCodeAt(0))
		) out += String.fromCharCode(buffer[i]);
	}
	return out ?? "???";
}

async function exists(path) {
	try {
		await fs.access(path);
		return true;
	} catch (e) {
		return false;
	}
}

CDToRoot();

let CIFailed = false;
const noEdit = process.argv[2] === "--noedit";
function CIError(msg) {
	console.error(msg);
	CIFailed = true;
}
async function CIErrorFixable(msg, fix) {
	if (noEdit) {
		console.warn(msg + " (fixable)");
		CIFailed = true;
	} else {
		console.error(msg + " (fixed)");
		await fix();
	}
}

// Verify schema
const verifyResult = await exec(`
	npx --yes \
	ajv-cli validate -s scripts/schema.json -d custom-communities-ddnet-info.json \
	--all-errors --changes=js --errors=js
`);
if (verifyResult !== 0)
	CIFailed = true;

// Format
let dataRaw = await fs.readFile("custom-communities-ddnet-info.json", "utf8");
const data = JSON.parse(dataRaw);
let dataFormatted = JSON.stringify(data, undefined, "\t") + "\n";
if (dataRaw !== dataFormatted) {
	await CIErrorFixable("JSON not formatted as standard JSON", async () => {
		await fs.writeFile("custom-communities-ddnet-info.json", dataFormatted);
	});
	dataRaw = dataFormatted;
}

// Get server data
class IsUnqiue {
	constructor() {
		const data = new Set();
		return item => {
			if (data.has(item))
				return false;
			data.add(item);
			return true;
		}
	}
}
const IsIPUnique = new IsUnqiue();
const IsNameUnique = new IsUnqiue();
const IsIDUnique = new IsUnqiue();

const gamemodes = new Set();

function verifyFlagRegion(name, flag) {
	return true; // TODO
}

async function getServerData() {
	let data;
	data = await fetch("https://info.ddnet.org/info");
	data = await data.json();
	for (const {id: ID, name, icon: { servers }} of data.communities) {
		if (ID.toLowerCase() !== ID)
			console.warn(`Non lower case ID in master: ${ID}`);
		if (!IsIDUnique(ID))
			console.warn(`Non unqiue ID in master: ${ID}`);
		if (!IsNameUnique(name))
			console.warn(`Non unqiue name in master: ${name}`);
		if (!servers)
			continue;
		for (const server of servers) {
			if (!verifyFlagRegion(server.name, server.flagId))
				console.warn(`Invalid flag region in master: ${server.name} ${server.flagId}`);
			for (const [gamemode, IPs] of Object.entries(server.servers)) {
				gamemodes.add(gamemode);
				for (const IP of IPs) {
					if (!IsIPUnique(IP))
						console.warn(`Non unique IP in master: ${IP}`);
				}
			}
		}
	}
}
await getServerData();

async function iconsToLowerCase() {
	for (const file of await fs.readdir("icons")) {
		const lower = file.toLowerCase();
		if (file !== lower) {
			const oldPath = path.join("icons", file);
			const newPath = path.join("icons", lower);
			await CIErrorFixable(`Warn icon not lower case: ${oldPath}`, async () => await fs.rename(oldPath, newPath));
		}
	}
}
await iconsToLowerCase();

async function verifyLocalData() {
	for (const community of data.communities) {
		const {id: ID, name, icon: { servers, sha256: iconSHA256, url: iconURL }, has_finishes: hasFinishes, contact_urls: contactURLs} = community;
		if (ID.toLowerCase() !== ID)
			await CIErrorFixable(`Non lower case ID: ${ID}`, () => community.id = ID.toLowerCase());
		if (!IsIDUnique(ID))
			CIError(`Non unqiue ID: ${ID}`);
		if (!IsNameUnique(name))
			CIError(`Non unqiue name: ${name}`);
		if (servers) {
			for (const server of servers) {
				if (!verifyFlagRegion(server.name, server.flagId))
					CIError(`Invalid flag region: ${server.name} ${server.flagId}`);
				for (const [gamemode, IPs] of Object.entries(server.servers)) {
					gamemodes.add(gamemode);
					for (const IP of IPs) {
						if (!IsIPUnique(IP))
							CIError(`Non unique IP: ${IP}`);
					}
				}
			}
		} else {
			CIError(`Empty servers: ${ID}`);
		}
		// Extra verification for local
		if (hasFinishes)
			await CIErrorFixable(`Community has finishes: ${ID}`, () => community.has_finishes = false);
		for (const contactURL of contactURLs) {
			try {
				const parsed = new URL(contactURL);
				if (parsed.protocol !== "https:")
					CIError(`Contact URL not HTTPS: ${contactURL}`);
			} catch (e) {
				CIError(`Invalid URL: ${contactURL}`);
			}
		}
		const PREFIX = "https://raw.githubusercontent.com/TaterClient/ddnet-custom-communities/refs/heads/main/icons/";
		if (iconURL.startsWith(PREFIX)) {
			const iconName = iconURL.slice(PREFIX.length);
			if (iconName.toLowerCase() !== iconName)
				await CIErrorFixable(`Icon name not lowercase: ${iconName}`, () => community.icon.url = PREFIX + iconName.toLowerCase());
			const iconPath = `./icons/${iconName}`;
			if (await exists(iconPath)) {
				const PNGMeta = await getPNGMeta(iconPath);
				if (PNGMeta) {
					const { width, height, SHA256 } = PNGMeta;
					if (width !== 128 || height !== 64)
						CIError(`Icon is ${width}x${height} not 128x64: ${iconPath}`);
					if (SHA256 !== iconSHA256) {
						await CIErrorFixable(`Icon SHA256 should be ${SHA256}: ${iconPath}`, () => community.icon.sha256 = SHA256);
					}
				} else {
					CIError(`Can't read icon meta, is this a PNG? Magic bytes are ${await getMagicBytes(iconPath)}: ${iconPath}`);
				}
			} else {
				CIError(`Can't read icon: ${iconPath}`);
			}
		} else {
			CIError(`Invalid icon URL (case sensitive): ${iconURL}`);
		}
	}
}
await verifyLocalData();

if (!noEdit) {
	dataFormatted = JSON.stringify(data, undefined, "\t") + "\n";
	if (dataRaw !== dataFormatted) {
		console.log("Edited JSON");
		await fs.writeFile("custom-communities-ddnet-info.json", dataFormatted);
	}
}

if (CIFailed) {
	console.error("Failed!");
	process.exit(1);
}
