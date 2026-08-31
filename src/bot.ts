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

const reconnectDelay = (): number => Number(CONFIG.action.retryDelay) || 15000;

const scheduleReconnect = (): void => {
	if (reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		createBot();
	}, reconnectDelay());
	console.log(`Trying to reconnect in ${reconnectDelay() / 1000} seconds...`);
};

const formatReason = (reason: unknown): string => {
	if (reason instanceof Error) return reason.stack || reason.message;
	if (typeof reason === "string") return reason;
	try {
		return JSON.stringify(reason);
	} catch {
		return String(reason);
	}
};

const createBot = (): void => {
	console.log(`Connecting Bedrock bot ${CONFIG.client.username} to ${CONFIG.client.host}:${CONFIG.client.port}...`);
	client = createClient({
		host: CONFIG.client.host,
		port: Number(CONFIG.client.port),
		username: CONFIG.client.username,
		offline: true,
		conLog: console.log
	});

	client.on("join", () => {
		console.log(`Bedrock bot joined ${CONFIG.client.host}:${CONFIG.client.port}`);
	});
	client.on("spawn", () => {
		console.log(`Bedrock bot spawned as ${CONFIG.client.username}`);
	});
	client.on("heartbeat", () => {
		console.log("Bedrock heartbeat received");
	});
	client.on("kick", (reason: unknown) => {
		console.error(`Bedrock bot was kicked: ${formatReason(reason)}`);
		scheduleReconnect();
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