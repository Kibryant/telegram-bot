import axios from "axios";
import fs from "node:fs";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const FILE_PATH = "./data/signals.json";

const APP = express();

async function sendTelegramMessage({ BOT_TOKEN, CHAT_ID, message }) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

	await axios.post(url, {
		chat_id: CHAT_ID,
		text: message,
		parse_mode: "Markdown",
	});
}

async function getAllSymbols() {
	try {
		const response = await axios.get(
			"https://api.binance.com/api/v3/exchangeInfo",
		);

		const symbols = response.data.symbols
			.filter((s) => s.status === "TRADING")
			.map((s) => s.symbol);
		return symbols;
	} catch (error) {
		console.error("❌ Erro ao buscar os pares:", error);
		return [];
	}
}

async function checkWinOrGale() {
	if (!fs.existsSync(FILE_PATH)) return;

	const signals = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
	const lastSignal = signals[signals.length - 1];
	if (!lastSignal) return;

	const currentPrice = await getPrice(lastSignal.symbol);

	if (!currentPrice) return;

	let winMessage = null;

	if (lastSignal.type === "PUT" && currentPrice < lastSignal.price) {
		winMessage = "✅ *WIN direto!* 🟢";
	} else if (lastSignal.type === "CALL" && currentPrice > lastSignal.price) {
		winMessage = "✅ *WIN direto!* 🟢";
	} else if (
		lastSignal.gale1 &&
		lastSignal.gale1.type === "PUT" &&
		currentPrice < lastSignal.gale1.price
	) {
		winMessage = "✅ *WIN no 1º GALE!* 🔵";
	} else if (
		lastSignal.gale1 &&
		lastSignal.gale1.type === "CALL" &&
		currentPrice > lastSignal.gale1.price
	) {
		winMessage = "✅ *WIN no 1º GALE!* 🔵";
	} else if (
		lastSignal.gale2 &&
		lastSignal.gale2.type === "PUT" &&
		currentPrice < lastSignal.gale2.price
	) {
		winMessage = "✅ *WIN no 2º GALE!* 🔴";
	} else if (
		lastSignal.gale2 &&
		lastSignal.gale2.type === "CALL" &&
		currentPrice > lastSignal.gale2.price
	) {
		winMessage = "✅ *WIN no 2º GALE!* 🔴";
	}

	if (winMessage) {
		await sendTelegramMessage({
			BOT_TOKEN,
			CHAT_ID,
			message: winMessage,
		});

		console.log(winMessage);
	}
}

async function getPrice(symbol) {
	try {
		const response = await axios.get(
			`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
		);
		return response.data.price;
	} catch (error) {
		console.error(`❌ Erro ao buscar preço do par ${symbol}:`, error);
		return null;
	}
}

function generateExpirationTimes() {
	const now = new Date();

	function formatTime(date) {
		return date.toTimeString().split(" ")[0].substring(0, 5);
	}

	const expiration = new Date(now.getTime() + 5 * 60000);
	const gale1 = new Date(expiration.getTime() + 5 * 60000);
	const gale2 = new Date(gale1.getTime() + 5 * 60000);

	return {
		expiration: formatTime(expiration),
		gale1: formatTime(gale1),
		gale2: formatTime(gale2),
	};
}

async function sendTradeSignal() {
	try {
		const symbols = await getAllSymbols();

		if (symbols.length === 0) return;

		const type = Math.random() > 0.5 ? "PUT" : "CALL";

		const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];

		const price = await getPrice(randomSymbol);

		if (!price) return;

		const times = generateExpirationTimes();

		const signal = {
			symbol: randomSymbol,
			price: price,
			type,
			expiration: times.expiration,
			gale1: {
				price: price * (type === "PUT" ? 1.002 : 0.998),
				type,
			},
			gale2: {
				price: price * (type === "PUT" ? 1.004 : 0.996),
				type,
			},
		};

		let signals = [];

		if (fs.existsSync(FILE_PATH)) {
			signals = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
		}

		signals.push(signal);

		fs.writeFileSync(FILE_PATH, JSON.stringify(signals, null, 2));

		const message = `
💰 *5 minutos de expiração*
${randomSymbol};${times.expiration};${type === "PUT" ? "PUT 🟥" : "CALL 🟩"}

🕐 *TEMPO PARA ${times.expiration}*

1º GALE — TEMPO PARA ${times.gale1}
2º GALE — TEMPO PARA ${times.gale2}

📲 [Clique para abrir a corretora](https://www.binance.com)
🙋‍♂️ [Não sabe operar ainda? Clique aqui](https://t.me/seu_grupo_aqui)
    `;

		await sendTelegramMessage({
			BOT_TOKEN,
			CHAT_ID,
			message,
		});

		console.log("📨 Sinal enviado com sucesso!");
	} catch (error) {
		console.error("❌ Erro ao gerar o sinal de trade:", error);
	}
}

async function main() {
    await sendTradeSignal();
    await checkWinOrGale();
}

APP.get("/", (_, res) => {
    res.send("🚀 Bot rodando!");
});

APP.get("/health", (_, res) => {
    res.send("👍 Tudo certo!");
});

APP.get("/run-bot", async (_, res) => {
	try {
		await main();
		res.send("✅ Bot executado com sucesso!");
	} catch (error) {
		console.error("❌ Erro ao executar bot:", error);
		res.status(500).send("Erro ao executar bot.");
	}
});

const PORT = process.env.PORT || 3000;

APP.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
