import bedrock from "bedrock-protocol";
import { readFileSync } from "node:fs";

const CONFIG = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const bedrockModule = bedrock as unknown as {
	createClient?: (options: Record<string, unknown>) => any;
	default?: { createClient?: (options: Record<string, unknown>) => any };
};
const createClient = bedrockModule.createClient ?? bedrockModule.default?.createClient;

if (!createClient) {
	throw new Error("bedrock-protocol createClient is unavailable");
}

let client: any;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let advertisedServerVersion = "unknown";

const normalReconnectDelay = (): number => Number(CONFIG.action?.retryDelay) || 15000;
const versionMismatchDelay = 10 * 60 * 1000;

const formatReason = (value: unknown): string => {
	if (value instanceof Error) return value.stack || value.message;
	if (typeof value === "string") return value;
	try {
		const encoded = JSON.stringify(value);
		return encoded ?? String(value);
	} catch {
		return String(value);
	}
};

const scheduleReconnect = (delay = normalReconnectDelay()): void => {
	if (reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		createBot();
	}, delay);
	console.log(`Trying to reconnect in ${Math.round(delay / 1000)} seconds...`);
};

const isOutdatedClient = (reason: unknown): boolean => formatReason(reason).includes("outdated_client");

const connectionLog = (...messages: unknown[]): void => {
	const line = messages.map(formatReason).join(" ");
	const match = line.match(/version\s+(\d+(?:\.\d+){1,3})/i);
	if (match) advertisedServerVersion = match[1];
	console.log(line);
};

const createBot = (): void => {
	const clientOptions: Record<string, unknown> = {
		host: CONFIG.client.host,
		port: Number(CONFIG.client.port),
		username: CONFIG.client.username,
		offline: true,
		skipPing: false,
		followPort: false,
		connectTimeout: 20000,
		conLog: connectionLog
	};

	const configuredVersion = CONFIG.client.version;
	if (configuredVersion && configuredVersion !== "auto") {
		clientOptions.version = configuredVersion;
	}

	console.log(`Connecting Bedrock bot ${CONFIG.client.username} to ${CONFIG.client.host}:${CONFIG.client.port}...`);
	client = createClient(clientOptions);

	client.on("join", () => {
		console.log(`Bedrock bot joined ${CONFIG.client.host}:${CONFIG.client.port}`);
	});
	client.on("spawn", () => {
		console.log(`Bedrock bot spawned as ${CONFIG.client.username}; keep-alive is active`);
	});
	client.on("heartbeat", () => {
		console.log("Bedrock heartbeat received");
	});
	client.on("kick", (reason: unknown) => {
		const details = formatReason(reason);
		console.error(`Bedrock bot was kicked: ${details}`);
		if (isOutdatedClient(reason)) {
			console.error(`BEDROCK_VERSION_MISMATCH: server advertised ${advertisedServerVersion}; this client currently supports up to 1.26.40. Set the Aternos server to 1.26.40 or wait for bedrock-protocol support for the newer server version.`);
			scheduleReconnect(versionMismatchDelay);
		} else {
			scheduleReconnect();
		}
	});
	client.on("error", (error: unknown) => {
		console.error(`Bedrock bot error: ${formatReason(error)}`);
		scheduleReconnect();
	});
	client.on("close", () => {
		console.log("Bedrock connection closed");
		scheduleReconnect();
	});
};

export default (): void => {
	createBot();
};