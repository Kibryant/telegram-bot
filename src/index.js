import axios from "axios";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const APP = express();
let LAST_SIGNAL = null; // Agora vamos usar essa variável para armazenar o último sinal

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
			"https://data-api.binance.vision/api/v3/exchangeInfo",
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
	if (!LAST_SIGNAL) return;

	const lastSignal = LAST_SIGNAL;
	const currentPrice = await getPrice(lastSignal.symbol);
	if (!currentPrice) return;

	if (
		(lastSignal.type === "PUT" && currentPrice < lastSignal.price) ||
		(lastSignal.type === "CALL" && currentPrice > lastSignal.price)
	) {
		await sendTelegramMessage({
			BOT_TOKEN,
			CHAT_ID,
			message: "✅ *WIN direto!* 🟢",
		});
		LAST_SIGNAL = null;
		return;
	}

	if (lastSignal.gale1) {
		const gale1Expired =
			new Date() >
			new Date(
				`${new Date().toISOString().split("T")[0]} ${lastSignal.gale1.expiration}:00`,
			);

		if (
			!gale1Expired &&
			((lastSignal.gale1.type === "PUT" &&
				currentPrice < lastSignal.gale1.price) ||
				(lastSignal.gale1.type === "CALL" &&
					currentPrice > lastSignal.gale1.price))
		) {
			await sendTelegramMessage({
				BOT_TOKEN,
				CHAT_ID,
				message: "✅ *WIN no 1º GALE!* 🔵",
			});
			LAST_SIGNAL = null;
			return;
		}
	}

	if (lastSignal.gale2) {
		const gale2Expired =
			new Date() >
			new Date(
				`${new Date().toISOString().split("T")[0]} ${lastSignal.gale2.expiration}:00`,
			);

		if (
			!gale2Expired &&
			((lastSignal.gale2.type === "PUT" &&
				currentPrice < lastSignal.gale2.price) ||
				(lastSignal.gale2.type === "CALL" &&
					currentPrice > lastSignal.gale2.price))
		) {
			await sendTelegramMessage({
				BOT_TOKEN,
				CHAT_ID,
				message: "✅ *WIN no 2º GALE!* 🔴",
			});
			LAST_SIGNAL = null;
			return;
		}
	}

	const signalExpired =
		new Date() >
		new Date(
			`${new Date().toISOString().split("T")[0]} ${lastSignal.expiration}:00`,
		);
	const gale1Expired = lastSignal.gale1
		? new Date() >
			new Date(
				`${new Date().toISOString().split("T")[0]} ${lastSignal.gale1.expiration}:00`,
			)
		: true;
	const gale2Expired = lastSignal.gale2
		? new Date() >
			new Date(
				`${new Date().toISOString().split("T")[0]} ${lastSignal.gale2.expiration}:00`,
			)
		: true;

	if (signalExpired && gale1Expired && gale2Expired) {
		await sendTelegramMessage({
			BOT_TOKEN,
			CHAT_ID,
			message: "❌ *LOSS!* 🔴",
		});
		LAST_SIGNAL = null;
	}
}

async function getPrice(symbol) {
	try {
		const response = await axios.get(
			`https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
		);
		return response.data.price;
	} catch (error) {
		console.error(`❌ Erro ao buscar preço do par ${symbol}:`, error);
		return null;
	}
}

function formatTime(date) {
	const options = { timeZone: "America/Sao_Paulo", hour12: false };
	return new Intl.DateTimeFormat("pt-BR", {
		...options,
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function generateExpirationTimes() {
	const now = new Date();
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

		LAST_SIGNAL = {
			symbol: randomSymbol,
			price: price,
			type,
			expiration: times.expiration,
			gale1: {
				price: price * (type === "PUT" ? 1.002 : 0.998),
				type,
				expiration: times.gale1,
			},
			gale2: {
				price: price * (type === "PUT" ? 1.004 : 0.996),
				type,
				expiration: times.gale2,
			},
		};

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

APP.get("/", (_, res) => {
	res.send("🚀 Bot rodando!");
});

APP.get("/health", (_, res) => {
	res.send("👍 Tudo certo!");
});

APP.get("/send-signal", async (_, res) => {
	try {
		await sendTradeSignal();
		res.send("✅ Sinal enviado com sucesso!");
	} catch (error) {
		console.error("❌ Erro ao enviar sinal:", error);
		res.status(500).send("Erro ao enviar sinal.");
	}
});

APP.get("/check-win-or-gale", async (_, res) => {
	try {
		await checkWinOrGale();
		res.send("✅ Verificação de win ou gale concluída!");
	} catch (error) {
		console.error("❌ Erro ao verificar win ou gale:", error);
		res.status(500).send("Erro ao verificar win ou gale.");
	}
});

const PORT = process.env.PORT || 3000;
APP.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
